import { askOmniRoute } from "./omniroute.ts";

export type AssessedSkill = {
  skill: string;
  score: number; // 0-100
  demonstratedLevel: "Beginner" | "Intermediate" | "Advanced";
  strengths: string[];
  weaknesses: string[];
  evidence: string;
};

export type AssessedSoftSkill = {
  skill: string;
  assessment: string;
  evidence: string;
};

export type InterviewEvaluation = {
  score: number; // 0-100
  demonstratedLevel: "Beginner" | "Intermediate" | "Advanced";
  technicalSkills: AssessedSkill[];
  softSkills: AssessedSoftSkill[];
  overallStrengths: string[];
  overallWeaknesses: string[];
  topicsToImprove: string[];
  overallFeedback: string;

  // Backwards compatibility fields for legacy consumers
  technicalKnowledge: number; // 0-10
  problemSolving: number; // 0-10
  communication: number; // 0-10
  strengths: string[];
  weaknesses: string[];
  skillGap: {
    strong: string[];
    needsImprovement: string[];
  };
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, Math.round(num))) : fallback;
}

function stringList(value: unknown, maxItems = 8): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, maxItems)
    : [];
}

function parseEvaluation(response: string, fallbackLevel: "Beginner" | "Intermediate" | "Advanced" = "Intermediate"): InterviewEvaluation {
  const candidate = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const parsed = JSON.parse(
    candidate.slice(start >= 0 ? start : 0, end >= 0 ? end + 1 : undefined),
  ) as Record<string, unknown>;

  const rawScore = clamp(parsed.score, 0, 100, 70);

  // Parse technical skills assessed
  const technicalSkills: AssessedSkill[] = Array.isArray(parsed.technicalSkills)
    ? parsed.technicalSkills.map((item: any) => ({
        skill: String(item.skill || "Technical Concept"),
        score: clamp(item.score, 0, 100, rawScore),
        demonstratedLevel:
          item.demonstratedLevel === "Beginner" ||
          item.demonstratedLevel === "Advanced" ||
          item.demonstratedLevel === "Intermediate"
            ? item.demonstratedLevel
            : fallbackLevel,
        strengths: stringList(item.strengths, 4),
        weaknesses: stringList(item.weaknesses, 4),
        evidence: String(item.evidence || "Observed in candidate responses."),
      }))
    : [];

  // Parse soft skills assessed
  const softSkills: AssessedSoftSkill[] = Array.isArray(parsed.softSkills)
    ? parsed.softSkills.map((item: any) => ({
        skill: String(item.skill || "Communication"),
        assessment: String(item.assessment || "Demonstrated in conversation."),
        evidence: String(item.evidence || "Observed during responses."),
      }))
    : [
        {
          skill: "Technical Communication",
          assessment: "Articulated technical thoughts during questioning.",
          evidence: "Demonstrated across conversation turns.",
        },
        {
          skill: "Problem Solving",
          assessment: "Approached scenario questions with structured reasoning.",
          evidence: "Observed in answer progression.",
        },
      ];

  const overallStrengths = stringList(parsed.overallStrengths || parsed.strengths, 6);
  const overallWeaknesses = stringList(parsed.overallWeaknesses || parsed.weaknesses, 6);
  const topicsToImprove = stringList(parsed.topicsToImprove, 6);
  const demonstratedLevel =
    parsed.demonstratedLevel === "Beginner" ||
    parsed.demonstratedLevel === "Advanced" ||
    parsed.demonstratedLevel === "Intermediate"
      ? parsed.demonstratedLevel
      : fallbackLevel;

  return {
    score: rawScore,
    demonstratedLevel,
    technicalSkills,
    softSkills,
    overallStrengths,
    overallWeaknesses,
    topicsToImprove,
    overallFeedback: typeof parsed.overallFeedback === "string" ? parsed.overallFeedback : "",

    // Compatibility mappings:
    technicalKnowledge: clamp(parsed.technicalKnowledge, 0, 10, Math.round(rawScore / 10)),
    problemSolving: clamp(parsed.problemSolving, 0, 10, Math.round(rawScore / 10)),
    communication: clamp(parsed.communication, 0, 10, Math.round(rawScore / 10)),
    strengths: overallStrengths,
    weaknesses: overallWeaknesses,
    skillGap: {
      strong: overallStrengths.slice(0, 4),
      needsImprovement: overallWeaknesses.slice(0, 4),
    },
  };
}

export async function calculateResult(
  messages: { type: "Assistant" | "User"; message: string; createdAt: Date }[],
  githubMetadata: unknown,
  context?: {
    role?: string | null;
    company?: string | null;
    targetSkill?: string | null;
    selfAssessedLevel?: string | null;
    roleSkills?: unknown;
  },
): Promise<InterviewEvaluation> {
  const fallbackLevel =
    context?.selfAssessedLevel === "Advanced"
      ? "Advanced"
      : context?.selfAssessedLevel === "Beginner"
        ? "Beginner"
        : "Intermediate";

  const systemPrompt = `You are a rigorous, evidence-based principal engineering interviewer conducting the final evaluation of an interview.

Target Role Profile:
- Role: ${context?.role ?? "Software Engineer"}
- Company: ${context?.company ?? "Tech Company"}
- Primary Skill Target: ${context?.targetSkill ?? "Software Development"}
- Candidate Self-Assessed Level: ${context?.selfAssessedLevel ?? "Intermediate"}
${context?.roleSkills ? `- Evaluated Role Framework Competencies: ${JSON.stringify(context.roleSkills)}` : ""}

CRITICAL EVALUATION GUIDELINES:
1. Evaluate ONLY skills and topics that were ACTUALLY discussed and tested in the transcript.
2. If a skill was NOT tested in the transcript, DO NOT invent candidate responses, scores, or hallucinate evidence.
3. For each assessed technical skill:
   - Provide a realistic score from 0 to 100.
   - Assign the demonstrated level ("Beginner" | "Intermediate" | "Advanced").
   - List concrete strengths and weaknesses observed.
   - Quote or cite specific evidence from the candidate's actual answers.
4. Evaluate soft skills (Communication, Problem Solving, Structure) based on their actual phrasing and clarity.
5. Accurately distinguish:
   - Self-assessed level: ${context?.selfAssessedLevel ?? "Intermediate"}
   - Demonstrated level: what their actual depth proved in this interview.
6. Provide actionable topics to improve and constructive overall feedback.

Return ONLY valid JSON with this exact shape:
{
  "score": 0-100 integer,
  "demonstratedLevel": "Beginner | Intermediate | Advanced",
  "technicalSkills": [
    {
      "skill": "Name of assessed skill",
      "score": 0-100 integer,
      "demonstratedLevel": "Beginner | Intermediate | Advanced",
      "strengths": ["specific strength 1", "specific strength 2"],
      "weaknesses": ["specific gap 1"],
      "evidence": "concrete quotation or observed evidence from candidate's answer"
    }
  ],
  "softSkills": [
    {
      "skill": "Communication / Problem Solving",
      "assessment": "concise observation",
      "evidence": "observed in response to question X"
    }
  ],
  "overallStrengths": ["strength 1", "strength 2"],
  "overallWeaknesses": ["weakness 1", "weakness 2"],
  "topicsToImprove": ["topic 1", "topic 2", "topic 3"],
  "overallFeedback": "3-4 sentences of supportive, realistic, evidence-based feedback"
}`;

  const response = await askOmniRoute([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        githubContext: githubMetadata ?? null,
        transcript: messages.map((m) => ({
          speaker: m.type === "Assistant" ? "interviewer" : "candidate",
          message: m.message,
        })),
      }),
    },
  ]);

  try {
    return parseEvaluation(response, fallbackLevel);
  } catch (error) {
    console.error("OmniRoute evaluation parse error:", error);
    throw new Error("OmniRoute returned an invalid interview evaluation");
  }
}
