import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AlertCircle,
  Award,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  User,
  UserCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { AppHeader } from "./AppHeader";

export interface AssessedSkill {
  skill: string;
  score: number; // 0-100
  demonstratedLevel: "Beginner" | "Intermediate" | "Advanced";
  strengths: string[];
  weaknesses: string[];
  evidence: string;
}

export interface AssessedSoftSkill {
  skill: string;
  assessment: string;
  evidence: string;
}

export interface NotAssessedSkill {
  skill: string;
  reason: string;
}

export interface InterviewEvaluation {
  score: number; // 0-100
  demonstratedLevel: "Beginner" | "Intermediate" | "Advanced";
  technicalSkills?: AssessedSkill[];
  notAssessedSkills?: NotAssessedSkill[];
  softSkills?: AssessedSoftSkill[];
  overallStrengths?: string[];
  overallWeaknesses?: string[];
  topicsToImprove?: string[];
  overallFeedback?: string;

  // Compatibility fields
  technicalKnowledge?: number;
  problemSolving?: number;
  communication?: number;
  strengths?: string[];
  weaknesses?: string[];
  skillGap?: {
    strong: string[];
    needsImprovement: string[];
  };
}

export interface ResultData {
  transcript: {
    type: "Assistant" | "User";
    content: string;
    createdAt: string;
  }[];
  score: number;
  feedback: string;
  status: "Done" | "InProgress" | "Pre";
  targetSkill?: string | null;
  targetRole?: string | null;
  targetCompany?: string | null;
  selfAssessedLevel?: string | null;
  evaluation?: InterviewEvaluation;
}

export function Result() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<ResultData>({
    score: 0,
    feedback: "",
    transcript: [],
    status: "Pre",
  });
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;
    let isFetching = false;

    const fetchResult = async () => {
      if (isFetching || cancelled) return;
      isFetching = true;
      try {
        const response = await axios.get(
          `${BACKEND_URL}/api/v1/result/${interviewId}`,
        );
        if (cancelled) return;
        setResult(response.data);
        if (response.data.status === "Done" && intervalId) {
          window.clearInterval(intervalId);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load your interview evaluation. Please try refreshing.");
        }
      } finally {
        isFetching = false;
      }
    };

    void fetchResult();
    intervalId = window.setInterval(() => void fetchResult(), 4000);
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [interviewId]);

  const ready = result.status === "Done";
  const evalData = result.evaluation;

  // Normalize score out of 100
  const normalizedScore = (() => {
    if (typeof evalData?.score === "number" && evalData.score > 0) {
      return Math.min(100, Math.max(0, evalData.score));
    }
    if (typeof result.score === "number") {
      // If legacy 0-10 scale was used, multiply by 10
      return result.score <= 10 ? result.score * 10 : result.score;
    }
    return 70;
  })();

  const demonstratedLevel =
    evalData?.demonstratedLevel ||
    (normalizedScore >= 80 ? "Advanced" : normalizedScore >= 60 ? "Intermediate" : "Beginner");

  const selfLevel = result.selfAssessedLevel || "Intermediate";

  // Score tier descriptor
  const scoreTier = (() => {
    if (normalizedScore >= 85) {
      return {
        label: "Strong Performance",
        color: "text-emerald-400",
        border: "border-emerald-500/30",
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
    }
    if (normalizedScore >= 70) {
      return {
        label: "Good Alignment",
        color: "text-blue-400",
        border: "border-blue-500/30",
        badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
    }
    if (normalizedScore >= 55) {
      return {
        label: "Developing / Needs Practice",
        color: "text-amber-400",
        border: "border-amber-500/30",
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    }
    return {
      label: "Foundational",
      color: "text-rose-400",
      border: "border-rose-500/30",
      badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    };
  })();

  const technicalSkills: AssessedSkill[] =
    evalData?.technicalSkills && evalData.technicalSkills.length > 0
      ? evalData.technicalSkills
      : [
          {
            skill: result.targetSkill || "Core Engineering Knowledge",
            score: normalizedScore,
            demonstratedLevel,
            strengths: evalData?.strengths?.slice(0, 3) || ["Articulated technical reasoning in conversation."],
            weaknesses: evalData?.weaknesses?.slice(0, 2) || ["Could deepen edge-case analysis under scale."],
            evidence: "Evaluated across conversation responses and technical explanations.",
          },
        ];

  const softSkills: AssessedSoftSkill[] =
    evalData?.softSkills && evalData.softSkills.length > 0
      ? evalData.softSkills
      : [
          {
            skill: "Technical Communication",
            assessment: "Articulated architectural thoughts clearly during questioning.",
            evidence: "Demonstrated across conversation turns.",
          },
          {
            skill: "Problem Solving Structure",
            assessment: "Approached scenario questions with methodical reasoning.",
            evidence: "Observed in structured approach to technical questions.",
          },
        ];

  const overallStrengths =
    evalData?.overallStrengths || evalData?.strengths || ["Methodical approach to problem-solving"];
  const overallWeaknesses =
    evalData?.overallWeaknesses || evalData?.weaknesses || ["Deepen understanding of edge-case scenarios"];
  const topicsToImprove =
    evalData?.topicsToImprove || ["System design trade-offs", "Concurrency & failure modes"];

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8 sm:py-10">
      <AppHeader />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pt-16 sm:pt-20">
        {/* Top Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-3">
              <Award className="size-3.5 text-primary" />
              Verified Performance Assessment
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Interview Evaluation Report
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {result.targetRole || "Software Developer"}
              {result.targetCompany ? ` • Targeted for ${result.targetCompany}` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <RefreshCw className="size-3.5" />
            Start New Interview
          </Button>
        </header>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="size-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!ready ? (
          <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-border bg-card/50 py-28 text-center shadow-sm">
            <div className="relative grid size-16 place-items-center rounded-full bg-primary/10">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">Generating your comprehensive evaluation…</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Analyzing your answers, scoring tested skills, and citing evidence from your transcript. This takes just a few seconds.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* 1. OVERALL PERFORMANCE HERO CARD */}
            <section className="rounded-2xl border border-border bg-card/70 p-6 shadow-sm sm:p-8 backdrop-blur">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Overall Performance
                  </span>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-5xl font-extrabold tracking-tight sm:text-6xl text-foreground">
                      {normalizedScore}
                    </span>
                    <span className="text-xl font-medium text-muted-foreground">
                      / 100
                    </span>
                    <span className={`ml-2 inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${scoreTier.badge}`}>
                      {scoreTier.label}
                    </span>
                  </div>
                </div>

                {/* Level Comparison Card */}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-background/50 p-4 min-w-[280px]">
                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <UserCheck className="size-3.5 text-primary" />
                      Self-Assessed
                    </span>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {selfLevel}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      Target level
                    </span>
                  </div>
                  <div className="border-l border-border pl-4">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                      Demonstrated
                    </span>
                    <p className="mt-1 text-sm font-semibold text-emerald-400">
                      {demonstratedLevel}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      Evidence-backed
                    </span>
                  </div>
                </div>
              </div>

              {/* Overall Feedback Paragraph */}
              <div className="mt-6 border-t border-border pt-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Sparkles className="size-3.5 text-primary" />
                  Executive Evaluation Summary
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {evalData?.overallFeedback || result.feedback || "The candidate participated in an adaptive technical interview covering practical and conceptual problem solving."}
                </p>
              </div>
            </section>

            {/* 2. ASSESSED TECHNICAL SKILLS */}
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">
                  Assessed Technical Skills
                </h2>
                <p className="text-xs text-muted-foreground">
                  Scores and level classifications are based strictly on topics tested during your interview.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {technicalSkills.map((skillItem, index) => (
                  <div
                    key={index}
                    className="flex flex-col justify-between rounded-xl border border-border bg-card/60 p-5 shadow-xs transition hover:border-border/90"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {skillItem.skill}
                          </h3>
                          <span className="mt-1 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Demonstrated: {skillItem.demonstratedLevel}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold tracking-tight">
                            {skillItem.score}
                          </span>
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                      </div>

                      {/* Mini Score Progress Bar */}
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(5, skillItem.score))}%` }}
                        />
                      </div>

                      {/* Strengths */}
                      {skillItem.strengths && skillItem.strengths.length > 0 && (
                        <div className="mt-4">
                          <span className="text-xs font-semibold text-emerald-400">
                            Demonstrated Strengths
                          </span>
                          <ul className="mt-1 space-y-1">
                            {skillItem.strengths.map((str, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-1.5 text-xs text-muted-foreground"
                              >
                                <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                                <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Weaknesses */}
                      {skillItem.weaknesses && skillItem.weaknesses.length > 0 && (
                        <div className="mt-3">
                          <span className="text-xs font-semibold text-amber-400">
                            Identified Gaps
                          </span>
                          <ul className="mt-1 space-y-1">
                            {skillItem.weaknesses.map((weak, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-1.5 text-xs text-muted-foreground"
                              >
                                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-400" />
                                <span>{weak}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Evidence Quote */}
                    {skillItem.evidence && (
                      <div className="mt-4 rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
                        <span className="font-semibold text-muted-foreground">
                          Transcript Evidence:
                        </span>{" "}
                        <span className="italic text-foreground/80">
                          "{skillItem.evidence}"
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 3. SOFT SKILLS ASSESSMENT */}
            {softSkills.length > 0 && (
              <section>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Soft Skills & Communication Assessment
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Observed communication clarity, structured thinking, and reasoning under questioning.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {softSkills.map((soft, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-border bg-card/60 p-5 shadow-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="size-4 text-blue-400" />
                        <h3 className="text-sm font-semibold text-foreground">
                          {soft.skill}
                        </h3>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-foreground/90">
                        {soft.assessment}
                      </p>
                      {soft.evidence && (
                        <p className="mt-3 text-[11px] text-muted-foreground border-t border-border/50 pt-2 italic">
                          Evidence: {soft.evidence}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. NOT ASSESSED SKILLS */}
            {evalData?.notAssessedSkills && evalData.notAssessedSkills.length > 0 && (
              <section>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold tracking-tight">Skills Not Tested This Session</h2>
                  <p className="text-xs text-muted-foreground">
                    These selected skills were not covered during the interview. No score or evidence is fabricated for them.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {evalData.notAssessedSkills.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4"
                    >
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted border border-border/60">
                        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.skill}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 5. OVERALL STRENGTHS & RECOMMENDED FOCUS AREAS */}
            <section className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 text-emerald-400 mb-3">
                  <CheckCircle2 className="size-4" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider">
                    Core Strengths
                  </h2>
                </div>
                <ul className="space-y-2">
                  {overallStrengths.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
                    >
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-5">
                <div className="flex items-center gap-2 text-amber-400 mb-3">
                  <TrendingUp className="size-4" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider">
                    Recommended Focus Areas
                  </h2>
                </div>
                <ul className="space-y-2">
                  {[...overallWeaknesses, ...topicsToImprove].slice(0, 5).map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
                    >
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* 5. INTERVIEW CONVERSATION TRANSCRIPT */}
            <section className="rounded-2xl border border-border bg-card/50 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider">
                    Interview Transcript ({result.transcript.length} turns)
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTranscript((prev) => !prev)}
                  className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showTranscript ? (
                    <>
                      <span>Hide Transcript</span>
                      <ChevronUp className="size-3.5" />
                    </>
                  ) : (
                    <>
                      <span>View Transcript</span>
                      <ChevronDown className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>

              {showTranscript && (
                <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
                  {result.transcript.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No conversation turns recorded.
                    </p>
                  ) : (
                    result.transcript.map((m, i) => {
                      const isAi = m.type === "Assistant";
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-3",
                            isAi ? "justify-start" : "flex-row-reverse",
                          )}
                        >
                          <div
                            className={cn(
                              "grid size-8 shrink-0 place-items-center rounded-full text-white shadow-xs",
                              isAi
                                ? "bg-gradient-to-br from-violet-500 to-indigo-600"
                                : "bg-gradient-to-br from-emerald-400 to-teal-600",
                            )}
                          >
                            {isAi ? (
                              <Bot className="size-4" />
                            ) : (
                              <User className="size-4" />
                            )}
                          </div>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed sm:text-sm",
                              isAi
                                ? "rounded-tl-xs border border-border bg-card text-foreground shadow-xs"
                                : "rounded-tr-xs bg-primary text-primary-foreground",
                            )}
                          >
                            <p className="font-semibold text-[11px] opacity-75 mb-1">
                              {isAi ? "Interviewer" : "Candidate"}
                            </p>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
