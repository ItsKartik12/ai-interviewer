import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  FileText,
  GraduationCap,
  Github,
  Loader2,
  Save,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
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
import { fetchProfile, type UserProfileDto } from "./ProfileSetup";

const levels = ["Beginner", "Intermediate", "Advanced"] as const;

export function Profile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [education, setEducation] = useState("");
  const [level, setLevel] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeContext, setResumeContext] = useState<ParsedResumeContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchProfile();
        if (cancelled) return;
        setProfile(p);
        setName(p?.name ?? "");
        setEducation(p?.education ?? "");
        setLevel(p?.experienceLevel ?? "");
        setTargetRole(p?.targetRole ?? "");
        setGithubUrl(p?.githubUrl ?? "");
        setResumeFileName(p?.resumeFileName ?? null);
        setResumeContext(p?.resumeContext ?? null);
      } catch {
        if (!cancelled) setError("Could not load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !level || !targetRole.trim()) {
      setError("Name, experience level, and preferred role are required.");
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      // Technical skills intentionally absent — they are interview-specific.
      const res = await api.patch("/api/v1/profile", {
        name: name.trim(),
        education: education.trim() || undefined,
        experienceLevel: level,
        targetRole: targetRole.trim(),
        githubUrl: githubUrl.trim() || "",
        resumeFileName: resumeFileName ?? "",
        resumeContext: resumeContext ?? undefined,
        profileComplete: true,
      });
      setProfile(res.data?.profile ?? profile);
      setSaved(true);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not save changes. Please try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <PageShell>
      <AppHeader />
      <div className="animate-fade-up mx-auto flex w-full max-w-5xl flex-col gap-8 pt-12 sm:pt-16">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your Profile
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Signed in as {profile?.email ?? "user"} — this information pre-fills
              every interview configuration.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")} className="gap-1.5">
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-5">
          <div className="flex flex-col gap-5 lg:col-span-3">
            <FormSection
              icon={User}
              title="Basic Information"
              description="Who you are and how senior you are today."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="profile-name">Full name</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-level">Experience level</Label>
                  <Select value={level} onValueChange={setLevel} disabled={saving}>
                    <SelectTrigger id="profile-level" className="w-full">
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
                  <Label htmlFor="profile-role">Preferred technical role</Label>
                  <Input
                    id="profile-role"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-education">
                    Education{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="profile-education"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    className="min-h-20"
                    disabled={saving}
                  />
                </div>
              </div>
            </FormSection>
          </div>

          <div className="flex flex-col gap-5 lg:col-span-2">
            <FormSection
              icon={Github}
              title="GitHub Profile"
              badge="Optional"
              description="Help the AI understand your projects and coding experience."
            >
              <div className="grid gap-2">
                <Label htmlFor="profile-github">GitHub URL</Label>
                <Input
                  id="profile-github"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  className="bg-background"
                  disabled={saving}
                />
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
              {resumeFileName && (
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Replace or remove your resume any time. Only the parsed content is
                  stored, never the file itself.
                </span>
              )}
            </FormSection>
          </div>

          <div className="flex flex-col gap-3 lg:col-span-5">
            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {saved && (
              <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
                Profile saved.
              </p>
            )}
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border p-4 sm:flex-row sm:p-5">
              <p className="text-xs text-muted-foreground">
                Changes apply to all future interviews.
              </p>
              <Button
                type="submit"
                disabled={saving}
                className="w-full gap-2 sm:w-auto"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
