-- ============================================================
-- Phases 4-7: AI Employees, Company Brain, Usage Limits, Billing
-- ============================================================

-- ---- AI Employee conversations (separate from document analyst) ----
CREATE TYPE public.ai_employee AS ENUM (
  'writing', 'business_analyst', 'hr', 'sales', 'training', 'legal'
);

ALTER TYPE public.ai_employee ADD VALUE IF NOT EXISTS 'writing';
ALTER TYPE public.ai_employee ADD VALUE IF NOT EXISTS 'business_analyst';
ALTER TYPE public.ai_employee ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.ai_employee ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE public.ai_employee ADD VALUE IF NOT EXISTS 'training';
ALTER TYPE public.ai_employee ADD VALUE IF NOT EXISTS 'legal';

-- ---- Team members for Business plan ----
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'member',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ,
  UNIQUE (workspace_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members_manage" ON public.team_members FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.user_id = auth.uid()
    )
  );
CREATE POLICY "team_members_view" ON public.team_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.user_id = auth.uid()
    )
  );

-- ---- User role enum for team members ----
CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'member';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'viewer';

-- ---- Storage tracking ----
CREATE TABLE public.storage_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bytes_used BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.storage_usage TO authenticated;
GRANT ALL ON public.storage_usage TO service_role;
ALTER TABLE public.storage_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "storage_usage_own" ON public.storage_usage FOR ALL TO authenticated
  USING (auth.uid() = user_id);
CREATE TRIGGER storage_usage_updated_at BEFORE UPDATE ON public.storage_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- Subscription: add cancelled_at ----
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- ---- Usage events: add plan and employee type for AI employees ----
ALTER TABLE public.usage_events ADD COLUMN IF NOT EXISTS employee_type public.ai_employee;
ALTER TABLE public.usage_events ADD COLUMN IF NOT EXISTS tokens_used INTEGER NOT NULL DEFAULT 0;

-- ---- Helper: get user plan limits ----
CREATE OR REPLACE FUNCTION public.get_plan_limits(_plan public.subscription_plan)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  limits JSONB;
BEGIN
  SELECT jsonb_build_object(
    'documents_per_month', CASE _plan
      WHEN 'free'     THEN 10
      WHEN 'starter'  THEN 100
      WHEN 'pro'      THEN 500
      WHEN 'business' THEN 2000
      ELSE 10 END,
    'pages_per_document', CASE _plan
      WHEN 'free'     THEN 20
      WHEN 'starter'  THEN 50
      WHEN 'pro'      THEN 200
      WHEN 'business' THEN 500
      ELSE 20 END,
    'ai_messages_per_month', CASE _plan
      WHEN 'free'     THEN 50
      WHEN 'starter'  THEN 1000
      WHEN 'pro'      THEN 5000
      WHEN 'business' THEN 20000
      ELSE 50 END,
    'storage_bytes', CASE _plan
      WHEN 'free'     THEN 100 * 1024 * 1024
      WHEN 'starter'  THEN 5 * 1024 * 1024 * 1024
      WHEN 'pro'      THEN 50 * 1024 * 1024 * 1024
      WHEN 'business' THEN 250 * 1024 * 1024 * 1024
      ELSE 100 * 1024 * 1024 END,
    'max_workspaces', CASE _plan
      WHEN 'free'     THEN 1
      WHEN 'starter'  THEN 3
      WHEN 'pro'      THEN 10
      WHEN 'business' THEN -1  -- unlimited
      ELSE 1 END,
    'team_members', CASE _plan
      WHEN 'business' THEN 10
      ELSE 0 END
  ) INTO limits;
  RETURN limits;
END; $$;
REVOKE ALL ON FUNCTION public.get_plan_limits(subscription_plan) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_plan_limits(subscription_plan) TO authenticated;

-- ---- Helper: get current period message count ----
CREATE OR REPLACE FUNCTION public.get_monthly_usage(_user_id UUID, _event_type public.usage_event_type)
RETURNS INTEGER LANGUAGE plpgsql STABLE AS $$
DECLARE
  period_start TIMESTAMPTZ;
  cnt INTEGER;
BEGIN
  SELECT date_trunc('month', now()) INTO period_start;
  SELECT COALESCE(SUM(quantity), 0) INTO cnt
  FROM public.usage_events
  WHERE user_id = _user_id
    AND event_type = _event_type
    AND created_at >= period_start;
  RETURN cnt;
END; $$;
REVOKE ALL ON FUNCTION public.get_monthly_usage(UUID, usage_event_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_usage(UUID, usage_event_type) TO authenticated;

-- ---- Helper: update storage usage after document upload/delete ----
CREATE OR REPLACE FUNCTION public.update_storage_usage(_user_id UUID, _delta BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.storage_usage (user_id, bytes_used, updated_at)
  VALUES (_user_id, GREATEST(0, _delta), now())
  ON CONFLICT (user_id) DO UPDATE SET
    bytes_used = GREATEST(0, storage_usage.bytes_used + _delta),
    updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.update_storage_usage(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_storage_usage(UUID, BIGINT) TO service_role;

-- ---- Cross-workspace company brain search (all user docs) ----
CREATE OR REPLACE FUNCTION public.search_company_brain(
  _user_id UUID,
  _query TEXT,
  _limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  document_name TEXT,
  chunk_index INTEGER,
  content TEXT,
  page_number INTEGER,
  heading TEXT,
  rank REAL
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    c.id, c.document_id, d.name AS document_name,
    c.chunk_index, c.content, c.page_number, c.heading,
    ts_rank(c.search_vector, websearch_to_tsquery('english', _query)) AS rank
  FROM public.document_chunks c
  JOIN public.documents d ON d.id = c.document_id
  WHERE c.user_id = _user_id
    AND d.status = 'ready'
    AND c.search_vector @@ websearch_to_tsquery('english', _query)
  ORDER BY rank DESC, c.chunk_index ASC
  LIMIT greatest(1, least(_limit, 40));
$$;
REVOKE ALL ON FUNCTION public.search_company_brain(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_company_brain(UUID, TEXT, INTEGER) TO authenticated;
