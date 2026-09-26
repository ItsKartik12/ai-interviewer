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
  score: number; // 0-100, evidence-based
  assessment: string;
  evidence: string;
};

export type NotAssessedSoftSkill = {
  skill: string;
  reason: string;
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
  notAssessedSoftSkills: NotAssessedSoftSkill[];
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
  knownSelectedSoftSkills: string[] = [],
): InterviewEvaluation {
  const candidate = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(
      candidate.slice(start >= 0 ? start : 0, end >= 0 ? end + 1 : undefined),
    ) as Record<string, unknown>;
  } catch (err) {
    try {
      const sanitized = candidate
        .slice(start >= 0 ? start : 0, end >= 0 ? end + 1 : undefined)
        .replace(/,\s*([}\]])/g, "$1");
      parsed = JSON.parse(sanitized) as Record<string, unknown>;
    } catch {
      console.warn("AI evaluation JSON parse failed; generating resilient structured fallback.");
      parsed = {};
    }
  }

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

  // Parse soft skills assessed — scored 0-100, evidence-gated.
  const rawSoft = Array.isArray(parsed.softSkills) ? parsed.softSkills : [];
  const softSkills: AssessedSoftSkill[] = rawSoft
    .map((item: any) => ({
      skill: String(item?.skill || "").trim(),
      // Require an explicit finite number: clamp(null) would coerce to 0 and
      // let a fabricated zero slip through the evidence gate.
      score:
        typeof item?.score === "number" && Number.isFinite(item.score)
          ? Math.max(0, Math.min(100, Math.round(item.score)))
          : -1,
      assessment: String(item?.assessment || "").trim(),
      evidence: String(item?.evidence || "").trim(),
    }))
    .filter((s: AssessedSoftSkill) => s.skill)
    // EVIDENCE GATE: a soft skill is only scored when the evaluator could
    // cite concrete transcript evidence AND supplied a valid 0-100 score.
    // Anything else degrades to Not Assessed — never a fabricated 0.
    .filter((s: AssessedSoftSkill) => s.score >= 0 && s.evidence.length >= 20);

  const softAssessedNames = new Set(
    softSkills.map((s) => s.skill.trim().toLowerCase()),
  );

  // Soft skills the candidate selected but the interview produced no citable
  // evidence for must surface as Not Assessed (with reason), never scored.
  const notAssessedSoftSkills: NotAssessedSoftSkill[] = [];
  const rawNotAssessedSoft = Array.isArray(parsed.notAssessedSoftSkills)
    ? parsed.notAssessedSoftSkills
    : [];
  for (const item of rawNotAssessedSoft) {
    const name =
      item && typeof item === "object" && typeof item.skill === "string"
        ? item.skill.trim()
        : typeof item === "string"
          ? item.trim()
          : "";
    if (!name) continue;
    if (softAssessedNames.has(name.toLowerCase())) continue;
    if (notAssessedSoftSkills.some((s) => s.skill.toLowerCase() === name.toLowerCase()))
      continue;
    notAssessedSoftSkills.push({
      skill: name,
      reason:
        item && typeof item === "object" && typeof item.reason === "string" && item.reason.trim()
          ? item.reason.trim()
          : "Not assessed — no sufficient evidence in this interview session",
    });
  }
  // Ensure every known selected soft skill is accounted for.
  for (const selected of knownSelectedSoftSkills) {
    const norm = selected.trim().toLowerCase();
    const isAssessed = Array.from(softAssessedNames).some(
      (assessed) => assessed.includes(norm) || norm.includes(assessed),
    );
    if (
      !isAssessed &&
      !notAssessedSoftSkills.some((s) => s.skill.trim().toLowerCase() === norm)
    ) {
      notAssessedSoftSkills.push({
        skill: selected.trim(),
        reason: "Not covered in this interview session",
      });
    }
  }

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
    notAssessedSoftSkills,
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
    selectedSkills?: string[] | null;
    selectedSoftSkills?: string[] | null;
    selfAssessedLevel?: string | null;
    roleSkills?: unknown;
    resumeContext?: { technologies?: string[] } | null;
  },
): Promise<InterviewEvaluation> {
  return calculateResultWithAi(askOmniRoute, messages, githubMetadata, context);
}

/**
 * Core evaluation implementation. Injectable `ai` requester keeps the
 * evidence-based evaluation logic testable and lets the result route pass
 * a low-temperature, JSON-mode request through the existing provider router.
 */
export async function calculateResultWithAi(
  ai: (messages: { role: "system" | "user" | "assistant"; content: string }[], options?: { temperature?: number; jsonOutput?: boolean }) => Promise<string>,
  messages: { type: "Assistant" | "User"; message: string; createdAt: Date }[],
  githubMetadata: unknown,
  context?: {
    role?: string | null;
    company?: string | null;
    targetSkill?: string | null;
    selectedSkills?: string[] | null;
    selectedSoftSkills?: string[] | null;
    selfAssessedLevel?: string | null;
    roleSkills?: unknown;
    resumeContext?: { technologies?: string[] } | null;
  },
): Promise<InterviewEvaluation> {
  const fallbackLevel =
    context?.selfAssessedLevel === "Advanced"
      ? "Advanced"
      : context?.selfAssessedLevel === "Beginner"
        ? "Beginner"
        : "Intermediate";

  // Collect candidate selected skills
  const selectedSkillsSet = new Set<string>();
  if (Array.isArray(context?.selectedSkills) && context.selectedSkills.length > 0) {
    for (const s of context.selectedSkills) {
      if (typeof s === "string" && s.trim()) selectedSkillsSet.add(s.trim());
    }
  } else if (context?.targetSkill) {
    selectedSkillsSet.add(context.targetSkill.trim());
  }

  // Also collect recommended skills from roleSkills for unassessed tracking
  const allRecommendedSkills: string[] = [];
  if (context?.roleSkills && typeof context.roleSkills === "object") {
    const rs = context.roleSkills as Record<string, unknown>;
    if (Array.isArray(rs.technicalSkills)) {
      for (const item of rs.technicalSkills) {
        if (item && typeof item.skill === "string" && item.skill.trim()) {
          allRecommendedSkills.push(item.skill.trim());
        }
      }
    }
  }

  const selectedSkillsList = Array.from(selectedSkillsSet);
  if (selectedSkillsList.length === 0 && allRecommendedSkills.length > 0) {
    // If no specific selection was recorded, treat top recommended as selected
    selectedSkillsList.push(...allRecommendedSkills.slice(0, 3));
  }

  // Selected soft skills to evaluate (fall back to standard defaults when the
  // candidate made no explicit selection).
  const selectedSoftSkillsList =
    Array.isArray(context?.selectedSoftSkills) &&
    context.selectedSoftSkills.some((s) => typeof s === "string" && s.trim())
      ? context.selectedSoftSkills.filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        )
      : ["Technical Communication", "Problem Solving"];

  const systemPrompt = `You are a rigorous, evidence-based principal engineering interviewer conducting the final evaluation of an interview.

Target Role Profile:
- Role: ${context?.role ?? "Software Engineer"}
- Company: ${context?.company ?? "Tech Company"}
- Primary Selected Skill Focus: ${context?.targetSkill ?? selectedSkillsList.join(", ") ?? "Software Development"}
- Candidate Self-Assessed Level: ${context?.selfAssessedLevel ?? "Intermediate"}
- Candidate Selected Skills: ${JSON.stringify(selectedSkillsList)}
- All Role Recommended Skills: ${JSON.stringify(allRecommendedSkills)}

CRITICAL EVALUATION GUIDELINES (EVIDENCE-BASED EVALUATION):
1. Distinguish between:
   - "Selected Skills": Skills chosen for evaluation (${JSON.stringify(selectedSkillsList)}).
   - "assessedSkills": Skills that were ACTUALLY questioned, tested, and demonstrated in the transcript.
   - "notAssessedSkills": Recommended or selected skills that were NOT tested during the interview.
2. UNTESTED SKILL PROTECTION:
   - For skills in "notAssessedSkills", you MUST NOT assign a fabricated score, fabricated strengths, or fabricated weaknesses.
   - List them strictly with { "skill": "Skill Name", "reason": "Not assessed — this skill was not sufficiently tested during the interview." }.
3. For each assessed skill:
   - Provide a realistic score from 0 to 100 based solely on their answers in the transcript.
   - Assign the demonstrated level ("Beginner" | "Intermediate" | "Advanced").
   - List concrete strengths and weaknesses observed.
   - Quote or cite specific evidence from the candidate's actual answers.

4. Evaluate the candidate's SELECTED soft skills (${JSON.stringify(
         selectedSoftSkillsList.length > 0
           ? selectedSoftSkillsList
           : ["Technical Communication", "Problem Solving"],
       )}) based ONLY on observable evidence in the transcript (clarity of explanations, structured reasoning, how they describe collaboration, conflict, ownership, adaptability).
   - For each soft skill with sufficient evidence: include it in "softSkills" with a realistic 0-100 score, a concise assessment, and a concrete evidence citation (quote or describe the specific answer).
   - If a selected soft skill has NO sufficient evidence in the transcript (it was never probed or the answers were too thin to judge), put it in "notAssessedSoftSkills" with a reason. NEVER assign it a fabricated score and NEVER use 0 as a placeholder.
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
      "skill": "Assessed soft skill name",
      "score": 0-100 integer,
      "assessment": "concise observation",
      "evidence": "concrete quotation or observed proof from the candidate's answers (required — at least one specific moment)"
    }
  ],
  "notAssessedSoftSkills": [
    {
      "skill": "Selected soft skill without sufficient evidence",
      "reason": "Not assessed — no sufficient evidence in this interview session"
    }
  ],
  "overallStrengths": ["strength 1", "strength 2"],
  "overallWeaknesses": ["weakness 1", "weakness 2"],
  "topicsToImprove": ["topic 1", "topic 2", "topic 3"],
  "overallFeedback": "3-4 sentences of supportive, realistic, evidence-based feedback"
}`;

  // Evaluation consistency: low temperature + native JSON output (Gemini path).
  // Provider fallback remains fully intact through the injected requester.
  const response = await ai(
    [
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
    ],
    { temperature: 0.2, jsonOutput: true },
  );

  try {
    return parseEvaluation(response, fallbackLevel, selectedSkillsList, selectedSoftSkillsList);
  } catch (error) {
    console.error("AI evaluation parse error, using safe fallback structure:", error);
    return parseEvaluation("{}", fallbackLevel, selectedSkillsList, selectedSoftSkillsList);
  }
}
