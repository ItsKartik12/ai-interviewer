import type {
  InterviewDifficulty,
  MessageType,
} from "./generated/prisma/client";
import { askOmniRoute } from "./omniroute.ts";

export type InterviewMessage = {
  type: MessageType;
  message: string;
};

export type SkillItem = {
  skill: string;
  importance: "high" | "medium" | "core" | "important" | "bonus";
  reason: string;
  rationale?: string;
};

export type RoleSkillRequirement = {
  role: string;
  company: string;
  level: string;
  technicalSkills: SkillItem[];
  softSkills: SkillItem[];
  summary?: string;
};

export type QuestionType =
  | "introduction"
  | "behavioral"
  | "conceptual"
  | "practical"
  | "debugging"
  | "scenario"
  | "architecture"
  | "trade-off"
  | "follow-up"
  | "wrap-up";

export type InterviewStage =
  | "stage_1_introduction"
  | "stage_2_behavioral"
  | "stage_3_project_deep_dive"
  | "stage_4_github_tech"
  | "stage_5_core_skills"
  | "stage_6_scenarios_debugging"
  | "stage_7_wrap_up";

export type AnswerQuality =
  | "strong"
  | "shallow"
  | "vague"
  | "partial"
  | "incorrect"
  | "initial_greeting";

export type InterviewDecision = {
  question: string;
  difficulty: InterviewDifficulty;
  topic: string;
  questionType: QuestionType;
  skillAssessed: string;
  followUp: boolean;
  finished: boolean;
  stage?: InterviewStage;
  answerQuality?: AnswerQuality;
  interviewerBridge?: string;
};

const VALID_QUESTION_TYPES: QuestionType[] = [
  "introduction",
  "behavioral",
  "conceptual",
  "practical",
  "debugging",
  "scenario",
  "architecture",
  "trade-off",
  "follow-up",
  "wrap-up",
];

function asGithubContext(githubMetadata: unknown): string {
  if (!githubMetadata || typeof githubMetadata !== "object") {
    return "No verified GitHub information is available. Ask the candidate directly about their personal projects.";
  }

  const meta = githubMetadata as Record<string, unknown>;
  if (meta.summary && typeof meta.summary === "string") {
    return meta.summary;
  }

  return JSON.stringify(githubMetadata);
}

function normalizeDifficulty(
  value: unknown,
  fallback: InterviewDifficulty,
): InterviewDifficulty {
  if (
    value === "Beginner" ||
    value === "Intermediate" ||
    value === "Advanced"
  ) {
    return value;
  }
  return fallback;
}

function normalizeQuestionType(value: unknown): QuestionType {
  if (typeof value === "string" && VALID_QUESTION_TYPES.includes(value as QuestionType)) {
    return value as QuestionType;
  }
  return "conceptual";
}

/**
 * Determine the interview stage based on conversation progress and turn history.
 */
export function determineInterviewStage(
  questionCount: number,
  lastQuestionType?: QuestionType,
  lastAnswerQuality?: AnswerQuality,
): InterviewStage {
  if (questionCount === 0) return "stage_1_introduction";
  if (questionCount === 1) return "stage_2_behavioral";
  if (questionCount === 2) return "stage_3_project_deep_dive";

  // If candidate gave a shallow answer in project stage, stay for deep dive
  if (questionCount === 3) {
    return lastAnswerQuality === "shallow" || lastAnswerQuality === "vague"
      ? "stage_3_project_deep_dive"
      : "stage_4_github_tech";
  }

  if (questionCount === 4) return "stage_5_core_skills";
  if (questionCount === 5) return "stage_5_core_skills";
  if (questionCount === 6) return "stage_6_scenarios_debugging";
  return "stage_7_wrap_up";
}

export function parseInterviewDecision(
  response: string,
  fallbackDifficulty: InterviewDifficulty,
  currentStage?: InterviewStage,
): InterviewDecision {
  const candidate = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const question =
      typeof parsed.question === "string" ? parsed.question.trim() : "";

    if (question) {
      const parsedQuality = parsed.answerQuality || parsed.answerAssessment;
      let quality: AnswerQuality = "strong";
      if (typeof parsedQuality === "string") {
        quality = parsedQuality as AnswerQuality;
      } else if (parsedQuality && typeof (parsedQuality as any).quality === "string") {
        quality = (parsedQuality as any).quality as AnswerQuality;
      }

      return {
        question,
        difficulty: normalizeDifficulty(parsed.difficulty, fallbackDifficulty),
        topic:
          typeof parsed.topic === "string" && parsed.topic.trim()
            ? parsed.topic.trim()
            : "Engineering",
        questionType: normalizeQuestionType(parsed.questionType),
        skillAssessed:
          typeof parsed.skillAssessed === "string" && parsed.skillAssessed.trim()
            ? parsed.skillAssessed.trim()
            : "Software Engineering",
        followUp: parsed.followUp === true,
        finished: parsed.finished === true,
        stage: (parsed.stage as InterviewStage) || currentStage,
        answerQuality: quality,
      };
    }
  } catch {
    // Plain-text response fallback
  }

  return {
    question: response.trim(),
    difficulty: fallbackDifficulty,
    topic: "Engineering",
    questionType: "conceptual",
    skillAssessed: "Software Engineering",
    followUp: false,
    finished: false,
    stage: currentStage,
  };
}

/**
 * Heuristic default skills when LLM is offline or in test environments.
 */
function getHeuristicSkills(role: string, level: string): RoleSkillRequirement {
  const isFrontend = /front|react|web|ui|javascript|css/i.test(role);
  const isBackend = /back|node|api|database|system|server|python|java/i.test(role);
  const isSenior = /senior|lead|architect|advanced/i.test(level);

  if (isFrontend) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "JavaScript Fundamentals & Event Loop", importance: "high", reason: "Foundational runtime, closures, and async flow" },
        { skill: "React Architecture & Lifecycle", importance: "high", reason: "Component reconciliation, state management, and re-renders" },
        { skill: "Web Performance & Optimization", importance: isSenior ? "high" : "medium", reason: "Core Web Vitals, memory management, and bundle efficiency" },
        { skill: "CSS & Responsive UI", importance: "medium", reason: "Resilient responsive layouts and modern styling" },
      ],
      softSkills: [
        { skill: "Technical Communication", importance: "high", reason: "Articulating component design and trade-offs clearly" },
        { skill: "Structured Problem Solving", importance: "high", reason: "Methodically troubleshooting async state issues and browser edge cases" },
        { skill: isSenior ? "Architectural Trade-offs" : "Learning Agility", importance: "medium", reason: isSenior ? "Weighing long-term maintenance costs" : "Adopting evolving libraries" },
      ],
    };
  }

  if (isBackend) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "API Design & HTTP Contracts", importance: "high", reason: "Resilient REST/GraphQL contracts and error handling" },
        { skill: "Database Schema & Query Optimization", importance: "high", reason: "Indexing, relational integrity, and transaction boundaries" },
        { skill: "System Architecture & Scaling", importance: isSenior ? "high" : "medium", reason: "Load handling, caching, and async workers" },
        { skill: "Security & Authentication", importance: "medium", reason: "Securing endpoints and managing JWT/credentials" },
      ],
      softSkills: [
        { skill: "Problem Solving", importance: "high", reason: "Isolating distributed bottlenecks methodically" },
        { skill: "Technical Communication", importance: "high", reason: "Explaining API contracts and collaborating with clients" },
        { skill: "Engineering Trade-offs", importance: "medium", reason: "Balancing consistency vs latency vs development velocity" },
      ],
    };
  }

  return {
    role,
    company: "Target Company",
    level,
    technicalSkills: [
      { skill: "Data Structures & Computational Efficiency", importance: "high", reason: "Selecting appropriate algorithms and space/time tradeoffs" },
      { skill: "Clean Code & Modularity", importance: "high", reason: "Maintainable, testable, and decoupled codebases" },
      { skill: "Debugging & Problem Diagnosis", importance: "high", reason: "Isolating root causes with structured analysis" },
      { skill: "System Architecture", importance: isSenior ? "high" : "medium", reason: "Designing scalable components" },
    ],
    softSkills: [
      { skill: "Clear Communication", importance: "high", reason: "Explaining thought process during technical reasoning" },
      { skill: "Analytical Thinking", importance: "high", reason: "Breaking down ambiguous requirements into actionable steps" },
      { skill: "Handling Feedback", importance: "medium", reason: "Iterating collaboratively on technical solutions" },
    ],
  };
}

/**
 * Dynamically generate recommended role skills using OmniRoute with robust heuristic fallback.
 */
export async function generateRoleSkills(args: {
  role: string;
  company?: string;
  level?: string;
  targetSkill?: string;
  skill?: string;
  githubMetadata?: unknown;
  context?: string;
}): Promise<RoleSkillRequirement> {
  const resolvedCompany = args.company || "Target Company";
  const resolvedLevel = args.level || "Intermediate";
  const resolvedSkill = args.targetSkill || args.skill || "Software Development";

  const heuristic = getHeuristicSkills(args.role, resolvedLevel);
  heuristic.company = resolvedCompany;
  heuristic.summary = `Recommended competencies for ${args.role} at ${resolvedCompany} (${resolvedLevel} level).`;

  try {
    const prompt = `You are a principal technical recruiter and engineering leader.
Analyze this interview target profile and output recommended technical and soft skills for this specific role, company, and seniority level:
- Target Role: ${args.role}
- Target Company: ${resolvedCompany}
- Seniority Level: ${resolvedLevel}
- Primary Skill Focus: ${resolvedSkill}
- Candidate GitHub context: ${asGithubContext(args.githubMetadata)}

Do NOT claim these are verified official company criteria; frame them as realistic, recommended skills for this profile.

Return ONLY valid JSON with this exact shape:
{
  "role": "${args.role}",
  "company": "${resolvedCompany}",
  "level": "${resolvedLevel}",
  "summary": "Recommended evaluation framework for ${args.role} at ${resolvedCompany}",
  "technicalSkills": [
    { "skill": "Skill Name", "importance": "high", "reason": "concise rationale" }
  ],
  "softSkills": [
    { "skill": "Skill Name", "importance": "high", "reason": "concise rationale" }
  ]
}
Include 3 to 5 key technical skills and 2 to 3 soft skills. Keep rationales concise (1 sentence).`;

    const response = await askOmniRoute([
      { role: "system", content: "You are an expert technical interviewer who returns strictly valid JSON." },
      { role: "user", content: prompt },
    ]);

    const cleaned = response
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Partial<RoleSkillRequirement>;
    if (
      Array.isArray(parsed.technicalSkills) &&
      parsed.technicalSkills.length > 0 &&
      Array.isArray(parsed.softSkills) &&
      parsed.softSkills.length > 0
    ) {
      return {
        role: args.role,
        company: resolvedCompany,
        level: resolvedLevel,
        summary: parsed.summary || `Recommended competencies for ${args.role} at ${resolvedCompany}`,
        technicalSkills: parsed.technicalSkills.map((item) => ({
          skill: String(item.skill || "Technical Skill"),
          importance: item.importance === "medium" ? "medium" : "high",
          reason: String(item.reason || item.rationale || "Relevant for the role"),
          rationale: String(item.rationale || item.reason || "Relevant for the role"),
        })),
        softSkills: parsed.softSkills.map((item) => ({
          skill: String(item.skill || "Soft Skill"),
          importance: item.importance === "medium" ? "medium" : "high",
          reason: String(item.reason || item.rationale || "Essential interpersonal skill"),
          rationale: String(item.rationale || item.reason || "Essential interpersonal skill"),
        })),
      };
    }
  } catch (error) {
    console.warn("Using heuristic role skills fallback:", error instanceof Error ? error.message : error);
  }

  return {
    ...heuristic,
    technicalSkills: heuristic.technicalSkills.map((item) => ({
      ...item,
      rationale: item.reason,
    })),
    softSkills: heuristic.softSkills.map((item) => ({
      ...item,
      rationale: item.reason,
    })),
  };
}

export function buildInterviewSystemPrompt(args: {
  githubMetadata: unknown;
  difficulty: InterviewDifficulty;
  targetSkill?: string | null;
  selfAssessedLevel?: InterviewDifficulty | null;
  targetCompany?: string | null;
  targetRole?: string | null;
  roleSkills?: RoleSkillRequirement | null;
  questionCount: number;
  coveredTopics: string[];
  durationMinutes: number;
  previousQuestions?: string[];
  currentStage?: InterviewStage;
}): string {
  const topics =
    args.coveredTopics.length > 0 ? args.coveredTopics.join(", ") : "none yet";

  const questionHistory =
    args.previousQuestions && args.previousQuestions.length > 0
      ? args.previousQuestions.map((q, i) => `${i + 1}. "${q}"`).join("\n")
      : "None yet (Turn 1 introduction)";

  // Format competencies from roleSkills
  const technicalCompetencies = args.roleSkills?.technicalSkills?.length
    ? args.roleSkills.technicalSkills.map((s) => `- ${s.skill} (${s.importance}): ${s.reason}`).join("\n")
    : `- ${args.targetSkill ?? "General Software Development"}: Core focus for this interview`;

  const softCompetencies = args.roleSkills?.softSkills?.length
    ? args.roleSkills.softSkills.map((s) => `- ${s.skill}: ${s.reason}`).join("\n")
    : "- Technical Communication: Explaining engineering thoughts clearly\n- Problem Solving: Systematic debugging and design";

  const stage = args.currentStage || determineInterviewStage(args.questionCount);

  return `You are an experienced, professional, and observant human technical interviewer conducting a live software engineering interview.

Target Profile:
- Role: ${args.targetRole ?? "Software Developer"}
- Target Company: ${args.targetCompany ?? "Tech Company"} (use company context naturally for scale/expectations, never pretend to leak confidential company questions)
- Candidate Stated Level: ${args.selfAssessedLevel ?? args.difficulty}
- Current Session Difficulty: ${args.difficulty}
- Target Duration: ${args.durationMinutes} minutes

Required Competencies to Evaluate:
Technical Skills:
${technicalCompetencies}

Soft Skills:
${softCompetencies}

Candidate GitHub Context (Use as background evidence for project topics, but treat as unverified until candidate explains their personal ownership):
${asGithubContext(args.githubMetadata)}

Session Progress:
- Questions Completed: ${args.questionCount}
- Active Interview Stage: ${stage}
- Topics Already Covered: ${topics}

Questions Already Asked:
${questionHistory}

INTERVIEW STRUCTURE & STAGES:
1. Stage 1 (Introduction & Icebreaker):
   - Welcome candidate warmly and professionally to their interview for ${args.targetRole ?? "the role"} at ${args.targetCompany ?? "our company"}.
   - In 1 sentence, explain the structure: starting with background and a standout project, moving into role-specific technical questions, and exploring practical scenarios.
   - Ask an open icebreaker: introduce their background and describe a technical project they built or are proud of.
2. Stage 2 (General / Behavioral Question):
   - Ask a normal behavioral question calibrated to seniority:
     * Junior/Mid: A difficult bug or unexpected roadblock faced in a project and how they solved it; or how they approach learning unfamiliar technologies.
     * Senior: Handling a technical disagreement, managing technical debt vs velocity, or post-mortem of a production incident.
3. Stage 3 (Project Deep-Dive & Architecture):
   - Investigate the project the candidate mentioned or a standout project from their GitHub.
   - Ask about architecture, why they chose specific libraries, how state/data flows, and critically: "What part did you personally implement?"
4. Stage 4 (GitHub & Technology Verification):
   - Test understanding of a technology they claimed in their project (e.g. React, Node, PostgreSQL).
   - Do NOT ask merely because package.json contains a dependency. Probe practical choices and trade-offs.
5. Stage 5 (Core Skill Fundamentals):
   - Test fundamental concepts of the primary skill (e.g., in React: reconciliation, component lifecycle/hooks, re-renders, state vs props; in JS: event loop, closures, promises).
6. Stage 6 (Practical Scenarios & Debugging):
   - Give a real-world scenario (e.g., table with 10,000 live updating rows causing lag; memory leak profiling; graceful degradation on network drops).
7. Stage 7 (Retrospective & Wrap-Up):
   - Ask a reflective question ("What would you change if you rebuilt that project with another month?") and conclude politely.

INTERVIEWER BEHAVIOR & RULES:
1. LISTEN BEFORE MOVING ON:
   - If candidate's answer is VAGUE, SHALLOW, or INCOMPLETE (e.g., "PostgreSQL is good for structured data"):
     DO NOT jump to a new topic! Ask a targeted follow-up: "What kind of structured data did you have in your project, and what made PostgreSQL a better fit than a document store?"
   - If candidate's answer is STRONG and DETAILED:
     Acknowledge concisely ("Understood.", "Got it.", "Makes sense.") and advance to the next technical dimension or practical scenario.
2. CONCISE & HUMAN:
   - Ask exactly ONE clear question at a time.
   - Never pile multiple questions together.
   - Never say "Great answer! You're doing fantastic!". Use realistic, neutral professional acknowledgments.
3. NEVER REPEAT:
   - Do not ask questions that repeat previous questions or re-test an already proven topic.
4. COMPLETION:
   - Set finished=true when 7 to 9 rich questions covering background, project, core skills, and scenarios have been completed.

Return ONLY valid JSON with this exact shape:
{
  "answerQuality": "strong | shallow | vague | partial | incorrect",
  "stage": "${stage}",
  "question": "concise spoken question for the candidate",
  "difficulty": "Beginner | Intermediate | Advanced",
  "topic": "current topic area",
  "questionType": "introduction | behavioral | conceptual | practical | debugging | scenario | architecture | trade-off | follow-up | wrap-up",
  "skillAssessed": "specific skill name being tested",
  "followUp": true | false,
  "finished": true | false
}`;
}

export function buildTurnInstruction(args: {
  messages: InterviewMessage[];
  latestAnswer?: string;
  firstTurn?: boolean;
  targetRole?: string | null;
  targetCompany?: string | null;
  currentStage?: InterviewStage;
}): string {
  const conversation = args.messages.map((item) => ({
    speaker: item.type === "Assistant" ? "interviewer" : "candidate",
    message: item.message,
  }));

  if (args.firstTurn) {
    return `Start the interview with Stage 1 (Introduction):
1. Welcome candidate warmly to their interview for ${args.targetRole ?? "the software role"} at ${args.targetCompany ?? "our company"}.
2. State the interview format in 1 sentence (starting with background and project discussion, then technical depth and practical scenarios).
3. Conclude with an open icebreaker asking them to introduce themselves and highlight a standout technical project they've built.
Keep the total opening under 3-4 sentences so it is natural to listen to.`;
  }

  const stage = args.currentStage || "stage_2_behavioral";

  return `The candidate's latest spoken answer was:
"${args.latestAnswer ?? ""}"

Instructions for this turn:
1. Evaluate the candidate's latest answer:
   - Was it shallow, vague, or fewer than 15 words?
   - Did they claim a technology without explaining how they used it?
   - If shallow or vague, set followUp=true and ask a clarifying follow-up question on that SAME topic to test their actual depth.
   - If they gave a strong, well-reasoned answer, set followUp=false and advance to the next question for ${stage}.
2. Check the conversation history to avoid repeating any previous topic or question.
3. Keep your response conversational and concise (1-2 sentences).

Full conversation so far:
${JSON.stringify(conversation)}`;
}

export function questionCount(messages: InterviewMessage[]): number {
  return messages.filter((message) => message.type === "Assistant").length;
}

export function coveredTopics(messages: InterviewMessage[]): string[] {
  const assistantMessages = messages.filter((m) => m.type === "Assistant");
  const extractedTopics = new Set<string>();

  const topicPatterns: [string, RegExp][] = [
    ["React & Component Architecture", /react|component|jsx|hook|useeffect|usestate|re-render|virtual dom/i],
    ["JavaScript & Runtime", /javascript|typescript|closure|event loop|async|promise|prototype/i],
    ["State Management", /state|context|redux|zustand|flux|store/i],
    ["Web Performance", /performance|render|memo|bundle|lazy|lcp|lighthouse/i],
    ["Databases & Data Modeling", /database|sql|postgres|mongodb|query|index|schema|transaction/i],
    ["APIs & Networking", /api|rest|graphql|http|endpoint|fetch|axios/i],
    ["System Design & Scaling", /scale|architecture|concurrency|queue|cache|redis|latency/i],
    ["Debugging & Error Handling", /debug|devtools|memory leak|exception|error|troubleshoot/i],
    ["Project Ownership & Trade-offs", /project|built|trade-off|architecture|decision|refactor/i],
    ["Behavioral & Collaboration", /conflict|priority|roadblock|team|challenge|deadline/i],
  ];

  for (const msg of assistantMessages) {
    for (const [topicName, pattern] of topicPatterns) {
      if (pattern.test(msg.message)) {
        extractedTopics.add(topicName);
      }
    }
  }

  return Array.from(extractedTopics);
}
