import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router";
import { ArrowRight, Github, Loader2, Mic } from "lucide-react";
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

export function Form() {
  const [github, setGithub] = useState("");
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
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

  async function onSubmit() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {
        github: github.trim(),
        skill,
        level,
        company: company.trim(),
        role: role.trim(),
      });
      navigate(`/interview/${response.data.id}`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error
        : undefined;
      toast(message ?? "Unable to prepare your interview. Please try again.");
      setLoading(false);
    }
  }

  const fieldClass = (field: Field) =>
    errors[field] ? "border-destructive focus-visible:ring-destructive/30" : "";
  const clearError = (field: Field) =>
    setErrors((current) => ({ ...current, [field]: undefined }));

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
            Set your target, then answer naturally. The interviewer adapts its
            depth to your responses.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Interview setup
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              What should we assess?
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Target skill
              <Select
                value={skill}
                onValueChange={(value) => {
                  setSkill(value);
                  clearError("skill");
                }}
                disabled={loading}
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
              Your current level
              <Select
                value={level}
                onValueChange={(value) => {
                  setLevel(value);
                  clearError("level");
                }}
                disabled={loading}
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
            <label className="grid gap-2 text-sm font-medium">
              Target company
              <Input
                value={company}
                placeholder="Microsoft, Amazon, TCS"
                onChange={(event) => {
                  setCompany(event.target.value);
                  clearError("company");
                }}
                disabled={loading}
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
              Target role
              <Input
                value={role}
                placeholder="Frontend Developer"
                onChange={(event) => {
                  setRole(event.target.value);
                  clearError("role");
                }}
                disabled={loading}
                className={fieldClass("role")}
                aria-invalid={Boolean(errors.role)}
              />
              {errors.role && (
                <span className="text-xs text-destructive">{errors.role}</span>
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
                  if (event.key === "Enter" && !loading) void onSubmit();
                }}
                disabled={loading}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                aria-invalid={Boolean(errors.github)}
              />
            </div>
            {errors.github ? (
              <span className="text-xs text-destructive">{errors.github}</span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">
                We use your public repositories to ground relevant questions.
              </span>
            )}
          </label>
          {(skill || level || company.trim() || role.trim()) && (
            <div className="mt-6 rounded-lg border border-border bg-background/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Interview
              </p>
              <p className="mt-2 text-sm font-medium">
                {skill || "Skill"}{" "}
                <span className="text-muted-foreground">•</span>{" "}
                {level || "Level"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {role || "Target role"}
                {company.trim() ? ` @ ${company.trim()}` : ""}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                AI will adapt the difficulty based on your answers.
              </p>
            </div>
          )}
          <Button
            disabled={loading}
            onClick={() => void onSubmit()}
            size="lg"
            className="mt-6 w-full gap-2 sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            {loading ? "Preparing interview" : "Start interview"}
          </Button>
        </section>
      </div>
    </main>
  );
}
