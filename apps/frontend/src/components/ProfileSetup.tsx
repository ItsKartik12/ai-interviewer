import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  FileText,
  GraduationCap,
  Github,
  Loader2,
  Sparkles,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { AppHeader } from "./AppHeader";
import {
  FormSection,
  PageShell,
  ResumeUploader,
  type ParsedResumeContext,
} from "./ui/shared";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const levels = ["Beginner", "Intermediate", "Advanced"] as const;

export type UserProfileDto = {
  uid: string;
  email: string;
  name: string | null;
  targetRole: string | null;
  experienceLevel: string | null;
  skills: string[];
  education: string | null;
  githubUrl: string | null;
  bio: string | null;
  resumeFileName?: string | null;
  resumeContext?: ParsedResumeContext | null;
  profileComplete: boolean;
};

export async function fetchProfile(): Promise<UserProfileDto | null> {
  const res = await api.get("/api/v1/profile");
  return (res.data?.profile as UserProfileDto) ?? null;
}

export function ProfileSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [education, setEducation] = useState("");
  const [level, setLevel] = useState<string>("");
  const [targetRole, setTargetRole] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeContext, setResumeContext] = useState<ParsedResumeContext | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the saved profile; fall back to Firebase display name.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchProfile();
        if (cancelled || !p) return;
        setName((current) => current || p.name || "");
        setEducation((current) => current || p.education || "");
        setLevel((current) => current || p.experienceLevel || "");
        setTargetRole((current) => current || p.targetRole || "");
        setGithubUrl((current) => current || p.githubUrl || "");
        setResumeFileName(p.resumeFileName ?? null);
        setResumeContext(p.resumeContext ?? null);
      } catch {
        /* first-time users simply have no profile yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Firebase displayName prefill while the profile fetch is in flight.
  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.displayName]);

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    if (!level) return "Choose your experience level.";
    if (!targetRole.trim()) return "Enter your preferred technical role.";
    if (githubUrl.trim() && !/^https?:\/\/.+/.test(githubUrl.trim()))
      return "GitHub URL must start with http:// or https://";
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Note: technical skills are intentionally NOT part of the profile —
      // they are interview-specific and recommended by the AI per interview.
      await api.patch("/api/v1/profile", {
        name: name.trim(),
        education: education.trim() || undefined,
        experienceLevel: level,
        targetRole: targetRole.trim(),
        githubUrl: githubUrl.trim() || "",
        // Empty file name clears both resume fields server-side.
        resumeFileName: resumeFileName ?? "",
        resumeContext: resumeContext ?? undefined,
        profileComplete: true,
      });

      navigate("/", { replace: true });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not save your profile. Please try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <AppHeader />
      <div className="animate-fade-up mx-auto flex w-full max-w-5xl flex-col gap-8 px-3.5 py-6 sm:px-6 sm:py-10 md:px-8">
        {/* Header */}
        <section className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5 text-primary" />
            One-time setup
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            Build your{" "}
            <span className="text-primary">interview profile</span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Tell us about yourself so we can personalize every interview. Skills are
            recommended by the AI for each interview — no need to list them here.
          </p>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-5">
          {/* Left column — identity & background */}
          <div className="flex flex-col gap-5 lg:col-span-3">
            <FormSection
              icon={User}
              title="Basic Information"
              description="Who you are and how senior you are today."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="setup-name">Full name</Label>
                  <Input
                    id="setup-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="setup-level">Experience level</Label>
                  <Select value={level} onValueChange={setLevel} disabled={saving}>
                    <SelectTrigger id="setup-level" className="w-full">
                      <SelectValue placeholder="Choose your level" />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormSection>

            <FormSection
              icon={GraduationCap}
              title="Career & Background"
              description="Your target role and education calibrate the AI's expectations."
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="setup-role">Preferred technical role</Label>
                  <Input
                    id="setup-role"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Frontend Developer, Backend Engineer, Data Scientist"
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="setup-education">
                    Education{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="setup-education"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    placeholder="e.g. B.Tech Computer Science, XYZ University, 2026"
                    className="min-h-20"
                    disabled={saving}
                  />
                </div>
              </div>
            </FormSection>
          </div>

          {/* Right column — work evidence */}
          <div className="flex flex-col gap-5 lg:col-span-2">
            <FormSection
              icon={Github}
              title="GitHub Profile"
              badge="Optional"
              description="Help the AI understand your projects and coding experience."
            >
              <div className="grid gap-2">
                <Label htmlFor="setup-github">GitHub URL</Label>
                <Input
                  id="setup-github"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/your-username"
                  className="bg-background"
                  disabled={saving}
                />
                <span className="text-xs leading-relaxed text-muted-foreground">
                  If provided, public repositories are referenced for project
                  deep-dive questions during interviews.
                </span>
              </div>
            </FormSection>

            <FormSection
              icon={FileText}
              title="Resume"
              badge="Optional"
              description="Upload your resume so the AI can personalize your interview."
            >
              <ResumeUploader
                fileName={resumeFileName}
                parsedContext={resumeContext}
                disabled={saving}
                onChange={(next) => {
                  setResumeFileName(next.fileName);
                  setResumeContext(next.context);
                }}
              />
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Stored once here — every future interview is personalized
                automatically. Only the parsed content is saved, never the file itself.
              </span>
            </FormSection>
          </div>

          {/* Action bar */}
          <div className="flex flex-col gap-3 lg:col-span-5">
            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border p-4 sm:flex-row sm:p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                You can update any of this later from your profile page.
              </p>
              <Button
                type="submit"
                disabled={saving}
                size="lg"
                className="w-full gap-2 sm:w-auto"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {saving ? "Saving…" : "Save Profile & Continue"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
