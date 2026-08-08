DROP FUNCTION IF EXISTS public.bootstrap_account();

CREATE OR REPLACE FUNCTION public.bootstrap_account()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  uemail TEXT := nullif(auth.jwt() ->> 'email', '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (uid, uemail, split_part(coalesce(uemail,''), '@', 1))
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE user_id = uid) THEN
    INSERT INTO public.workspaces (user_id, name, description, is_default)
    VALUES (uid, 'Personal', 'Your default workspace', true);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.bootstrap_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_account() TO authenticated;

-- subscriptions row is created by the server (service role) since users cannot write it
GRANT INSERT ON public.subscriptions TO service_role;