import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  Brain,
  Files,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/documents", label: "Documents", icon: Files },
  { to: "/employees", label: "AI Employees", icon: Bot },
  { to: "/brain", label: "Company Brain", icon: Brain },
  { to: "/workspaces", label: "Workspaces", icon: FolderKanban },
  { to: "/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/team", label: "Team", icon: Users },
  { to: "/usage", label: "Usage", icon: BarChart3 },
] as const;

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({ to: "/auth", search: { mode: "signin", redirect: undefined }, replace: true });
  }

  const initials =
    (profile?.full_name ?? profile?.email ?? "U")
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  const sidebar = (
    <div className="flex h-full flex-col gap-2 bg-ink px-4 py-5 text-ink-foreground">
      <div className="flex items-center justify-between px-1 pb-4">
        <Logo onInk />
        <button
          className="text-ink-muted hover:text-ink-foreground lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-gold/15 text-gold"
                  : "text-ink-muted hover:bg-white/5 hover:text-ink-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-1">
          <Avatar className="size-8">
            <AvatarFallback className="bg-gold/20 text-xs font-semibold text-gold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-foreground">
              {profile?.full_name ?? "Your account"}
            </p>
            <p className="truncate text-xs text-ink-muted">{profile?.email}</p>
          </div>
        </div>
        <Button
          variant="onInk"
          size="sm"
          className="mt-3 w-full justify-start"
          onClick={handleSignOut}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-lift">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-start gap-4 px-4 py-4 sm:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-xl font-semibold">{title}</h1>
              {description && (
                <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>
        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
