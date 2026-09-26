import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Github,
  Layers,
  Loader2,
  Mic,
  Sparkles,
  UploadCloud,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fetchProfile, type UserProfileDto } from "./ProfileSetup";
import { TECH_ROLE_CATEGORIES } from "@/data/techRoles";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AppHeader } from "./AppHeader";
import { PageShell } from "./ui/shared";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const levels = ["Beginner", "Intermediate", "Advanced"] as const;
type Field = "github" | "level" | "company" | "role" | "resume";
type FieldErrors = Partial<Record<Field, string>>;

interface ResumeContext {
  candidateName?: string;
  education?: string[];
  experience?: string[];
  projects?: string[];
  technologies?: string[];
  responsibilities?: string[];
  achievements?: string[];
  certifications?: string[];
}

interface PdfState {
  file: File | null;
  parsing: boolean;
  parsed: boolean;
  resumeContext: ResumeContext | null;
  error: string | null;
}

function getImportanceBadge(importance?: string) {
  if (!importance) return null;
  const map: Record<string, { label: string; className: string }> = {
    core: { label: "Core", className: "bg-primary/10 text-primary border-primary/20" },
    important: { label: "Important", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    high: { label: "High", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    bonus: { label: "Bonus", className: "bg-muted text-muted-foreground border-border" },
    medium: { label: "Medium", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  };
  const entry = map[importance.toLowerCase()];
  if (!entry) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${entry.className}`}
    >
      {entry.label}
    </span>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SkillItem {
  skill: string;
  importance?: "core" | "important" | "bonus" | "high" | "medium";
  rationale?: string;
  reason?: string;
}

interface RoleSkillRequirement {
  role: string;
  company?: string;
  level: string;
  technicalSkills: SkillItem[];
  softSkills: SkillItem[];
  summary?: string;
}

export function Form() {
  const [step, setStep] = useState<1 | 2>(1);
  const [github, setGithub] = useState("");
  const [roleCategory, setRoleCategory] = useState<string>("");
  const [level, setLevel] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [roleSkills, setRoleSkills] = useState<RoleSkillRequirement | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedSoftSkills, setSelectedSoftSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [pdfState, setPdfState] = useState<PdfState>({
    file: null,
    parsing: false,
    parsed: false,
    resumeContext: null,
    error: null,
  });

  // --- Load persistent profile: prefill saved fields, redirect if incomplete ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchProfile();
        if (cancelled) return;
        if (!p || !p.profileComplete) {
          navigate("/profile/setup", { replace: true });
          return;
        }
        setProfile(p);
        if (!role && p.targetRole) setRole(p.targetRole);
        if (!company && p.githubUrl === "" && p.targetRole) {
          // no company stored in profile — leave blank for per-interview choice
        }
        if (!level && p.experienceLevel) setLevel(p.experienceLevel);
        if (!github && p.githubUrl) setGithub(p.githubUrl);
      } catch {
        // 401 interceptor handles sign-out; other errors just skip prefill
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- PDF handling ---

  async function parsePdf(file: File) {
    setPdfState({ file, parsing: true, parsed: false, resumeContext: null, error: null });
    setErrors((current) => ({ ...current, resume: undefined }));
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const response = await api.post("/api/v1/parse-pdf", {
        pdfBase64: base64,
        fileName: file.name,
      });
      setPdfState({
        file,
        parsing: false,
        parsed: true,
        resumeContext: response.data.resumeContext ?? null,
        error: null,
      });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? "Unable to parse PDF.")
        : "Unable to parse PDF.";
      setPdfState({ file, parsing: false, parsed: false, resumeContext: null, error: message });
    }
  }

  function validateFile(file: File): string | null {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
      return "Only PDF files are accepted.";
    if (file.size === 0) return "The file is empty.";
    if (file.size > 10 * 1024 * 1024) return "File exceeds the 10 MB limit.";
    return null;
  }

  function handleFileSelect(file: File) {
    const err = validateFile(file);
    if (err) {
      setPdfState((prev) => ({ ...prev, file: null, parsed: false, error: err }));
      return;
    }
    void parsePdf(file);
  }

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, []);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => setIsDragOver(false);

  function removePdf() {
    setPdfState({ file: null, parsing: false, parsed: false, resumeContext: null, error: null });
  }

  // --- Validation ---

  function validate(): FieldErrors {
  return {
    ...(role.trim() ? {} : { role: "Specify a target role." }),
    ...(level ? {} : { level: "Choose your current level." }),
    ...(company.trim() ? {} : { company: "Add a target company." }),
  };
}

  const fieldClass = (field: Field) =>
    errors[field] ? "border-destructive focus-visible:ring-destructive/30" : "";
  const clearError = (field: Field) =>
    setErrors((current) => ({ ...current, [field]: undefined }));

  // --- Step 1 → Step 2 ---

  async function handleAnalyzeRole() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setAnalyzing(true);
    let fetchedSkills: RoleSkillRequirement | null = null;
    try {
      const response = await api.post("/api/v1/analyze-role", {
        role: role.trim(),
        company: company.trim(),
        level,
        // Enrich AI recommendations with the candidate's GitHub + parsed resume
        // (profile-level fallback when no per-interview upload).
        githubUrl: github.trim() || profile?.githubUrl || undefined,
        resumeContext:
          pdfState.resumeContext ?? profile?.resumeContext ?? undefined,
      });
      if (response.data?.roleSkills) fetchedSkills = response.data.roleSkills as RoleSkillRequirement;
    } catch { /* fallback below */ }
    finally { setAnalyzing(false); }

    const resolved = fetchedSkills ?? {
      role: role.trim(), company: company.trim(), level,
      technicalSkills: [
        { skill: "Core Engineering", importance: "core" as const, rationale: `Primary technical focus for ${role.trim()} positions.` },
        { skill: "System Design & Architecture", importance: "important" as const, rationale: "Evaluates scalable structure and design patterns." },
        { skill: "Code Quality & Testing", importance: "important" as const, rationale: "Ensures maintainable and reliable engineering standards." },
      ],
      softSkills: [
        { skill: "Technical Communication", importance: "core" as const, rationale: "Ability to explain complex decisions clearly." },
        { skill: "Problem Solving", importance: "core" as const, rationale: "Structured thinking when addressing ambiguous requirements." },
      ],
      summary: `Tailored evaluation for ${role.trim()} at ${company.trim()}.`,
    };
    setRoleSkills(resolved);

    // Pre-select core + important TECHNICAL skills; soft skills default to
    // the top two AI picks — the user can change any of it.
    const techDefaults = resolved.technicalSkills
      .filter((s) => s.importance === "core" || s.importance === "high" || s.importance === "important")
      .map((s) => s.skill);
    setSelectedSkills(techDefaults.length > 0 ? techDefaults : resolved.technicalSkills.slice(0, 2).map((s) => s.skill));
    setSelectedSoftSkills(resolved.softSkills.slice(0, 2).map((s) => s.skill));
    setCustomSkillInput("");

    setStep(2);
  }

  // --- Skill toggle ---

  function toggleSkill(skillName: string) {
    setSelectedSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName]
    );
  }

  function toggleSoftSkill(skillName: string) {
    setSelectedSoftSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName]
    );
  }

  function addCustomSkill() {
    const name = customSkillInput.trim();
    if (!name) return;
    if (selectedSkills.includes(name)) {
      setCustomSkillInput("");
      return;
    }
    setSelectedSkills((prev) => [...prev, name]);
    setCustomSkillInput("");
  }

  // --- Start interview ---

  async function onStartInterview() {
    if (selectedSkills.length === 0) {
      toast("Select at least one skill to focus on before starting.");
      return;
    }
    setStarting(true);
    try {
      const response = await api.post("/api/v1/pre-interview", {
        github: github.trim(),
        skill: selectedSkills[0] ?? "",
        selectedSkills,
        selectedSoftSkills,
        level,
        company: company.trim(),
        role: role.trim(),
        roleSkills,
        resumeContext: pdfState.resumeContext ?? undefined,
      });
      navigate(`/interview/${response.data.id}`);
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
      toast(message ?? "Unable to prepare your interview. Please try again.");
      setStarting(false);
    }
  }


  // --- Computed ---

  const expectedQuestions =
    level === "Beginner"
      ? "8–9 questions"
      : level === "Advanced"
        ? "15–20 questions"
        : "10–11 questions";

  const allSkillsForStep2 = roleSkills?.technicalSkills ?? [];

  const effectiveSelected =
    selectedSkills.length > 0
      ? selectedSkills
      : allSkillsForStep2
          .filter(
            (s) =>
              s.importance === "core" ||
              s.importance === "high" ||
              s.importance === "important",
          )
          .map((s) => s.skill)
          .slice(0, 3);

  return (
    <PageShell>
      <AppHeader />
      <div className="animate-fade-up mx-auto flex w-full max-w-3xl flex-col gap-8 px-3.5 py-6 sm:px-6 sm:py-10 md:px-8">
        <section className="max-w-2xl">
          {/* Progress steps */}
          <div className="mb-6 flex items-center gap-2" aria-label="Setup progress">
            {[
              { n: 1, label: "Setup" },
              { n: 2, label: "Skills" },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full border text-[11px] font-bold transition-all",
                    step >= n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    step >= n ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {n === 1 && <span className="mx-1 h-px w-8 bg-border" />}
              </div>
            ))}
          </div>

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-2xs">
            <Mic className="size-3.5 text-primary" />
            AI Voice Interview Platform
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            {step === 1 ? (
              <>
                Configure your <span className="text-primary">mock interview</span>
              </>
            ) : (
              "Review your interview plan"
            )}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            {step === 1
              ? "Specify your target role, company, and level, then upload your resume PDF. Our AI builds a tailored interview plan based on your background."
              : `Select the skills to focus on (${expectedQuestions} total), then begin your live voice interview.`}
          </p>
        </section>

        {/* ─────────────────────────── STEP 1 ─────────────────────────── */}
        {step === 1 ? (
          <section className="animate-fade-up rounded-2xl border border-border bg-card/70 p-5 shadow-sm transition-all duration-200 sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Step 1 of 2 • Candidate Setup
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                Tell us about you and the role
              </h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Target role — categorized tech-only picker with custom option */}
              <div className="grid gap-2 text-sm font-medium">
                <span>Target role</span>
                <Select
                  value={roleCategory}
                  onValueChange={(value) => {
                    setRoleCategory(value);
                    const preset = value !== "__custom__"
                      ? TECH_ROLE_CATEGORIES.flatMap((c) => c.roles).find(
                          (r) => r === value,
                        )
                      : undefined;
                    setRole(preset ?? "");
                    clearError("role");
                  }}
                  disabled={analyzing}
                >
                  <SelectTrigger className="w-full" aria-invalid={Boolean(errors.role)}>
                    <SelectValue placeholder="Choose a technical role" />
                  </SelectTrigger>
                  <SelectContent>
                    {TECH_ROLE_CATEGORIES.map((group) => (
                      <div key={group.category}>
                        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.category}
                        </div>
                        {group.roles.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </div>
                    ))}
                    <SelectItem value="__custom__">Other (type your own)…</SelectItem>
                  </SelectContent>
                </Select>
                {(roleCategory === "__custom__" || !TECH_ROLE_CATEGORIES.flatMap((c) => c.roles).includes(role)) && (
                  <Input
                    value={role}
                    placeholder="e.g. Platform Engineer"
                    onChange={(e) => { setRole(e.target.value); clearError("role"); }}
                    disabled={analyzing}
                    className={fieldClass("role")}
                    aria-invalid={Boolean(errors.role)}
                  />
                )}
                {errors.role && <span className="text-xs text-destructive">{errors.role}</span>}
              </div>

              {/* Target company */}
              <label className="grid gap-2 text-sm font-medium">
                Target company
                <Input
                  value={company}
                  placeholder="e.g. Google, Stripe, Microsoft"
                  onChange={(e) => { setCompany(e.target.value); clearError("company"); }}
                  disabled={analyzing}
                  className={fieldClass("company")}
                  aria-invalid={Boolean(errors.company)}
                />
                {errors.company && <span className="text-xs text-destructive">{errors.company}</span>}
              </label>

              {/* Self-assessed level */}
              <label className="grid gap-2 text-sm font-medium">
                Self-assessed level
                <Select
                  value={level}
                  onValueChange={(value) => { setLevel(value); clearError("level"); }}
                  disabled={analyzing}
                >
                  <SelectTrigger className={`w-full ${fieldClass("level")}`} aria-invalid={Boolean(errors.level)}>
                    <SelectValue placeholder="Choose your level" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.level && <span className="text-xs text-destructive">{errors.level}</span>}
              </label>

              {/* GitHub (optional) */}
              <label className="grid gap-2 text-sm font-medium">
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Github className="size-4 text-muted-foreground" />
                    GitHub Profile
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                </span>
                <Input
                  value={github}
                  placeholder="https://github.com/your-username"
                  onChange={(e) => { setGithub(e.target.value); clearError("github"); }}
                  disabled={analyzing}
                  className="bg-background"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  If provided, the AI references your public repositories during questioning.
                </span>
              </label>
            </div>

            {/* Resume PDF Upload */}
            <div className="mt-5 grid gap-2 text-sm font-medium">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="size-4 text-muted-foreground" />
                  Resume / CV
                </span>
                <span className="text-xs font-semibold text-destructive">Optional · PDF only · max 10 MB</span>
              </span>

              {!pdfState.file ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload PDF resume"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                    isDragOver
                      ? "border-primary bg-primary/5"
                      : errors.resume
                        ? "border-destructive bg-destructive/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                  } ${analyzing ? "pointer-events-none opacity-50" : ""}`}
                >
                  <UploadCloud className={`size-8 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Drag &amp; drop your PDF here</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">or click to browse files</p>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                    pdfState.error
                      ? "border-destructive/60 bg-destructive/5"
                      : pdfState.parsed
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-border bg-muted/30"
                  }`}
                >
                  <FileText className={`size-8 shrink-0 ${pdfState.parsed ? "text-emerald-600" : "text-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{pdfState.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(pdfState.file.size)}
                      {pdfState.parsing && " · Parsing…"}
                      {pdfState.parsed && " · Parsed successfully"}
                      {pdfState.error && ` · ${pdfState.error}`}
                    </p>
                  </div>
                  {pdfState.parsing ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <button
                      type="button"
                      onClick={removePdf}
                      disabled={analyzing}
                      aria-label="Remove PDF"
                      className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={onFileInputChange}
                disabled={analyzing}
                aria-label="PDF file input"
              />

              {errors.resume && (
                <span className="text-xs text-destructive">{errors.resume}</span>
              )}
              {!errors.resume && !pdfState.file && (
                <span className="text-xs text-muted-foreground">
                  The interviewer uses your resume to ask project-specific questions and verify your claims.
                </span>
              )}
              {pdfState.parsed && pdfState.resumeContext && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
                  <span className="font-semibold">Parsed successfully:</span>{" "}
                  {[
                    pdfState.resumeContext.technologies?.length
                      ? `${pdfState.resumeContext.technologies.length} technologies`
                      : null,
                    pdfState.resumeContext.projects?.length
                      ? `${pdfState.resumeContext.projects.length} projects`
                      : null,
                    pdfState.resumeContext.experience?.length
                      ? `${pdfState.resumeContext.experience.length} experience items`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Resume content extracted."}
                </div>
              )}
            </div>

            <Button
              disabled={analyzing || pdfState.parsing}
              onClick={() => void handleAnalyzeRole()}
              size="lg"
              className="mt-6 w-full gap-2 sm:w-auto"
            >
              {analyzing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {analyzing ? "Analyzing role & building plan…" : "Continue — Build Interview Plan"}
            </Button>
          </section>
        ) : (
          /* ─────────────────────────── STEP 2 ─────────────────────────── */
          <section className="animate-fade-up rounded-2xl border border-border bg-card/70 p-5 shadow-sm transition-all duration-200 sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Step 2 of 2 • Interview Plan
                </p>
                <h2 className="mt-2 text-xl font-semibold">Select skills to focus on</h2>
                <p className="text-sm text-muted-foreground">
                  {role} ({level}){company ? ` · ${company}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                disabled={starting}
                className="gap-1.5"
              >
                <ArrowLeft className="size-3.5" />
                Edit Setup
              </Button>
            </div>

            {/* Candidate context summary */}
            <div className="grid gap-3 rounded-xl border border-border bg-background/50 p-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <UserCheck className="size-3.5 text-primary" />
                  Your Level
                </span>
                <p className="text-sm font-semibold">{level}</p>
                <span className="text-xs text-muted-foreground">Self-assessed</span>
              </div>

              <div className="flex flex-col gap-1 sm:border-l sm:border-border sm:pl-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Layers className="size-3.5 text-blue-400" />
                  Target Role
                </span>
                <p className="text-sm font-semibold">{role}</p>
                <span className="text-xs text-muted-foreground">{company || "Any company"}</span>
              </div>

              <div className="flex flex-col gap-1 sm:border-l sm:border-border sm:pl-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  Resume
                </span>
                <p className="text-sm font-semibold truncate">{pdfState.file?.name ?? "No file"}</p>
                <span className="text-xs text-muted-foreground">
                  {pdfState.resumeContext?.technologies?.length
                    ? `${pdfState.resumeContext.technologies.length} technologies detected`
                    : "Uploaded & parsed"}
                </span>
              </div>
            </div>

            {/* Skill selection header */}
            <div className="mt-6 flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Recommended Skills
              </h3>
              <span className="text-xs font-medium text-foreground">
                {effectiveSelected.length} technical · {selectedSoftSkills.length} soft skill{selectedSoftSkills.length === 1 ? "" : "s"} selected
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Based on your {role} role{company ? ` at ${company}` : ""}, the AI recommends the skills below. These are the skills that will be evaluated during your interview — select only what you want assessed.
            </p>

            {/* Technical skill cards with selection toggle */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {roleSkills?.technicalSkills.map((item, idx) => {
                const isSelected = effectiveSelected.includes(item.skill);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleSkill(item.skill)}
                    disabled={starting}
                    className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/80 bg-background/40 transition-all duration-150 hover:border-primary/30 hover:bg-muted/20 hover:-translate-y-0.5"
                    } ${starting ? "pointer-events-none opacity-60" : ""}`}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? "Deselect" : "Select"} skill: ${item.skill}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{item.skill}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {getImportanceBadge(item.importance)}
                          <span
                            className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background"
                            }`}
                          >
                            {isSelected && (
                              <svg viewBox="0 0 10 8" fill="none" className="size-2.5">
                                <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {item.rationale || item.reason || "Evaluates core capabilities for this role."}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom technical skill add — custom skills appear as removable chips */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                placeholder="Add a custom technical skill (e.g. GraphQL, Kafka)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSkill();
                  }
                }}
                disabled={starting}
                className="bg-background"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomSkill}
                disabled={starting || !customSkillInput.trim()}
                className="gap-1.5 shrink-0"
              >
                <Plus className="size-3.5" />
                Add skill
              </Button>
            </div>
            {selectedSkills.filter((s) => !allSkillsForStep2.some((r) => r.skill === s)).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedSkills
                  .filter((s) => !allSkillsForStep2.some((r) => r.skill === s))
                  .map((custom) => (
                    <span
                      key={custom}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                    >
                      {custom}
                      <button
                        type="button"
                        onClick={() => toggleSkill(custom)}
                        disabled={starting}
                        aria-label={`Remove custom skill: ${custom}`}
                        className="rounded-full p-0.5 transition hover:bg-primary/20"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}

            {/* Soft skills (selectable — evidence is collected during the interview) */}
            {roleSkills?.softSkills && roleSkills.softSkills.length > 0 && (
              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Soft Skills
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {selectedSoftSkills.length} selected
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Selected soft skills are assessed through behavioral questions and scored with cited evidence. Unselected ones are not scored.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {roleSkills.softSkills.map((item, idx) => {
                    const isSelected = selectedSoftSkills.includes(item.skill);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleSoftSkill(item.skill)}
                        disabled={starting}
                        className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                          isSelected
                            ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                            : "border-border/80 bg-background/40 hover:border-primary/30 hover:bg-muted/20 hover:-translate-y-0.5"
                        } ${starting ? "pointer-events-none opacity-60" : ""}`}
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? "Deselect" : "Select"} soft skill: ${item.skill}`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground">{item.skill}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {getImportanceBadge(item.importance)}
                              <span
                                className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background"
                                }`}
                              >
                                {isSelected && (
                                  <svg viewBox="0 0 10 8" fill="none" className="size-2.5">
                                    <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                            </div>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {item.rationale || item.reason || "Essential interpersonal and communication skill."}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Coverage preview */}
            <div className="mt-6 rounded-xl border border-border bg-background/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Your interview will cover
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {[
                  "Introduction & background",
                  "Behavioral & situational questions",
                  "Resume & project deep-dives",
                  "Selected technical skill concepts",
                  "Practical scenarios",
                  "Adaptive follow-up questions",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Action bar */}
            <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {effectiveSelected.length === 0
                  ? "Select at least one skill above to enable the interview."
                  : `Assessing: ${effectiveSelected.join(", ")}${selectedSoftSkills.length > 0 ? ` + ${selectedSoftSkills.length} soft skill${selectedSoftSkills.length === 1 ? "" : "s"}` : ""}`}
              </p>
              <Button
                disabled={starting || effectiveSelected.length === 0}
                onClick={() => void onStartInterview()}
                size="lg"
                className="w-full gap-2 sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {starting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
                {starting ? "Starting voice session…" : "Begin Voice Interview"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
