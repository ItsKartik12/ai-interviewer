import { askOmniRoute } from "./omniroute.ts";

export type AssessedSkill = {
  skill: string;
  score: number; // 0-100
  demonstratedLevel: "Beginner" | "Intermediate" | "Advanced";
  strengths: string[];
  weaknesses: string[];
  evidence: string;
};

export type NotAssessedSkill = {
  skill: string;
  reason: string;
};

export type AssessedSoftSkill = {
  skill: string;
  assessment: string;
  evidence: string;
};

export type InterviewEvaluation = {
  score: number; // 0-100
  demonstratedLevel: "Beginner" | "Intermediate" | "Advanced";
  selfAssessedLevel?: "Beginner" | "Intermediate" | "Advanced";
  selectedSkills: string[];
  assessedSkills: AssessedSkill[];
  notAssessedSkills: NotAssessedSkill[];
  technicalSkills: AssessedSkill[]; // Alias for compatibility
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

function parseEvaluation(
  response: string,
  fallbackLevel: "Beginner" | "Intermediate" | "Advanced" = "Intermediate",
  knownSelectedSkills: string[] = [],
): InterviewEvaluation {
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
  const rawAssessed = Array.isArray(parsed.assessedSkills)
    ? parsed.assessedSkills
    : Array.isArray(parsed.technicalSkills)
      ? parsed.technicalSkills
      : [];

  const assessedSkills: AssessedSkill[] = rawAssessed.map((item: any) => ({
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
    evidence: String(item.evidence || "Demonstrated in candidate responses."),
  }));

  // Track which skills have been evaluated
  const assessedSkillNames = new Set(
    assessedSkills.map((s) => s.skill.trim().toLowerCase()),
  );

  // Parse not assessed skills from LLM
  const notAssessedSkills: NotAssessedSkill[] = [];
  if (Array.isArray(parsed.notAssessedSkills)) {
    for (const item of parsed.notAssessedSkills) {
      if (item && typeof item.skill === "string") {
        notAssessedSkills.push({
          skill: item.skill.trim(),
          reason:
            typeof item.reason === "string" && item.reason.trim()
              ? item.reason.trim()
              : "Not tested in this interview session",
        });
      } else if (typeof item === "string") {
        notAssessedSkills.push({
          skill: item.trim(),
          reason: "Not tested in this interview session",
        });
      }
    }
  }

  // Ensure any known selected skill that wasn't assessed is listed under notAssessedSkills
  for (const selected of knownSelectedSkills) {
    const norm = selected.trim().toLowerCase();
    const isAssessed = Array.from(assessedSkillNames).some(
      (assessed) => assessed.includes(norm) || norm.includes(assessed),
    );
    const alreadyInUnassessed = notAssessedSkills.some(
      (u) => u.skill.trim().toLowerCase() === norm,
    );

    if (!isAssessed && !alreadyInUnassessed) {
      notAssessedSkills.push({
        skill: selected.trim(),
        reason: "Not covered in this interview session",
      });
    }
  }

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
    selectedSkills: knownSelectedSkills,
    assessedSkills,
    notAssessedSkills,
    technicalSkills: assessedSkills,
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

  // Collect all candidate selected skills
  const selectedSkillsSet = new Set<string>();
  if (context?.targetSkill) selectedSkillsSet.add(context.targetSkill.trim());

  if (context?.roleSkills && typeof context.roleSkills === "object") {
    const rs = context.roleSkills as Record<string, unknown>;
    if (Array.isArray(rs.technicalSkills)) {
      for (const item of rs.technicalSkills) {
        if (item && typeof item.skill === "string") {
          selectedSkillsSet.add(item.skill.trim());
        }
      }
    }
  }

  const selectedSkillsList = Array.from(selectedSkillsSet);

  const systemPrompt = `You are a rigorous, evidence-based principal engineering interviewer conducting the final evaluation of an interview.

Target Role Profile:
- Role: ${context?.role ?? "Software Engineer"}
- Company: ${context?.company ?? "Tech Company"}
- Primary Skill Target: ${context?.targetSkill ?? "Software Development"}
- Candidate Self-Assessed Level: ${context?.selfAssessedLevel ?? "Intermediate"}
- Selected Skills from Candidate Profile: ${JSON.stringify(selectedSkillsList)}

CRITICAL EVALUATION GUIDELINES (EVIDENCE-BASED EVALUATION):
1. Distinguish between:
   - "Selected Skills": Skills chosen in the profile (${JSON.stringify(selectedSkillsList)}).
   - "assessedSkills": Skills that were ACTUALLY questioned, tested, and demonstrated in the transcript.
   - "notAssessedSkills": Selected skills that were NOT tested during the interview.
2. UNTESTED SKILL PROTECTION:
   - For skills in "notAssessedSkills", you MUST NOT assign a fabricated score, fabricated strengths, or fabricated weaknesses.
   - List them strictly with { "skill": "Skill Name", "reason": "Not tested in this interview session" }.
3. For each assessed skill:
   - Provide a realistic score from 0 to 100 based solely on their answers in the transcript.
   - Assign the demonstrated level ("Beginner" | "Intermediate" | "Advanced").
   - List concrete strengths and weaknesses observed.
   - Quote or cite specific evidence from the candidate's actual answers.
4. Evaluate soft skills (Communication, Problem Solving, Structure) based on their actual phrasing and clarity.
5. Overall score must be derived ONLY from assessed skills and discussion depth (not from untested skills or GitHub repo presence).

Return ONLY valid JSON with this exact shape:
{
  "score": 0-100 integer,
  "demonstratedLevel": "Beginner | Intermediate | Advanced",
  "assessedSkills": [
    {
      "skill": "Name of actually assessed skill",
      "score": 0-100 integer,
      "demonstratedLevel": "Beginner | Intermediate | Advanced",
      "strengths": ["concrete strength 1", "concrete strength 2"],
      "weaknesses": ["specific gap 1"],
      "evidence": "exact quotation or observed proof from candidate's answer"
    }
  ],
  "notAssessedSkills": [
    {
      "skill": "Skill not tested",
      "reason": "Not tested in this interview session"
    }
  ],
  "softSkills": [
    {
      "skill": "Technical Communication / Problem Solving",
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
    return parseEvaluation(response, fallbackLevel, selectedSkillsList);
  } catch (error) {
    console.error("OmniRoute evaluation parse error:", error);
    throw new Error("OmniRoute returned an invalid interview evaluation");
  }
}
