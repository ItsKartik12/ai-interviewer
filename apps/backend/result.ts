import { askOmniRoute } from "./omniroute.ts";

export type InterviewEvaluation = {
  score: number;
  technicalKnowledge: number;
  problemSolving: number;
  communication: number;
  strengths: string[];
  weaknesses: string[];
  topicsToImprove: string[];
  skillGap: {
    strong: string[];
    needsImprovement: string[];
  };
  overallFeedback: string;
};

function clampScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);
  return Number.isFinite(score)
    ? Math.max(0, Math.min(10, Math.round(score)))
    : 0;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .slice(0, 8)
    : [];
}

function parseEvaluation(response: string): InterviewEvaluation {
  const candidate = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const parsed = JSON.parse(
    candidate.slice(start >= 0 ? start : 0, end >= 0 ? end + 1 : undefined),
  ) as Record<string, unknown>;
  const skillGap = (parsed.skillGap ?? {}) as Record<string, unknown>;

  return {
    score: clampScore(parsed.score),
    technicalKnowledge: clampScore(parsed.technicalKnowledge),
    problemSolving: clampScore(parsed.problemSolving),
    communication: clampScore(parsed.communication),
    strengths: stringList(parsed.strengths),
    weaknesses: stringList(parsed.weaknesses),
    topicsToImprove: stringList(parsed.topicsToImprove),
    skillGap: {
      strong: stringList(skillGap.strong),
      needsImprovement: stringList(skillGap.needsImprovement),
    },
    overallFeedback:
      typeof parsed.overallFeedback === "string" ? parsed.overallFeedback : "",
  };
}

export async function calculateResult(
  messages: { type: "Assistant" | "User"; message: string; createdAt: Date }[],
  githubMetadata: unknown,
): Promise<InterviewEvaluation> {
  const response = await askOmniRoute([
    {
      role: "system",
      content: `You are an evidence-based technical interview evaluator.
Evaluate only what is demonstrated in the transcript and supported by the GitHub context. Do not invent candidate behavior, projects, skills, or missing answers. Distinguish interviewer claims from candidate evidence. Consider technical knowledge, problem solving, communication/clarity, correctness, depth, and relevance.

Return ONLY valid JSON with this shape:
{
    "score": 0,
    "technicalKnowledge": 0,
    "problemSolving": 0,
    "communication": 0,
    "strengths": [],
    "weaknesses": [],
    "topicsToImprove": [],
    "skillGap": { "strong": [], "needsImprovement": [] },
    "overallFeedback": "concise evidence-based feedback"
}

All numeric values are integers from 0 to 10. Keep lists concise and tie each item to observed evidence.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        githubContext: githubMetadata ?? null,
        transcript: messages,
      }),
    },
  ]);

  try {
    return parseEvaluation(response);
  } catch (error) {
    console.error("OmniRoute evaluation parse error:", error);
    throw new Error("OmniRoute returned an invalid interview evaluation");
  }
}
