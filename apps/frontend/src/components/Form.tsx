import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { useNavigate } from "react-router";
import { ArrowRight, Github, Loader2, Mic } from "lucide-react";
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

export function Form() {
  const [github, setGithub] = useState("");
  const [skill, setSkill] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit() {
    if (!github.trim() || !skill || !level || !company.trim() || !role.trim()) {
      toast("Please complete the interview configuration");
      return;
    }

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
    } catch (e) {
      toast("Something went wrong starting your interview. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden px-6">
      <AppHeader />
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <Mic className="size-3.5 text-primary" />
          Voice-based technical interview
        </span>

        <h1 className="bg-linear-to-b from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
          AI Interview Kickstart
        </h1>
        <p className="mt-4 max-w-md text-balance text-base text-muted-foreground">
          Drop your GitHub profile and start a live, voice-driven interview
          tailored to your work. Get instant feedback when you're done.
        </p>

        <div className="mt-8 w-full text-left">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Skill to assess
              <Select value={skill} onValueChange={setSkill} disabled={loading}>
                <SelectTrigger className="w-full">
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
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Current level
              <Select value={level} onValueChange={setLevel} disabled={loading}>
                <SelectTrigger className="w-full">
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
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Target company
              <Input
                value={company}
                placeholder="Google, Microsoft, Amazon"
                onChange={(event) => setCompany(event.target.value)}
                disabled={loading}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Target role
              <Input
                value={role}
                placeholder="Software Engineer, Frontend Developer"
                onChange={(event) => setRole(event.target.value)}
                disabled={loading}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card/60 p-2 shadow-sm backdrop-blur focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
            <div className="flex items-center pl-2 text-muted-foreground">
              <Github className="size-5" />
            </div>
            <Input
              value={github}
              placeholder="https://github.com/your-username"
              onChange={(e) => setGithub(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && onSubmit()}
              disabled={loading}
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button
              disabled={loading}
              onClick={onSubmit}
              size="lg"
              className="shrink-0 gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Starting
                </>
              ) : (
                <>
                  Start interview
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            We'll ask for microphone access once your interview begins.
          </p>
        </div>
      </div>
    </main>
  );
}
