import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — OmniParse AI" },
      {
        name: "description",
        content: "Sign in or create your OmniParse AI account to upload documents and ask questions.",
      },
      { property: "og:title", content: "Sign in — OmniParse AI" },
      { property: "og:description", content: "Access your OmniParse AI document workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(255),
  password: z.string().min(8, "Use at least 8 characters.").max(72),
});

function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

const PENDING_KEY = "omniparse:auth-redirect";

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const destination = safeRedirect(search.redirect);

  useEffect(() => {
    let active = true;

    const go = () => {
      if (!active) return;
      const stored = window.sessionStorage.getItem(PENDING_KEY);
      window.sessionStorage.removeItem(PENDING_KEY);
      navigate({ to: safeRedirect(stored ?? destination), replace: true });
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) go();
      })
      .catch(() => {
        /* no session available — stay on the auth page */
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) go();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [destination, navigate]);


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }
    setPending(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}${destination}`,
            ...(fullName.trim() ? { data: { full_name: fullName.trim() } } : {}),
          },

        });
        if (error) throw error;
        if (!data.session) {
          setConfirmSent(true);
          return;
        }
        toast.success("Account created. Welcome to OmniParse AI.");
        navigate({ to: destination, replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success("Signed in.");
        navigate({ to: destination, replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    setGooglePending(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: destination, replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="ink-panel relative hidden flex-col justify-between p-12 lg:flex">
        <div className="grid-backdrop absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative">
          <Logo onInk />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight text-ink-foreground">
            An analyst who has actually read the file.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Upload a document, wait for processing, then ask anything. Every answer points back to
            the page it came from — and admits when the document is silent.
          </p>
        </div>
        <p className="relative text-xs text-ink-muted">Private storage · Per-user isolation</p>
      </div>

      <div className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo />
          </div>

          {confirmSent ? (
            <div className="surface-panel p-7 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <MailCheck className="size-5" />
              </span>
              <h1 className="mt-4 text-xl font-semibold">Confirm your email</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                We sent a confirmation link to <span className="font-medium">{email}</span>. Click it
                to activate your account, then sign in.
              </p>
              <Button
                className="mt-6 w-full"
                variant="outline"
                onClick={() => {
                  setConfirmSent(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to your document workspace."
                  : "Start with a free workspace — no card required."}
              </p>

              <Tabs
                value={mode}
                onValueChange={(value) => setMode(value as "signin" | "signup")}
                className="mt-6"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>
              </Tabs>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      autoComplete="name"
                      maxLength={80}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Alex Morgan"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    maxLength={255}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    minLength={8}
                    maxLength={72}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={googlePending}
              >
                {googlePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GoogleMark />
                )}
                Continue with Google
              </Button>

              <p className="mt-8 text-center text-xs text-muted-foreground">
                <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
                  <ArrowLeft className="size-3" /> Back to homepage
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2a7 7 0 0 1-6.6-4.8H1.4v3.1A11.9 11.9 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.5a7.1 7.1 0 0 1 0-4.6V6.8H1.4a11.9 11.9 0 0 0 0 10.7l4-3Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.6 11.6 0 0 0 12 0 11.9 11.9 0 0 0 1.4 6.8l4 3.1A7 7 0 0 1 12 4.8Z"
      />
    </svg>
  );
}
