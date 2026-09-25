import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router";
import {
  Bot,
  History,
  Loader2,
  Lock,
  Mail,
  Mic,
  Sparkles,
  User,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

const HIGHLIGHTS = [
  { icon: Mic, text: "Voice-driven mock interviews with live transcription" },
  { icon: Bot, text: "Adaptive AI interviewer that follows up like a real one" },
  { icon: Sparkles, text: "Evidence-based skill scoring you can trust" },
  { icon: History, text: "Track your progression across interviews" },
] as const;

export function Login() {
  const { user, loading, configured, signUp, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  if (!configured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-lg bg-primary/10">
            <Bot className="size-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            Authentication not configured
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sign-in requires Firebase configuration. Set the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">PUBLIC_FIREBASE_*</code>{" "}
            variables in your environment and reload this page.
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  /**
   * Switching modes must ALWAYS start from a clean form: no typed values from
   * the other mode, no previous user's data, nothing from the authenticated
   * session. (Fields are also empty on first mount by useState defaults.)
   */
  function switchMode(next: Mode) {
    setMode(next);
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password, name.trim());
        // New users land on profile setup (route guard in App.tsx handles it).
        navigate("/profile/setup", { replace: true });
      } else {
        await signIn(email.trim(), password);
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Enter your email above first, then click reset.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setNotice("Password reset email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
        {/* Value proposition — desktop only */}
        <section className="hidden lg:block">
          <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            AI-Powered Interview Practice
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-[2.75rem] xl:leading-[1.15]">
            Interview with confidence.
            <br />
            <span className="text-primary">Backed by evidence.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Practice realistic technical interviews with an adaptive AI interviewer,
            refine your answers with editable transcripts, and see exactly which
            skills you demonstrated — and which to work on next.
          </p>
          <ul className="mt-8 grid gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/60">
                  <Icon className="size-4 text-primary" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>

        {/* Auth card */}
        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-lg bg-primary/10">
              <Sparkles className="size-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AI Interviewer</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to start your adaptive mock interviews."
                : "Create an account to start your adaptive mock interviews."}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
            {/* Segmented mode switch */}
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === m
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "signin" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4" autoComplete="off">
              {mode === "signup" && (
                <div className="grid gap-2">
                  <Label htmlFor="name">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      // Never auto-fill the signup name from a previous
                      // user's profile or the browser's saved identities.
                      autoComplete="off"
                      className="pl-9"
                      disabled={busy}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    // "off" on signup (start empty), username autofill allowed
                    // on sign-in for the user's own saved credentials.
                    autoComplete={mode === "signup" ? "off" : "username"}
                    className="pl-9"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => void handleReset()}
                      className="text-xs text-muted-foreground transition-colors hover:text-primary"
                      disabled={busy}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="pl-9"
                    disabled={busy}
                  />
                </div>
              </div>

              {mode === "signup" && (
                <div className="grid gap-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      className="pl-9"
                      disabled={busy}
                    />
                  </div>
                  {confirmPassword.length > 0 && confirmPassword !== password && (
                    <span className="text-xs text-destructive">
                      Passwords do not match.
                    </span>
                  )}
                </div>
              )}

              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                  {notice}
                </p>
              )}

              <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "signin" ? "Sign In" : "Create Account"}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Secured by Firebase Authentication — passwords are never stored on our servers.
          </p>
        </section>
      </div>
    </main>
  );
}
