import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Award,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { AppHeader } from "./AppHeader";
import { Button } from "./ui/button";
import { PageShell, SectionHeading, Skeleton, StatCard } from "./ui/shared";
import { cn } from "@/lib/utils";

type HistoryEvaluation = {
  score?: number;
  assessedSkills?: { skill: string; score: number }[];
  softSkills?: { skill: string; assessment?: string; evidence?: string }[];
  notAssessedSkills?: { skill: string; reason: string }[];
};

type HistoryInterview = {
  id: string;
  role: string;
  targetRole: string | null;
  targetCompany: string | null;
  targetSkill: string | null;
  selfAssessedLevel: string | null;
  score: number | null;
  feedback: string | null;
  strengthsList: string[];
  weaknessesList: string[];
  evaluation: HistoryEvaluation | null;
  completedAt: string | null;
  createdAt: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function scoreTier(score: number): { label: string; className: string } {
  if (score >= 85) return { label: "Strong", className: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" };
  if (score >= 70) return { label: "Good", className: "text-blue-500 border-blue-500/30 bg-blue-500/10" };
  if (score >= 55) return { label: "Developing", className: "text-amber-500 border-amber-500/30 bg-amber-500/10" };
  return { label: "Foundational", className: "text-rose-500 border-rose-500/30 bg-rose-500/10" };
}

export function History() {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState<HistoryInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/v1/interviews");
        if (cancelled) return;
        const list = (res.data?.interviews ?? []) as HistoryInterview[];
        setInterviews(list);
        // Default chart selection: up to 3 most frequently assessed skills.
        const counts = new Map<string, number>();
        for (const item of list) {
          for (const s of item.evaluation?.assessedSkills ?? []) {
            counts.set(s.skill, (counts.get(s.skill) ?? 0) + 1);
          }
        }
        const top = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([skill]) => skill);
        setSelectedSkills(top);
      } catch {
        if (!cancelled) setError("Could not load your interview history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Chronological order (oldest → newest) for progression charts.
  const chronological = useMemo(
    () => [...interviews].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
    [interviews],
  );

  // Overall score progression: only real recorded scores.
  const overallData = useMemo(
    () =>
      chronological.map((item, index) => ({
        label: `#${index + 1}`,
        date: formatDate(item.completedAt ?? item.createdAt),
        score: item.score,
      })),
    [chronological],
  );

  // All skills ever assessed (for the picker).
  const allSkills = useMemo(() => {
    const set = new Set<string>();
    for (const item of chronological) {
      for (const s of item.evaluation?.assessedSkills ?? []) set.add(s.skill);
    }
    return [...set].sort();
  }, [chronological]);

  // Skill progression: a point exists ONLY where the skill was actually
  // assessed — untested skills are omitted (never plotted as 0).
  const skillSeries = useMemo(() => {
    const selected = selectedSkills.slice(0, 5);
    return chronological.map((item, index) => {
      const point: Record<string, string | number | null> = {
        label: `#${index + 1}`,
        date: formatDate(item.completedAt ?? item.createdAt),
      };
      const assessed = new Map(
        (item.evaluation?.assessedSkills ?? []).map((s) => [s.skill, s.score]),
      );
      for (const skill of selected) {
        const value = assessed.get(skill);
        // Omit rather than zero-fill: nulls create gaps in the line.
        point[skill] = value ?? null;
      }
      return point;
    });
  }, [chronological, selectedSkills]);

  function toggleSkill(skill: string) {
    setSelectedSkills((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : prev.length < 5
          ? [...prev, skill]
          : prev,
    );
  }

  if (loading) {
    return (
      <PageShell>
        <AppHeader />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pt-16">
          <div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-9 w-72" />
            <Skeleton className="mt-3 h-4 w-96" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  const bestScore = interviews.reduce(
    (max, item) => Math.max(max, item.score ?? 0),
    0,
  );
  const avgScore =
    interviews.length > 0
      ? Math.round(
          interviews.reduce((sum, item) => sum + (item.score ?? 0), 0) /
            interviews.length,
        )
      : 0;

  return (
    <PageShell>
      <AppHeader />
      <div className="animate-fade-up mx-auto flex w-full max-w-5xl flex-col gap-8 pt-16">
        <SectionHeading
          eyebrow="Your Progress"
          title="Results History"
          description={
            interviews.length > 0
              ? `${interviews.length} completed interview${interviews.length === 1 ? "" : "s"} — track your progression over time.`
              : "Track your progression across completed interviews."
          }
        >
          <Button onClick={() => navigate("/")} className="gap-2">
            <Award className="size-4" />
            New Interview
          </Button>
        </SectionHeading>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {interviews.length === 0 && !error ? (
          <div className="animate-fade-up flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/50 py-20 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-primary/10">
              <TrendingUp className="size-7 text-primary" />
            </div>
            <p className="text-lg font-semibold">No completed interviews yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Finish your first mock interview to start tracking score and skill
              progression here.
            </p>
            <Button onClick={() => navigate("/")} className="mt-2">
              Start an interview
            </Button>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            {interviews.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  icon={Award}
                  label="Interviews completed"
                  value={interviews.length}
                  tone="primary"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Average score"
                  value={`${avgScore}/100`}
                  tone="success"
                />
                <StatCard
                  icon={Sparkles}
                  label="Best score"
                  value={`${bestScore}/100`}
                  tone="warning"
                />
              </div>
            )}

            {/* Overall score progression */}
            {interviews.length >= 2 && (
              <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm">
                <h2 className="text-lg font-semibold tracking-tight">
                  Overall Score Progression
                </h2>
                <p className="text-xs text-muted-foreground">
                  Recorded overall score per completed interview (oldest → newest).
                </p>
                <div className="mt-4 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overallData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => [`${value}/100`, "Score"]}
                        labelFormatter={(label, payload) =>
                          payload?.[0]?.payload?.date
                            ? `${payload[0].payload.date} (${label})`
                            : String(label)
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="var(--color-primary, #6366f1)"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Skill progression */}
            {interviews.length >= 2 && allSkills.length > 0 && (
              <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      Skill Progression
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Only interviews where the skill was actually assessed contribute a
                      point — gaps mean the skill was not tested, not a zero.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSkillPicker((p) => !p)}
                    className="gap-1.5"
                  >
                    {showSkillPicker ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {selectedSkills.length} selected
                  </Button>
                </div>

                {showSkillPicker && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {allSkills.map((skill) => {
                      const active = selectedSkills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleSkill(skill)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            active
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={skillSeries} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      {selectedSkills.map((skill, i) => (
                        <Line
                          key={skill}
                          type="monotone"
                          dataKey={skill}
                          stroke={SKILL_COLORS[i % SKILL_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Interview list */}
            <section className="flex flex-col gap-3">
              {interviews.map((item) => {
                const score = item.score ?? 0;
                const tier = scoreTier(score);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/result/${item.id}`)}
                    className="hover-elevate flex items-center gap-4 rounded-2xl border border-border bg-card/60 p-4 text-left shadow-xs transition-all hover:border-primary/40 hover:bg-card"
                  >
                    <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border border-primary/20 bg-primary/5">
                      <span className="text-lg font-bold leading-none">{score}</span>
                      <span className="text-[10px] text-muted-foreground">/100</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {item.targetRole ?? item.role}
                        </p>
                        <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", tier.className)}>
                          {tier.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          item.targetCompany,
                          item.selfAssessedLevel,
                          formatDate(item.completedAt ?? item.createdAt),
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}

const SKILL_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];
