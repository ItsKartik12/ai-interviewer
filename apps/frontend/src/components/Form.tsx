import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Github,
  Layers,
  Loader2,
  Mic,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { BACKEND_URL } from "@/lib/config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AppHeader } from "./AppHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const skills = [
  "Data Structures & Algorithms",
  "JavaScript",
  "React",
  "Backend Development",
  "Databases",
  "Other",
] as const;
const levels = ["Beginner", "Intermediate", "Advanced"] as const;
type Field = "github" | "skill" | "level" | "company" | "role";
type FieldErrors = Partial<Record<Field, string>>;

interface SkillItem {
  skill: string;
  importance: "core" | "important" | "bonus";
  rationale: string;
}

interface RoleSkillRequirement {
  role: string;
  company?: string;
  level: string;
  technicalSkills: SkillItem[];
  softSkills: SkillItem[];
  summary: string;
}

export function Form() {
  const [step, setStep] = useState<1 | 2>(1);
  const [github, setGithub] = useState("");
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [roleSkills, setRoleSkills] = useState<RoleSkillRequirement | null>(null);
  const navigate = useNavigate();

  function validate(): FieldErrors {
    return {
      ...(github.trim() ? {} : { github: "Add a GitHub profile URL." }),
      ...(skill ? {} : { skill: "Choose a primary skill." }),
      ...(level ? {} : { level: "Choose your current level." }),
      ...(company.trim() ? {} : { company: "Add a target company." }),
      ...(role.trim() ? {} : { role: "Add a target role." }),
    };
  }

  async function handleAnalyzeRole() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setAnalyzing(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/v1/analyze-role`, {
        role: role.trim(),
        company: company.trim(),
        level,
        skill,
      });

      if (response.data?.roleSkills) {
        setRoleSkills(response.data.roleSkills);
      }
      setStep(2);
    } catch (error) {
      console.warn("Analyze role fallback:", error);
      // Create sensible fallback if backend analyzer fails
      setRoleSkills({
        role: role.trim(),
        company: company.trim(),
        level,
        technicalSkills: [
          {
            skill: skill || "Core Engineering",
            importance: "core",
            rationale: `Primary focus for ${role.trim()} positions.`,
          },
          {
            skill: "System Design & Architecture",
            importance: "important",
            rationale: "Evaluates scalable structure and pattern implementation.",
          },
          {
            skill: "Code Quality & Testing",
            importance: "important",
            rationale: "Ensures maintainable and reliable engineering standards.",
          },
        ],
        softSkills: [
          {
            skill: "Technical Communication",
            importance: "core",
            rationale: "Ability to explain complex decisions clearly to team members.",
          },
          {
            skill: "Problem Solving",
            importance: "core",
            rationale: "Structured thinking when addressing ambiguous requirements.",
          },
        ],
        summary: `Tailored evaluation framework for ${role.trim()} at ${company.trim()}.`,
      });
      setStep(2);
    } finally {
      setAnalyzing(false);
    }
  }

  async function onStartInterview() {
    setStarting(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {
        github: github.trim(),
        skill,
        level,
        company: company.trim(),
        role: role.trim(),
        roleSkills,
      });
      navigate(`/interview/${response.data.id}`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error
        : undefined;
      toast(message ?? "Unable to prepare your interview. Please try again.");
      setStarting(false);
    }
  }

  const fieldClass = (field: Field) =>
    errors[field] ? "border-destructive focus-visible:ring-destructive/30" : "";
  const clearError = (field: Field) =>
    setErrors((current) => ({ ...current, [field]: undefined }));

  function getImportanceBadge(importance: "core" | "important" | "bonus") {
    switch (importance) {
      case "core":
        return (
          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
            Core Requirement
          </span>
        );
      case "important":
        return (
          <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
            Important
          </span>
        );
      case "bonus":
        return (
          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
            Bonus / Differentiator
          </span>
        );
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8 sm:py-10">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pt-16 sm:pt-20">
        <section className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Mic className="size-3.5 text-primary" />
            Voice-based technical interview
          </div>
          <h1 className="bg-linear-to-b from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            AI Interview Kickstart
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {step === 1
              ? "Set your target role and self-assessment. Our AI will analyze the role requirements before you begin."
              : "Review the required competencies determined for this role before beginning the live voice session."}
          </p>
        </section>

        {step === 1 ? (
          <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Step 1 of 2 • Interview Setup
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  What role are you targeting?
                </h2>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Target role
                <Input
                  value={role}
                  placeholder="e.g. Frontend Developer, Senior Backend Engineer"
                  onChange={(event) => {
                    setRole(event.target.value);
                    clearError("role");
                  }}
                  disabled={analyzing}
                  className={fieldClass("role")}
                  aria-invalid={Boolean(errors.role)}
                />
                {errors.role && (
                  <span className="text-xs text-destructive">{errors.role}</span>
                )}
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Target company
                <Input
                  value={company}
                  placeholder="e.g. Google, Stripe, Microsoft"
                  onChange={(event) => {
                    setCompany(event.target.value);
                    clearError("company");
                  }}
                  disabled={analyzing}
                  className={fieldClass("company")}
                  aria-invalid={Boolean(errors.company)}
                />
                {errors.company && (
                  <span className="text-xs text-destructive">
                    {errors.company}
                  </span>
                )}
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Your primary skill
                <Select
                  value={skill}
                  onValueChange={(value) => {
                    setSkill(value);
                    clearError("skill");
                  }}
                  disabled={analyzing}
                >
                  <SelectTrigger
                    className={`w-full ${fieldClass("skill")}`}
                    aria-invalid={Boolean(errors.skill)}
                  >
                    <SelectValue placeholder="Choose a skill" />
                  </SelectTrigger>
                  <SelectContent>
                    {skills.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.skill && (
                  <span className="text-xs text-destructive">{errors.skill}</span>
                )}
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Your self-assessed level
                <Select
                  value={level}
                  onValueChange={(value) => {
                    setLevel(value);
                    clearError("level");
                  }}
                  disabled={analyzing}
                >
                  <SelectTrigger
                    className={`w-full ${fieldClass("level")}`}
                    aria-invalid={Boolean(errors.level)}
                  >
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
                {errors.level && (
                  <span className="text-xs text-destructive">{errors.level}</span>
                )}
              </label>
            </div>

            <label className="mt-5 grid gap-2 text-sm font-medium">
              GitHub profile
              <div
                className={`flex items-center gap-2 rounded-lg border bg-background px-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 ${errors.github ? "border-destructive" : "border-input"}`}
              >
                <Github className="ml-2 size-4 text-muted-foreground" />
                <Input
                  value={github}
                  placeholder="https://github.com/your-username"
                  onChange={(event) => {
                    setGithub(event.target.value);
                    clearError("github");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !analyzing) void handleAnalyzeRole();
                  }}
                  disabled={analyzing}
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                  aria-invalid={Boolean(errors.github)}
                />
              </div>
              {errors.github ? (
                <span className="text-xs text-destructive">{errors.github}</span>
              ) : (
                <span className="text-xs font-normal text-muted-foreground">
                  We use your public repositories to ground realistic interview questions.
                </span>
              )}
            </label>

            <Button
              disabled={analyzing}
              onClick={() => void handleAnalyzeRole()}
              size="lg"
              className="mt-6 w-full gap-2 sm:w-auto"
            >
              {analyzing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {analyzing ? "Analyzing role requirements..." : "Analyze Role & Required Skills"}
            </Button>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Step 2 of 2 • Role Skill Determination
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  Competency Plan for {role}
                </h2>
                {company && (
                  <p className="text-sm text-muted-foreground">
                    Targeted for {company} standards
                  </p>
                )}
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

            {/* Distinction Overview Banner */}
            <div className="grid gap-3 rounded-xl border border-border bg-background/50 p-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <UserCheck className="size-3.5 text-primary" />
                  Your Self-Assessment
                </span>
                <p className="text-sm font-semibold">{skill}</p>
                <span className="text-xs text-muted-foreground">
                  Stated level: {level}
                </span>
              </div>

              <div className="flex flex-col gap-1 sm:border-l sm:border-border sm:pl-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Layers className="size-3.5 text-blue-400" />
                  Role Requirements
                </span>
                <p className="text-sm font-semibold">{role}</p>
                <span className="text-xs text-muted-foreground">
                  Derived from {company || "industry"} benchmarks
                </span>
              </div>

              <div className="flex flex-col gap-1 sm:border-l sm:border-border sm:pl-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  Demonstrated Skills
                </span>
                <p className="text-sm font-semibold">Evidence-Based</p>
                <span className="text-xs text-muted-foreground">
                  Evaluated only if tested in interview
                </span>
              </div>
            </div>

            {/* Technical Skills Section */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Technical Skills to be Evaluated
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {roleSkills?.technicalSkills.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between rounded-xl border border-border/80 bg-background/40 p-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {item.skill}
                        </span>
                        {getImportanceBadge(item.importance)}
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {item.rationale}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Soft Skills Section */}
            {roleSkills?.softSkills && roleSkills.softSkills.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Soft Skills & Behavioral Dimensions
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {roleSkills.softSkills.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col justify-between rounded-xl border border-border/80 bg-background/40 p-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {item.skill}
                          </span>
                          {getImportanceBadge(item.importance)}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {item.rationale}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Ready? The interviewer will introduce itself and begin with a quick icebreaker.
              </p>
              <Button
                disabled={starting}
                onClick={() => void onStartInterview()}
                size="lg"
                className="w-full gap-2 sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {starting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
                {starting ? "Starting voice session..." : "Begin Voice Interview"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
