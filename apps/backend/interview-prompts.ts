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
  importance: "high" | "medium";
  reason: string;
};

export type RoleSkillRequirement = {
  role: string;
  company: string;
  level: string;
  technicalSkills: SkillItem[];
  softSkills: SkillItem[];
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
  | "follow-up";

export type InterviewDecision = {
  question: string;
  difficulty: InterviewDifficulty;
  topic: string;
  questionType: QuestionType;
  skillAssessed: string;
  followUp: boolean;
  finished: boolean;
};

const TOPICS = [
  "Programming",
  "Data Structures & Algorithms",
  "OOP",
  "Databases",
  "APIs",
  "Web Development",
  "Backend",
  "Software Engineering",
] as const;

function asGithubContext(githubMetadata: unknown): string {
  if (!githubMetadata || typeof githubMetadata !== "object") {
    return "No GitHub information is available.";
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
  const valid: QuestionType[] = [
    "introduction",
    "behavioral",
    "conceptual",
    "practical",
    "debugging",
    "scenario",
    "architecture",
    "trade-off",
    "follow-up",
  ];
  if (typeof value === "string" && valid.includes(value as QuestionType)) {
    return value as QuestionType;
  }
  return "conceptual";
}

export function parseInterviewDecision(
  response: string,
  fallbackDifficulty: InterviewDifficulty,
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
      return {
        question,
        difficulty: normalizeDifficulty(parsed.difficulty, fallbackDifficulty),
        topic:
          typeof parsed.topic === "string" && parsed.topic.trim()
            ? parsed.topic.trim()
            : "Programming",
        questionType: normalizeQuestionType(parsed.questionType),
        skillAssessed:
          typeof parsed.skillAssessed === "string" && parsed.skillAssessed.trim()
            ? parsed.skillAssessed.trim()
            : "Software Engineering",
        followUp: parsed.followUp === true,
        finished: parsed.finished === true,
      };
    }
  } catch {
    // Preserve compatibility with plain-text response
  }

  return {
    question: response.trim(),
    difficulty: fallbackDifficulty,
    topic: "Programming",
    questionType: "conceptual",
    skillAssessed: "Software Engineering",
    followUp: false,
    finished: false,
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
        { skill: "JavaScript & TypeScript", importance: "high", reason: "Foundational web language and type safety" },
        { skill: "React Architecture", importance: "high", reason: "Component lifecycle, state management, and hooks" },
        { skill: "Web Performance & Optimization", importance: isSenior ? "high" : "medium", reason: "Core Web Vitals, asset bundling, and rendering performance" },
        { skill: "CSS & Responsive UI", importance: "medium", reason: "Translating mockups to resilient responsive layouts" },
      ],
      softSkills: [
        { skill: "Technical Communication", importance: "high", reason: "Articulating component design and trade-offs" },
        { skill: "Problem Solving", importance: "high", reason: "Debugging browser quirks and async state issues" },
        { skill: isSenior ? "Technical Mentorship & Review" : "Learning Agility", importance: "medium", reason: isSenior ? "Guiding code quality and team standards" : "Rapidly adopting evolving libraries" },
      ],
    };
  }

  if (isBackend) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "API Design & REST/GraphQL", importance: "high", reason: "Building resilient client-server contracts" },
        { skill: "Database Schema & Query Optimization", importance: "high", reason: "Data integrity, indexing, and transactional boundaries" },
        { skill: "System Architecture & Concurrency", importance: isSenior ? "high" : "medium", reason: "Scaling services under load and handling async workflows" },
        { skill: "Security & Authentication", importance: "medium", reason: "Securing endpoints and managing credentials" },
      ],
      softSkills: [
        { skill: "Problem Solving", importance: "high", reason: "Troubleshooting distributed bugs and performance bottlenecks" },
        { skill: "Technical Communication", importance: "high", reason: "Documenting APIs and collaborating with frontend teams" },
        { skill: "Architectural Decision Making", importance: "medium", reason: "Weighing trade-offs between consistency and latency" },
      ],
    };
  }

  return {
    role,
    company: "Target Company",
    level,
    technicalSkills: [
      { skill: "Data Structures & Algorithms", importance: "high", reason: "Core computational efficiency and code structure" },
      { skill: "Clean Code & Software Design", importance: "high", reason: "Maintainable, testable, and modular implementations" },
      { skill: "Debugging & Problem Diagnosis", importance: "high", reason: "Isolating root causes methodically" },
      { skill: "System Architecture", importance: isSenior ? "high" : "medium", reason: "Designing scalable, decoupled components" },
    ],
    softSkills: [
      { skill: "Clear Communication", importance: "high", reason: "Explaining thought process during technical implementation" },
      { skill: "Analytical Thinking", importance: "high", reason: "Breaking down ambiguous requirements into steps" },
      { skill: "Handling Feedback", importance: "medium", reason: "Iterating collaboratively on technical solutions" },
    ],
  };
}

/**
 * Dynamically generate recommended role skills using OmniRoute with robust heuristic fallback.
 */
export async function generateRoleSkills(args: {
  role: string;
  company: string;
  level: string;
  targetSkill?: string;
  githubMetadata?: unknown;
}): Promise<RoleSkillRequirement> {
  const heuristic = getHeuristicSkills(args.role, args.level);
  heuristic.company = args.company;

  try {
    const prompt = `You are a principal technical recruiter and engineering leader.
Analyze this interview target profile and output recommended technical and soft skills for this specific role, company, and seniority level:
- Target Role: ${args.role}
- Target Company: ${args.company}
- Seniority Level: ${args.level}
- Primary Skill Focus: ${args.targetSkill ?? "Software Development"}
- Candidate GitHub context: ${asGithubContext(args.githubMetadata)}

Do NOT claim these are verified official company criteria; frame them as realistic, recommended skills for this profile.

Return ONLY valid JSON with this exact shape:
{
  "role": "${args.role}",
  "company": "${args.company}",
  "level": "${args.level}",
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
        company: args.company,
        level: args.level,
        technicalSkills: parsed.technicalSkills.map((item) => ({
          skill: String(item.skill || "Technical Skill"),
          importance: item.importance === "medium" ? "medium" : "high",
          reason: String(item.reason || "Relevant for the role"),
        })),
        softSkills: parsed.softSkills.map((item) => ({
          skill: String(item.skill || "Soft Skill"),
          importance: item.importance === "medium" ? "medium" : "high",
          reason: String(item.reason || "Essential interpersonal skill"),
        })),
      };
    }
  } catch (error) {
    console.warn("Using heuristic role skills fallback:", error instanceof Error ? error.message : error);
  }

  return heuristic;
}

export function buildInterviewSystemPrompt(args: {
  githubMetadata: unknown;
  difficulty: InterviewDifficulty;
  targetSkill?: string | null;
  selfAssessedLevel?: InterviewDifficulty | null;
  targetCompany?: string | null;
  targetRole?: string | null;
  questionCount: number;
  coveredTopics: string[];
  durationMinutes: number;
}): string {
  const topics =
    args.coveredTopics.length > 0 ? args.coveredTopics.join(", ") : "none yet";

  return `You are a seasoned, supportive, yet rigorous technical interviewer conducting a realistic software interview.

Interview Target Profile:
- Role: ${args.targetRole ?? "Software Developer"}
- Company: ${args.targetCompany ?? "Tech Company"}
- Candidate Self-Assessed Level: ${args.selfAssessedLevel ?? args.difficulty}
- Primary Skill to Assess: ${args.targetSkill ?? "General Software Development"}
- Target Duration: ${args.durationMinutes} minutes

Candidate GitHub Context (ground questions in these real projects when applicable):
${asGithubContext(args.githubMetadata)}

Current Interview State:
- Questions Completed: ${args.questionCount}
- Difficulty Setting: ${args.difficulty}
- Topics Already Covered: ${topics}

Interview Structure & Pacing:
- Turn 1: Warm introduction & icebreaker. Welcome the candidate, briefly state that you will cover both technical foundations and project experiences, and ask them to introduce themselves and highlight a key project they worked on.
- Turn 2: Behavioral / Problem-solving scenario. Calibrate to candidate seniority:
  * Junior/Beginner: Learning new tools, overcoming a challenging bug, receiving feedback.
  * Intermediate/Senior: Technical disagreements, leading architectural trade-offs, managing unexpected production outages.
- Turn 3+: Core technical assessment. Alternate across question types:
  * Conceptual (fundamental theory & how things work under the hood)
  * Practical (writing or structuring code for real problems)
  * Debugging (diagnosing performance leaks or edge-case failures)
  * System Design / Architecture (component composition, scaling, trade-offs)
  * Trade-off questions ("Why choose approach X over Y?")

Strict Rules:
1. NEVER repeat an already asked question or ask a near-duplicate question.
2. Ask exactly ONE concise question at a time. Do not stack multiple questions in one turn.
3. Adaptive depth:
   - Strong answer: Acknowledge briefly and increase depth, probe trade-offs, or ask an architecture/edge-case follow-up.
   - Struggling/Weak answer: Be encouraging, simplify the concept, and verify fundamentals before moving on.
4. Keep primary skill (${args.targetSkill ?? "General Software Development"}) as the central theme, but incorporate realistic behavioral and engineering practices.
5. Set finished=true only when 5 to 7 rich questions have been completed and sufficient evidence is collected.

Return ONLY valid JSON with this exact shape:
{
  "question": "your concise spoken question (or introduction + greeting on turn 1)",
  "difficulty": "Beginner | Intermediate | Advanced",
  "topic": "topic area",
  "questionType": "introduction | behavioral | conceptual | practical | debugging | scenario | architecture | trade-off | follow-up",
  "skillAssessed": "specific skill name being tested",
  "followUp": false,
  "finished": false
}`;
}

export function buildTurnInstruction(args: {
  messages: InterviewMessage[];
  latestAnswer?: string;
  firstTurn?: boolean;
  targetRole?: string | null;
  targetCompany?: string | null;
}): string {
  const conversation = args.messages.map((item) => ({
    speaker: item.type === "Assistant" ? "interviewer" : "candidate",
    message: item.message,
  }));

  if (args.firstTurn) {
    return `Start the interview with Turn 1:
1. Give a warm, concise interviewer greeting (welcome them to their interview for ${args.targetRole ?? "the software role"} at ${args.targetCompany ?? "our team"}).
2. Explain that you will explore both practical technical concepts and real-world project experiences, adapting the difficulty along the way.
3. Conclude with an open, conversational icebreaker asking the candidate to introduce their background and describe a technical project they built or are proud of from their GitHub/work experience.

Keep the total opening under 3-4 sentences so it is natural to listen to.`;
  }

  return `The candidate's latest answer was:
"${args.latestAnswer ?? ""}"

Review the full conversation below before selecting the next move:
- If this is Turn 2, ask a behavioral or situational question suited to their level.
- If Turn 3+, assess technical skills across diverse question types (conceptual, practical, debugging, architecture, trade-off).
- Do NOT repeat questions already asked.
- Adapt difficulty based on whether their answer demonstrated strong depth, partial understanding, or confusion.

Full conversation so far:
${JSON.stringify(conversation)}`;
}

export function questionCount(messages: InterviewMessage[]): number {
  return messages.filter((message) => message.type === "Assistant").length;
}

export function coveredTopics(messages: InterviewMessage[]): string[] {
  const topicSignals: Record<(typeof TOPICS)[number], RegExp> = {
    Programming: /javascript|typescript|python|java|coding|program|complexity|variable|scope/i,
    "Data Structures & Algorithms":
      /algorithm|array|linked list|tree|graph|hash map|complexity|stack|queue/i,
    OOP: /object[- ]oriented|class|inheritance|polymorphism|encapsulation/i,
    Databases: /database|sql|query|index|transaction|mongodb|postgres|schema|orm/i,
    APIs: /api|rest|graphql|endpoint|authentication|authorization|jwt|http/i,
    "Web Development":
      /react|frontend|browser|html|css|web development|component|dom|hook|state/i,
    Backend: /backend|server|node|service|queue|cache|scaling|redis|express/i,
    "Software Engineering":
      /testing|debug|deployment|architecture|ci\/cd|code review|trade-off|behavioral/i,
  };

  return TOPICS.filter((topic) =>
    messages.some(
      (message) =>
        message.type === "Assistant" &&
        topicSignals[topic].test(message.message),
    ),
  );
}
