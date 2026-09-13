import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Loader2, Sparkles, User } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface ResultData {
  transcript: {
    type: "Assistant" | "User";
    content: string;
    createdAt: string;
  }[];
  score: number;
  feedback: string;
  status: "Done" | "InProgress" | "Pre";
  evaluation?: {
    technicalKnowledge: number;
    problemSolving: number;
    communication: number;
    strengths: string[];
    weaknesses: string[];
    topicsToImprove: string[];
    skillGap: { strong: string[]; needsImprovement: string[] };
  };
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

  useEffect(() => {
    const fetchResult = () =>
      axios
        .get(`${BACKEND_URL}/api/v1/result/${interviewId}`)
        .then((response) => {
          setResult(response.data);
          return response.data.status as ResultData["status"];
        });

    fetchResult();
    const intervalId = setInterval(async () => {
      const s = await fetchResult();
      if (s === "Done") clearInterval(intervalId);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [interviewId]);

  const ready = result.status === "Done";

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Interview results
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your feedback and full conversation transcript.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>
          New interview
        </Button>
      </header>

      {!ready ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card/50 py-24 text-center">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
          <div>
            <p className="font-medium">Analyzing your interview…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This usually takes a few seconds.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Score + feedback */}
          <section className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Sparkles className="size-4 text-violet-400" />
                AI Feedback
              </div>
              <div className="flex shrink-0 items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">
                  {result.score}
                </span>
                <span className="text-sm text-muted-foreground">/ 10</span>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {result.feedback}
            </p>
          </section>

          {result.evaluation && (
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                ["Technical knowledge", result.evaluation.technicalKnowledge],
                ["Problem solving", result.evaluation.problemSolving],
                ["Communication", result.evaluation.communication],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-card/50 p-4"
                >
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{value}/10</p>
                </div>
              ))}
            </section>
          )}

          {result.evaluation && (
            <section className="grid gap-6 sm:grid-cols-2">
              <div>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Strengths
                </h2>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {result.evaluation.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Needs improvement
                </h2>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {[
                    ...result.evaluation.weaknesses,
                    ...result.evaluation.topicsToImprove,
                  ].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {result.evaluation && (
            <section className="grid gap-6 sm:grid-cols-2">
              <div>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Skill gap: strong evidence
                </h2>
                <p className="text-sm">
                  {result.evaluation.skillGap.strong.join(", ") ||
                    "No specific strengths identified yet."}
                </p>
              </div>
              <div>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Skill gap: focus areas
                </h2>
                <p className="text-sm">
                  {result.evaluation.skillGap.needsImprovement.join(", ") ||
                    "No specific gaps identified yet."}
                </p>
              </div>
            </section>
          )}

          {/* Transcript */}
          <section>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">
              Conversation
            </h2>
            <div className="flex flex-col gap-4">
              {result.transcript.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No messages were recorded for this interview.
                </p>
              )}
              {result.transcript.map((m, i) => {
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
                        "grid size-8 shrink-0 place-items-center rounded-full text-white",
                        isAi
                          ? "bg-linear-to-br from-violet-400 to-indigo-600"
                          : "bg-linear-to-br from-emerald-300 to-teal-600",
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
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        isAi
                          ? "rounded-tl-sm bg-card text-foreground"
                          : "rounded-tr-sm bg-primary text-primary-foreground",
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
