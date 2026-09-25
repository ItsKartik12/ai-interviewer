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

export type ResumeContext = {
  candidateName?: string | null;
  documentType?: "resume" | "project_report" | "mixed";
  projects: string[];
  technologies: string[];
  experience: string[];
  education: string[];
  achievements: string[];
  certifications?: string[];
  rawSummary: string;
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
  | "background"
  | "project"
  | "github"
  | "conceptual"
  | "practical"
  | "debugging"
  | "scenario"
  | "architecture"
  | "trade-off"
  | "problem-solving"
  | "follow-up"
  | "wrap-up";

export type InterviewStage =
  | "stage_1_introduction"
  | "stage_2_behavioral"
  | "stage_3_project_experience"
  | "stage_4_core_skills"
  | "stage_5_practical_scenario"
  | "stage_6_debugging_problem_solving"
  | "stage_7_deeper_follow_up"
  | "stage_8_wrap_up";

export type AnswerQuality =
  | "strong"
  | "shallow"
  | "vague"
  | "partial"
  | "incorrect"
  | "stuck"
  | "initial_greeting";

export type DifficultyTargets = {
  minQuestions: number;
  maxQuestions: number;
  label: string;
};

export function getDifficultyTargets(
  difficulty?: InterviewDifficulty | string | null,
): DifficultyTargets {
  if (difficulty === "Beginner") {
    return { minQuestions: 8, maxQuestions: 9, label: "Beginner" };
  }
  if (difficulty === "Advanced") {
    return { minQuestions: 15, maxQuestions: 20, label: "Expert / Advanced" };
  }
  return { minQuestions: 10, maxQuestions: 11, label: "Intermediate" };
}

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
  hintGiven?: boolean;
  hint?: string;
};

const VALID_QUESTION_TYPES: QuestionType[] = [
  "introduction",
  "behavioral",
  "background",
  "project",
  "github",
  "conceptual",
  "practical",
  "debugging",
  "scenario",
  "architecture",
  "trade-off",
  "problem-solving",
  "follow-up",
  "wrap-up",
];

function asGithubContext(githubMetadata: unknown): string {
  if (!githubMetadata || typeof githubMetadata !== "object") {
    return "No verified GitHub information is available. Ask the candidate directly about their personal projects.";
  }

  const meta = githubMetadata as Record<string, unknown>;
  if (meta.summary && typeof meta.summary === "string") {
    // Already a pre-built summary string — cap at 600 chars to prevent token bloat
    return meta.summary.slice(0, 600);
  }

  // Fallback: serialize but hard-cap to prevent large object embedding
  return JSON.stringify(githubMetadata).slice(0, 600);
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
 * Determine the interview stage based on difficulty targets and question progress.
 */
export function determineInterviewStage(
  questionCount: number,
  difficulty?: InterviewDifficulty | null,
  lastQuestionType?: QuestionType,
  lastAnswerQuality?: AnswerQuality,
): InterviewStage {
  const targets = getDifficultyTargets(difficulty);

  // Hard stop approach: if at or past maxQuestions - 1, move directly to wrap up
  if (questionCount >= targets.maxQuestions - 1) {
    return "stage_8_wrap_up";
  }

  if (difficulty === "Beginner") {
    // Beginner: 8–9 total questions
    // Q0: Introduction
    // Q1: Behavioral
    // Q2: Project / Background
    // Q3-Q5: Core Skills Fundamentals & Practical syntax
    // Q6: Practical Scenario
    // Q7: Simple Debugging / Probing Follow-Up
    // Q8+: Wrap-Up
    if (questionCount === 0) return "stage_1_introduction";
    if (questionCount === 1) return "stage_2_behavioral";
    if (questionCount === 2) return "stage_3_project_experience";
    if (questionCount >= 3 && questionCount <= 5) return "stage_4_core_skills";
    if (questionCount === 6) return "stage_5_practical_scenario";
    if (questionCount === 7) return "stage_6_debugging_problem_solving";
    return "stage_8_wrap_up";
  }

  if (difficulty === "Advanced") {
    // Expert: 15–20 total questions
    // Q0: Introduction
    // Q1: Behavioral / Leadership
    // Q2-Q4: Project Experience & System Design
    // Q5-Q8: Core Skills Deep-Dive & Internals
    // Q9-Q11: Practical Production Scenarios & Scale
    // Q12-Q14: Debugging, Concurrency & Edge Cases
    // Q15-Q18: Deeper Follow-ups & Architectural Trade-offs
    // Q19+: Wrap-Up
    if (questionCount === 0) return "stage_1_introduction";
    if (questionCount === 1) return "stage_2_behavioral";
    if (questionCount >= 2 && questionCount <= 4) return "stage_3_project_experience";
    if (questionCount >= 5 && questionCount <= 8) return "stage_4_core_skills";
    if (questionCount >= 9 && questionCount <= 11) return "stage_5_practical_scenario";
    if (questionCount >= 12 && questionCount <= 14) return "stage_6_debugging_problem_solving";
    if (questionCount >= 15 && questionCount < targets.maxQuestions - 1) return "stage_7_deeper_follow_up";
    return "stage_8_wrap_up";
  }

  // Intermediate: 10–11 total questions
  // Q0: Introduction
  // Q1: Behavioral
  // Q2-Q3: Project Experience & Architecture Choices
  // Q4-Q5: Core Skills
  // Q6: Practical Scenario
  // Q7: Debugging & Problem Solving
  // Q8: Deeper Follow-Up
  // Q9+: Wrap-Up
  if (questionCount === 0) return "stage_1_introduction";
  if (questionCount === 1) return "stage_2_behavioral";
  if (questionCount >= 2 && questionCount <= 3) return "stage_3_project_experience";
  if (questionCount >= 4 && questionCount <= 5) return "stage_4_core_skills";
  if (questionCount === 6) return "stage_5_practical_scenario";
  if (questionCount === 7) return "stage_6_debugging_problem_solving";
  if (questionCount === 8) return "stage_7_deeper_follow_up";
  return "stage_8_wrap_up";
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
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    // Trailing-comma repair: models occasionally emit "..., }" which is the
    // most common reason valid-looking JSON lands in this fallback path.
    const jsonStr =
      start >= 0 && end > start
        ? candidate.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")
        : candidate;
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
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
        hintGiven: parsed.hintGiven === true,
        hint: typeof parsed.hint === "string" ? parsed.hint.trim() : undefined,
      };
    }
  } catch {
    // Plain-text response fallback
  }

  // Plain-text fallback. If the response is actually JSON-shaped (parse above
  // failed on severely malformed JSON), do NOT leak raw JSON to the candidate —
  // return a natural interviewer line instead. Genuine plain-text questions
  // pass through unchanged.
  const trimmedResponse = response.trim();
  const looksLikeJson = /^(```|\s*\{)/.test(trimmedResponse);
  return {
    question: looksLikeJson
      ? "Could you walk me through your reasoning on that?"
      : trimmedResponse,
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

  // Domain-specific heuristic tracks so the fallback stays relevant for the
  // expanded tech-only role catalog (AI/ML, security, DevOps, data, etc.).
  const isAIData = /ai|ml|machine learning|data scien|data engine|nlp|computer vision|generative/i.test(role);
  const isSecurity = /security|cyber|soc|appsec|vulnerab/i.test(role);
  const isDevOps = /devops|sre|reliability|cloud|infrastructure|platform/i.test(role);
  const isMobile = /mobile|android|ios|flutter|react native/i.test(role);
  const isGame = /game|gameplay|graphics|engine/i.test(role);
  const isEmbedded = /embedded|iot|firmware|hardware/i.test(role);
  const isQA = /qa|quality|test|automation engineer|sdet/i.test(role);
  const isBlockchain = /blockchain|web3|smart contract/i.test(role);

  if (isAIData) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "ML Fundamentals & Model Evaluation", importance: "high", reason: "Bias-variance, overfitting, cross-validation, and metric selection" },
        { skill: "Python & Data Manipulation", importance: "high", reason: "NumPy/Pandas fluency for real datasets and pipelines" },
        { skill: "Feature Engineering & Data Quality", importance: isSenior ? "high" : "medium", reason: "Encoding, scaling, leakage detection, and missing-data strategy" },
        { skill: "Deep Learning & Transformer Basics", importance: "medium", reason: "Neural architectures, embeddings, and fine-tuning intuition" },
      ],
      softSkills: [
        { skill: "Analytical Communication", importance: "high", reason: "Explaining model choices and metrics to technical and non-technical audiences" },
        { skill: "Experimental Rigor", importance: "high", reason: "Designing fair baselines and honest evaluations" },
        { skill: "Handling Ambiguity", importance: "medium", reason: "Framing open-ended data problems into testable questions" },
      ],
    };
  }

  if (isSecurity) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "Networking & Protocol Fundamentals", importance: "high", reason: "TCP/IP, DNS, TLS, and traffic analysis underpin most security work" },
        { skill: "Authentication & Authorization Concepts", importance: "high", reason: "OAuth, JWT, session handling, and common implementation flaws" },
        { skill: "Vulnerabilities & Secure Coding", importance: "high", reason: "OWASP Top 10, injection classes, and defensive input handling" },
        { skill: isSenior ? "Incident Response & Threat Modeling" : "Security Tooling Basics", importance: "medium", reason: isSenior ? "Structured triage, containment, and attack-surface reasoning" : "Log analysis, scanners, and SIEM fundamentals" },
      ],
      softSkills: [
        { skill: "Precise Reporting", importance: "high", reason: "Documenting findings with severity, impact, and reproducibility" },
        { skill: "Calm Under Pressure", importance: "high", reason: "Methodical reasoning during suspected incidents" },
        { skill: "Cross-team Collaboration", importance: "medium", reason: "Getting fixes shipped without antagonizing developer teams" },
      ],
    };
  }

  if (isDevOps) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "CI/CD Pipeline Design", importance: "high", reason: "Build, test, and deployment automation with safe rollout strategies" },
        { skill: "Containers & Orchestration", importance: "high", reason: "Docker images, Kubernetes primitives, and resource management" },
        { skill: "Cloud Services & Networking", importance: isSenior ? "high" : "medium", reason: "Compute, storage, IAM, VPCs, and managed service trade-offs" },
        { skill: "Observability & Incident Management", importance: "medium", reason: "Metrics, logs, traces, SLOs, and structured on-call response" },
      ],
      softSkills: [
        { skill: "Automation Mindset", importance: "high", reason: "Eliminating manual toil with reliable, idempotent processes" },
        { skill: "Blameless Communication", importance: "high", reason: "Writing postmortems and coordinating during incidents" },
        { skill: "Prioritization", importance: "medium", reason: "Balancing reliability work against feature delivery pressure" },
      ],
    };
  }

  if (isMobile) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "Mobile UI & Lifecycle Management", importance: "high", reason: "Activity/fragment or view lifecycle, state restoration, and responsive layouts" },
        { skill: "Networking, Caching & Offline Behavior", importance: "high", reason: "API clients, retry strategy, and background sync on unreliable networks" },
        { skill: "Performance & Battery Efficiency", importance: "medium", reason: "Cold start, jank, memory, and efficient background work" },
        { skill: "Platform Release & Store Processes", importance: "medium", reason: "Build flavors, signing, and staged rollouts" },
      ],
      softSkills: [
        { skill: "User-Centric Communication", importance: "high", reason: "Advocating for UX trade-offs in technical decisions" },
        { skill: "Structured Debugging", importance: "high", reason: "Isolating device-specific and OS-version-specific issues" },
        { skill: "Adaptability", importance: "medium", reason: "Tracking fast-moving platform APIs and guidelines" },
      ],
    };
  }

  if (isGame) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "Game Programming & Gameplay Systems", importance: "high", reason: "Game loops, input handling, physics, and entity/state design" },
        { skill: "Engine Architecture (Unity/Unreal/custom)", importance: "high", reason: "Scene graphs, components, prefabs, and engine-specific workflows" },
        { skill: "Graphics & Rendering Basics", importance: "medium", reason: "Shaders, draw calls, and frame-budget awareness" },
        { skill: "Performance Optimization", importance: isSenior ? "high" : "medium", reason: "Profiling CPU/GPU, memory budgets, and object pooling" },
      ],
      softSkills: [
        { skill: "Iterative Craftsmanship", importance: "high", reason: "Prototyping fast and refining based on playtesting feedback" },
        { skill: "Cross-discipline Collaboration", importance: "high", reason: "Working with artists and designers on shared constraints" },
        { skill: "Player Empathy", importance: "medium", reason: "Reasoning about feel, difficulty curves, and fun" },
      ],
    };
  }

  if (isEmbedded) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "C/C++ & Memory-Constrained Programming", importance: "high", reason: "Pointers, interrupts, stacks, and heap discipline on small devices" },
        { skill: "Microcontroller Peripherals & Protocols", importance: "high", reason: "GPIO, UART, I2C, SPI, ADC, and datasheet-driven integration" },
        { skill: isSenior ? "RTOS & Concurrency" : "Debugging with Hardware Tools", importance: "medium", reason: isSenior ? "Task scheduling, ISR safety, and deadlock avoidance" : "Logic analyzers, oscilloscopes, and JTAG debugging" },
        { skill: "Power & Connectivity for IoT", importance: "medium", reason: "Sleep strategies, OTA updates, and wireless protocol trade-offs" },
      ],
      softSkills: [
        { skill: "Hardware/Software Co-Debugging", importance: "high", reason: "Systematic fault isolation across board and firmware" },
        { skill: "Attention to Detail", importance: "high", reason: "Timing, register, and errata-level precision" },
        { skill: "Documentation Discipline", importance: "medium", reason: "Communicating constraints clearly to hardware and app teams" },
      ],
    };
  }

  if (isQA) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "Test Design & Coverage Strategy", importance: "high", reason: "Boundary, negative, and risk-based test selection" },
        { skill: "Automation Frameworks & Tooling", importance: "high", reason: "Selenium/Playwright/Cypress patterns and reliable selectors" },
        { skill: "API Testing & Contract Validation", importance: "medium", reason: "REST assertions, schema checks, and mocking" },
        { skill: "CI Integration & Flaky Test Management", importance: isSenior ? "high" : "medium", reason: "Pipelines, retries, quarantine, and root-causing flakes" },
      ],
      softSkills: [
        { skill: "Clear Bug Communication", importance: "high", reason: "Reproducible reports with severity and evidence" },
        { skill: "Advocacy for Quality", importance: "high", reason: "Influencing shift-left practices without blocking delivery" },
        { skill: "Curiosity & Skepticism", importance: "medium", reason: "Hunting edge cases developers overlook" },
      ],
    };
  }

  if (isBlockchain) {
    return {
      role,
      company: "Target Company",
      level,
      technicalSkills: [
        { skill: "Smart Contract Development & Security", importance: "high", reason: "Solidity patterns, reentrancy, and upgradeability risks" },
        { skill: "EVM & Blockchain Fundamentals", importance: "high", reason: "Transactions, gas, consensus basics, and state model" },
        { skill: "dApp Architecture & Wallets", importance: "medium", reason: "Frontend/contract integration, signing flows, and event handling" },
        { skill: "Testing & Auditing Practices", importance: isSenior ? "high" : "medium", reason: "Fork testing, invariants, and static analysis tools" },
      ],
      softSkills: [
        { skill: "Security-First Judgment", importance: "high", reason: "Treating immutable code with proportionate caution" },
        { skill: "Clear Technical Writing", importance: "high", reason: "Documenting protocol invariants and assumptions" },
        { skill: "Ecosystem Awareness", importance: "medium", reason: "Evaluating fast-moving standards and tooling" },
      ],
    };
  }

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
 * Parse a candidate's uploaded PDF resume or project report text into structured context using LLM.
 * Falls back to a clean heuristic structure if LLM fails or is offline.
 */
export async function parseResumeText(rawText: string): Promise<ResumeContext> {
  const trimmed = rawText.trim();

  // Minimal fallback
  const fallback: ResumeContext = {
    candidateName: null,
    documentType: "mixed",
    projects: [],
    technologies: [],
    experience: [],
    education: [],
    achievements: [],
    certifications: [],
    rawSummary: trimmed.slice(0, 800),
  };

  if (!trimmed || trimmed.length < 25) return fallback;

  try {
    const prompt = `You are a precise technical document analyzer. Extract structured candidate evidence from this resume or project report.

Candidate Document Text:
${trimmed.slice(0, 4500)}

INSTRUCTIONS:
1. Distinguish between:
   - explicitly stated facts (extract exactly)
   - unavailable information (leave array empty or null, DO NOT FABRICATE)
2. If document is primarily a project report, prioritize extracting project details, architecture, technologies, and implementation details.
3. If document is a standard resume, extract work history, projects, tech stack, and education.
4. Categorize documentType as "resume", "project_report", or "mixed".

Return ONLY valid JSON with this exact shape:
{
  "candidateName": "Full Name if stated, else null",
  "documentType": "resume | project_report | mixed",
  "projects": ["Project Name: brief description, key architecture or features"],
  "technologies": ["Technology, library, or programming language"],
  "experience": ["Role at Organization (duration): key responsibilities or contributions"],
  "education": ["Degree, Major, Institution, Year"],
  "achievements": ["Notable competition, honor, or quantifiable accomplishment"],
  "certifications": ["Certification name or credential"]
}

Keep each list item concise (1-2 sentences). Return strictly valid JSON.`;

    const response = await askOmniRoute([
      { role: "system", content: "You are an expert technical resume and project report parser. Extract factual information only. Return strictly valid JSON." },
      { role: "user", content: prompt },
    ]);

    const cleaned = response
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Partial<ResumeContext>;

    return {
      candidateName: typeof parsed.candidateName === "string" && parsed.candidateName.trim() ? parsed.candidateName.trim() : null,
      documentType: parsed.documentType === "project_report" || parsed.documentType === "resume" ? parsed.documentType : "mixed",
      projects: Array.isArray(parsed.projects) ? parsed.projects.slice(0, 8).map(String) : [],
      technologies: Array.isArray(parsed.technologies) ? parsed.technologies.slice(0, 15).map(String) : [],
      experience: Array.isArray(parsed.experience) ? parsed.experience.slice(0, 6).map(String) : [],
      education: Array.isArray(parsed.education) ? parsed.education.slice(0, 4).map(String) : [],
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements.slice(0, 5).map(String) : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications.slice(0, 5).map(String) : [],
      rawSummary: trimmed.slice(0, 800),
    };
  } catch (err) {
    console.warn("[resume] parseResumeText fallback:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

/**
 * Format a ResumeContext into a readable prompt block for the interviewer.
 *
 * `compact` controls prompt size: early turns (introduction, project deep-dive)
 * get the full detail; later turns only need a short digest because the
 * conversation history already carries the relevant project context. This
 * keeps every turn's payload small without losing adaptivity.
 */
function formatResumeContext(
  resume: ResumeContext | null | undefined,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (!resume) return "No resume or project document provided. Ask the candidate directly about their background and projects.";

  if (compact) {
    const tech = resume.technologies.slice(0, 8).join(", ");
    const project = resume.projects[0]?.slice(0, 120) ?? "none stated";
    return `Resume digest: technologies [${tech || "unknown"}]; main project: ${project}.`;
  }

  const lines: string[] = [];

  if (resume.candidateName) {
    lines.push(`Candidate Name (stated): ${resume.candidateName}`);
  }
  if (resume.documentType) {
    lines.push(`Document Type: ${resume.documentType === "project_report" ? "Technical Project Report" : "Candidate Resume / CV"}`);
  }
  if (resume.projects.length > 0) {
    lines.push("Projects (candidate claims — verify architecture, choices, and personal contribution):");
    resume.projects.forEach((p) => lines.push(`  - ${p}`));
  }
  if (resume.technologies.length > 0) {
    lines.push(`Technologies listed (verify depth): ${resume.technologies.join(", ")}`);
  }
  if (resume.experience.length > 0) {
    lines.push("Work Experience (candidate claims — explore responsibilities):");
    resume.experience.forEach((e) => lines.push(`  - ${e}`));
  }
  if (resume.education.length > 0) {
    lines.push("Education:");
    resume.education.forEach((e) => lines.push(`  - ${e}`));
  }
  if (resume.achievements && resume.achievements.length > 0) {
    lines.push("Achievements / Honors:");
    resume.achievements.forEach((a) => lines.push(`  - ${a}`));
  }

  return lines.length > 0
    ? lines.join("\n")
    : "Document provided but no structured technical details could be parsed. Ask direct questions.";
}

/**
 * Dynamically generate recommended role skills based on role, company, level, resume/project PDF, and GitHub.
 * Generates skills with priorities (Core Requirement, Important, Supporting).
 */
export async function generateRoleSkills(args: {
  role: string;
  company?: string;
  level?: string;
  targetSkill?: string;
  skill?: string;
  githubMetadata?: unknown;
  context?: string;
  resumeContext?: ResumeContext | null;
}): Promise<RoleSkillRequirement> {
  const resolvedCompany = args.company || "Target Company";
  const resolvedLevel = args.level || "Intermediate";

  // Synthesize candidate technology context from resume
  const candidateTech = args.resumeContext?.technologies?.length
    ? args.resumeContext.technologies.join(", ")
    : args.targetSkill || args.skill || "Software Development";

  const candidateProjects = args.resumeContext?.projects?.length
    ? args.resumeContext.projects.slice(0, 3).join("; ")
    : "None stated";

  const heuristic = getHeuristicSkills(args.role, resolvedLevel);
  heuristic.company = resolvedCompany;
  heuristic.summary = `Recommended competencies for ${args.role} at ${resolvedCompany} (${resolvedLevel} level).`;

  try {
    const prompt = `You are a principal technical recruiter and engineering leader.
Analyze this candidate profile and dynamically recommend 4 to 6 technical skills and 2 to 3 soft skills for this specific interview:

- Target Role: ${args.role}
- Target Company: ${resolvedCompany}
- Self-Assessed Seniority Level: ${resolvedLevel}
- Candidate Resume/Project Technologies: ${candidateTech}
- Candidate Projects: ${candidateProjects}
- GitHub Context: ${asGithubContext(args.githubMetadata)}

GUIDELINES FOR DYNAMIC SKILL GENERATION:
1. Tailor the skills to the specific role and company style (e.g. Google frontend emphasizes browser internals, performant DOM, JavaScript runtime; backend emphasizes distributed architecture, database scaling).
2. Bridge the role requirements with the candidate's actual projects and technologies where relevant.
3. Assign each skill an importance:
   - "core" (Core Requirement — mandatory foundational competencies for this role)
   - "important" (Important — practical design, state, performance, architecture)
   - "bonus" (Supporting — specialized differentiator or advanced tooling)
4. For each skill, provide a concise 1-sentence reason explaining why it is recommended for this candidate targeting this role and company.
5. Do NOT fabricate confidential internal company secrets; use public engineering culture expectations.

Return ONLY valid JSON with this exact shape:
{
  "role": "${args.role}",
  "company": "${resolvedCompany}",
  "level": "${resolvedLevel}",
  "summary": "Tailored competency evaluation plan for ${args.role} at ${resolvedCompany}",
  "technicalSkills": [
    { "skill": "Skill Name", "importance": "core | important | bonus", "reason": "concise rationale" }
  ],
  "softSkills": [
    { "skill": "Skill Name", "importance": "core | important | bonus", "reason": "concise rationale" }
  ]
}`;

    const response = await askOmniRoute([
      { role: "system", content: "You are an expert technical interviewer and talent strategist. Return strictly valid JSON." },
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
        summary: parsed.summary || `Recommended evaluation plan for ${args.role} at ${resolvedCompany}`,
        technicalSkills: parsed.technicalSkills.map((item) => {
          const rawImp = (item.importance || "").toLowerCase();
          const importance =
            rawImp === "core" || rawImp === "high"
              ? "core"
              : rawImp === "bonus" || rawImp === "supporting"
                ? "bonus"
                : "important";
          return {
            skill: String(item.skill || "Technical Skill"),
            importance,
            reason: String(item.reason || item.rationale || "Recommended for this role"),
            rationale: String(item.reason || item.rationale || "Recommended for this role"),
          };
        }),
        softSkills: parsed.softSkills.map((item) => ({
          skill: String(item.skill || "Soft Skill"),
          importance: item.importance === "core" || item.importance === "high" ? "core" : "important",
          reason: String(item.reason || item.rationale || "Essential communication skill"),
          rationale: String(item.reason || item.rationale || "Essential communication skill"),
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
      importance: item.importance === "high" ? "core" : "important",
      rationale: item.reason,
    })),
    softSkills: heuristic.softSkills.map((item) => ({
      ...item,
      importance: item.importance === "high" ? "core" : "important",
      rationale: item.reason,
    })),
  };
}


/**
 * Return focused stage instructions: full detail for current + next stage only.
 * Other stages referenced by name to keep prompt compact.
 */
function buildStageInstructions(
  stage: InterviewStage,
  targetRole?: string | null,
  targetCompany?: string | null,
  technicalCompetencies?: string,
): string {
  const role = targetRole ?? "the role";
  const company = targetCompany ?? "our company";
  const skills = technicalCompetencies ?? "core technical skills";

  const stageMap: Record<InterviewStage, string> = {
    stage_1_introduction: `[CURRENT] stage_1_introduction — Introduction & Icebreaker:
   - Welcome candidate warmly and professionally to their interview for ${role} at ${company}.
   - In 1 sentence explain format: background & standout project, technical depth, practical scenarios, wrap-up.
   - Ask open icebreaker: introduce themselves and highlight a standout technical project they built.
[NEXT] stage_2_behavioral — ask a realistic behavioral question about a challenge, roadblock, or technical disagreement.`,

    stage_2_behavioral: `[CURRENT] stage_2_behavioral — Behavioral (soft-skill evidence collection):
   - Anchor the question in one of the candidate's SELECTED SOFT SKILLS and in their real projects — not hypotheticals.
   - Junior/Mid: Ask about a difficult bug or unexpected roadblock and how they solved it, or how they learn new tech.
   - Senior: Ask about handling technical disagreement, technical debt vs velocity, or a production incident post-mortem.
[NEXT] stage_3_project_experience — investigate the candidate's mentioned project: architecture, library choices, personal contributions.`,

    stage_3_project_experience: `[CURRENT] stage_3_project_experience — Project Deep-Dive:
   - Ground questions in their RESUME projects or GitHub repos. Ask "why did you choose X?" and "what would you change if you rebuilt it?" — not just what it does.
   - Ask about architecture decisions, library choices, how data flows, and critically: "What part did you personally build?"
[NEXT] stage_4_core_skills — test fundamental knowledge of their selected skills (${skills}).`,

    stage_4_core_skills: `[CURRENT] stage_4_core_skills — Core Skill Fundamentals:
   - Actively assess selected skills: ${skills}.
   - Test fundamental principles (e.g., React: reconciliation, hooks, re-renders; JS: event loop, closures, promises; DB: indexing, transactions).
   - Go beyond GitHub repos into general technical knowledge.
[NEXT] stage_5_practical_scenario — a real-world practical situation or implementation challenge.`,

    stage_5_practical_scenario: `[CURRENT] stage_5_practical_scenario — Practical Scenario:
   - Pose a real-world situation (e.g., table with 10,000 live-updating rows causing lag; resilient error states on network drop; caching strategy).
   - Assess applied judgment, not just theory.
[NEXT] stage_6_debugging_problem_solving — concrete debugging or troubleshooting scenario.`,

    stage_6_debugging_problem_solving: `[CURRENT] stage_6_debugging_problem_solving — Debugging & Problem Solving:
   - Concrete troubleshooting scenario: bug diagnosis, isolating race conditions, memory leaks, or error handling.
[NEXT] stage_7_deeper_follow_up — probe architectural trade-offs and edge cases from prior answers.`,

    stage_7_deeper_follow_up: `[CURRENT] stage_7_deeper_follow_up — Deeper Follow-Up & Trade-offs:
   - Probe previous answers for architectural trade-offs, why this approach over an alternative, edge cases, or failure modes.
[NEXT] stage_8_wrap_up — ask a reflective wrap-up question and close warmly.`,

    stage_8_wrap_up: `[CURRENT] stage_8_wrap_up — Reflective Wrap-Up:
   - Ask a reflective question: "What would you change if you rebuilt that project with another month?" or "Any questions for me?"
   - Conclude warmly. Set finished=true when done.`,
  };

  return stageMap[stage] ?? stageMap["stage_4_core_skills"];
}

export function buildInterviewSystemPrompt(args: {
  githubMetadata: unknown;
  difficulty: InterviewDifficulty;
  targetSkill?: string | null;
  selfAssessedLevel?: InterviewDifficulty | null;
  targetCompany?: string | null;
  targetRole?: string | null;
  selectedSkills?: string[] | null;
  selectedSoftSkills?: string[] | null;
  roleSkills?: RoleSkillRequirement | null;
  resumeContext?: ResumeContext | null;
  questionCount: number;
  coveredTopics: string[];
  durationMinutes: number;
  previousQuestions?: string[];
  previousQuestionTypes?: QuestionType[];
  currentStage?: InterviewStage;
}): string {
  const topics =
    args.coveredTopics.length > 0 ? args.coveredTopics.join(", ") : "none yet";

  // Cap question history: last 6 questions, max 80 chars each — prevents prompt bloat in long sessions
  const recentHistory = args.previousQuestions ?? [];
  const historySlice = recentHistory.slice(-6);
  const questionHistory =
    historySlice.length > 0
      ? historySlice.map((q, i) => {
          const num = recentHistory.length - historySlice.length + i + 1;
          const snippet = q.length > 80 ? q.slice(0, 77) + "..." : q;
          return `${num}. "${snippet}"`;
        }).join("\n")
      : "None yet (Turn 1 introduction)";

  const targets = getDifficultyTargets(args.difficulty);
  const stage = args.currentStage || determineInterviewStage(args.questionCount, args.difficulty);

  // Prompt-size optimization: full resume detail only during the early
  // stages that actually reference it (intro, behavioral, project deep-dive);
  // later turns use a one-line digest.
  const compactResume = args.questionCount > 3;

  // Assessment scope: ONLY user-selected skills. Unselected recommendations
  // may appear as supporting concepts but must never drive the evaluation.
  const selectedSkillsList = args.selectedSkills && args.selectedSkills.length > 0
    ? args.selectedSkills
    : args.targetSkill ? [args.targetSkill] : [];

  const selectedSet = new Set(selectedSkillsList.map((s) => s.toLowerCase()));
  const isSkillSelected = (skillName: string): boolean => {
    const n = skillName.toLowerCase();
    return Array.from(selectedSet).some(
      (sel) => sel === n || sel.includes(n) || n.includes(sel),
    );
  };

  // Format competencies from roleSkills — selected skills lead, unselected
  // recommendations are demoted to optional supporting context.
  const technicalCompetencies = args.roleSkills?.technicalSkills?.length
    ? args.roleSkills.technicalSkills.map((s) => {
        const isSelected = isSkillSelected(s.skill);
        return `- ${s.skill} (${s.importance})${isSelected ? " [PRIMARY FOCUS]" : " [SUPPORTING CONTEXT ONLY — do NOT score]"}: ${s.reason}`;
      }).join("\n")
    : selectedSkillsList.length > 0
      ? selectedSkillsList.map((s) => `- ${s} (Core): Focus area selected by candidate`).join("\n")
      : `- ${args.targetSkill ?? "General Software Development"}: Core focus for this interview`;

  // Soft skills: candidate-selected ones are actively probed (behavioral
  // questions collect evidence); unselected recommendations stay context-only.
  const softSelected = (args.selectedSoftSkills ?? []).filter((s) => s.trim());
  const softCompetencies = args.roleSkills?.softSkills?.length
    ? args.roleSkills.softSkills.map((s) => {
        const isSelected = softSelected.some(
          (sel) =>
            sel.toLowerCase() === s.skill.toLowerCase() ||
            s.skill.toLowerCase().includes(sel.toLowerCase()) ||
            sel.toLowerCase().includes(s.skill.toLowerCase()),
        );
        return `- ${s.skill}${isSelected ? " [ACTIVELY ASSESS — probe for evidence]" : " [SUPPORTING CONTEXT ONLY — do NOT score]"}: ${s.reason}`;
      }).join("\n")
    : softSelected.length > 0
      ? softSelected.map((s) => `- ${s} [ACTIVELY ASSESS — probe for evidence]: Selected by candidate`).join("\n")
      : "- Technical Communication: Explaining engineering thoughts clearly\n- Problem Solving: Systematic debugging and design";


  const recentQuestionTypes = args.previousQuestionTypes?.length
    ? args.previousQuestionTypes.slice(-4).join(", ")
    : "none";

  return `You are an experienced, empathetic, and observant human technical interviewer conducting a live software engineering interview.

Target Profile:
- Role: ${args.targetRole ?? "Software Developer"}
- Target Company: ${args.targetCompany ?? "Tech Company"} (use company context naturally for scale/expectations, never pretend to leak confidential questions)
- Candidate Stated Level: ${args.selfAssessedLevel ?? args.difficulty}
- Current Session Difficulty: ${args.difficulty} (Target total questions: ${targets.minQuestions}–${targets.maxQuestions})
- Target Duration: ${args.durationMinutes} minutes

Required Competencies to Actively Evaluate (Selected Skills):
Technical Skills:
${technicalCompetencies}

Soft Skills:
${softCompetencies}

INTERVIEW DIMENSIONS — VARY THE INTENT, NOT JUST THE WORDING:
Every technical question should have a deliberate intent. Across the interview, rotate through dimensions such as:
- Conceptual (mechanism): "How does React decide what needs to be updated when state changes?"
- Practical (apply/investigate): "Suppose this component re-renders far more often than expected. How would you investigate it?"
- Debugging (symptom → cause): "A list component becomes noticeably slow with 5,000 items. What would you look at first?"
- Architecture (structure at scale): "How would you structure shared state if several unrelated parts of the app need the same data?"
- Trade-off (limits of an approach): "When would you avoid putting something into global state?"
- Project-grounded (their work): "You mentioned using React in your project — what part of the UI was hardest to keep maintainable?"
- Scenario (change/surge): "Imagine your app suddenly has ten times the users. What frontend problems would appear first?"
- Follow-up (their last answer): "Earlier you mentioned X — why did you choose that approach instead of Y?"
Rules:
- NEVER ask a question whose best answer is a textbook definition ("What is React?", "What is REST?"). If the answer is the first paragraph of the official documentation, ask a different dimension instead.
- Do NOT cycle through dimensions mechanically (A→B→C→A→B→C). Choose the dimension the candidate's last answer and the current stage naturally call for — but no single dimension should dominate more than two consecutive questions.
- "Recent Question Types Asked" lists the inferred dimension of your recent questions. Do not reuse the most recent dimension unless the candidate's answer directly invites a follow-up on that same thread.

Candidate Resume Context (UNVERIFIED CLAIMS — use to generate relevant questions, but do NOT treat as proof of skill. Ask verification questions for important claims):
${formatResumeContext(args.resumeContext, { compact: compactResume })}

Candidate GitHub Context (Supporting context only, NOT proof of skill or the entire interview):
${asGithubContext(args.githubMetadata)}

Session Progress & Pacing:
- Questions Completed: ${args.questionCount}
- Pacing Target for ${args.difficulty}: Minimum ${targets.minQuestions}, Hard Maximum ${targets.maxQuestions} questions total.
- Active Stage: ${stage}
- Covered Topics: ${topics}
- Recent Question Types Asked: ${recentQuestionTypes}

Questions Already Asked:
${questionHistory}

DIFFICULTY CALIBRATION & PROGRESSION ("SLIGHTLY EASIER THAN SELECTED LEVEL"):
- The selected difficulty is the TARGET CEILING, not a constant for every question. Open with accessible questions that build rapport and confidence, escalate through application and scenario questions in the middle, and reserve the hardest dimensions (trade-offs, architecture, deep debugging) for the late-middle portion. Close reflectively. Individual questions should vary around the level — a natural arc, not a flat line at one complexity.
- Calibrate the overall bar to be slightly easier than typical high-stress corporate bar:
  * Beginner: 8–9 total questions. Focus on core fundamentals, intuitive mental models, basic syntax and common idioms. Ask straightforward practical questions.
  * Intermediate: 10–11 total questions. Solid engineering questions, common debugging scenarios, practical API/library usage, state handling. Slightly gentler than senior/lead expectations.
  * Expert: 15–20 total questions. Deep technical reasoning, architectural trade-offs, edge cases, system bottlenecks, but avoid obscure trivia or trick questions.

INTERVIEW STAGE GUIDE (8 stages total: introduction → behavioral → project → core_skills → practical → debugging → deeper_follow_up → wrap_up):
Active stage: ${stage}. Focus instructions for current stage and next:
${buildStageInstructions(stage, args.targetRole, args.targetCompany, technicalCompetencies)}

LENIENT & HELPFUL INTERVIEWER RULES (HINTS & SUPPORT):
1. SUPPORTIVE & LENIENT ON STUCK ANSWERS:
   - If candidate says "I don't know", gives an incomplete answer, gets stuck, or gives a very short answer (< 15 words):
     * BEGINNER: DO NOT treat as immediate failure! Offer a small, encouraging, directional hint to spark their thinking, and invite them to try again.
       Example: "That's okay. Think about what happens right after a component finishes rendering to the screen—what kind of side effects or data fetching might you want to trigger?"
       Set hintGiven=true and include hint in JSON.
     * INTERMEDIATE: Provide a light conceptual nudge or ask a clarifying question from a different angle.
     * EXPERT: Ask how they would investigate or troubleshoot the unknown behavior.
   - Hints must guide thinking, NOT give away the complete answer.
2. CONVERSATIONAL & PROFESSIONAL TONE:
   - Calm, conversational, and professional.
   - STRICTLY AVOID patronizing or childish cheerleading phrases like "Great answer!", "Awesome!", "Rockstar!", "You're doing fantastic!".
   - Use natural professional acknowledgments: "Understood.", "Fair point.", "That makes sense.", "Let's explore that a bit further."
3. QUESTION VARIETY & DIVERSITY (CRITICAL — the interviewer must feel like a real human):
   - NEVER repeat any question in "Questions Already Asked" or re-test a topic in "Covered Topics". REPETITION means more than identical wording: a reworded question, the same underlying concept with trivial wording changes ("What is JWT?" / "Explain JWT." / "Can you define JWT?"), the same scenario with different numbers, or re-asking a definition the candidate already gave — ALL of these count as repeats and are forbidden. If a skill needs more depth, attack it from a NEW dimension (see INTERVIEW DIMENSIONS above) instead.
   - Do NOT ask the same question type twice in a row. "Recent Question Types Asked" shows what was just used — rotate across conceptual, practical, debugging, scenario, architecture, trade-off, problem-solving, behavioral and follow-up styles.
   - Avoid textbook "What is X?" questions entirely. Ground every question in THIS candidate: their resume projects, GitHub repos, their previous answers, or the target company's public engineering context.
     * Instead of: "What is caching?"
     * Ask: "Your resume says you built <project>. If its traffic grew 10x overnight, what would break first — and what would you investigate?"
   - Then build the NEXT question on their answer (e.g. they say "add caching" → ask "What data would you cache, and how would you handle staleness?"). Conversational threading beats isolated trivia.
   - Every question must collect NEW evidence for a selected skill. Do not re-collect evidence you already have.
   - Reference the candidate's resume, GitHub, or project documents in roughly one of every three questions — enough to feel personal and attentive, never scripted. (Building on their immediately previous answer is always allowed and encouraged.) The rest of the time, explore the selected skills on their own merits.
4. SOFT-SKILL EVIDENCE COLLECTION (BEHAVIORAL & CONVERSATIONAL):
   - For each soft skill marked [ACTIVELY ASSESS], deliberately create opportunities to observe it. VARY the situation across the interview — never reuse the same behavioral prompt:
     * Communication: explaining a technical decision to a non-technical stakeholder; walking through a tricky bug they diagnosed; defending a design choice that was challenged.
     * Problem Solving / Analytical Thinking: an unexpected production issue; vague or incomplete requirements; debugging under time pressure; an approach that turned out wrong mid-way.
     * Leadership / Ownership: a project that was slipping where they stepped up; a decision made with incomplete information; owning a mistake that reached users.
     * Teamwork / Collaboration: a disagreement with a teammate or in code review; dividing responsibility fairly; helping a struggling colleague.
     * Adaptability / Time Management: requirements changing mid-project; learning an unfamiliar technology under deadline; abandoning an approach that wasn't working.
   - Anchor these situations in the candidate's actual projects and earlier answers where possible — realistic, not hypothetical.
   - These observations are the EVIDENCE the final evaluation will cite. Do not skip them.
5. ADAPTIVE FOLLOW-UP POLICY (use the candidate's latest answer before advancing):
   - STRONG answer: go one level deeper — a trade-off, edge case, failure mode, or a "what would you change if…" challenge.
   - PARTIAL / SHALLOW answer: ask ONE targeted clarifying question probing the missing concept before moving on.
   - STUCK / INCORRECT answer: simplify, offer a hint (rule 1), or pivot to a related strength — never silently move on.
   - INTERESTING CLAIM or a resume/GitHub project claim: investigate it — ask for implementation details, concrete numbers, or their personal contribution.
   - Never chain more than 2 follow-ups on the same point; then progress the interview naturally toward the next stage.
6. ADAPTIVE STOPPING & PACING:
   - When questionCount >= ${targets.maxQuestions - 1}: You MUST transition to stage_8_wrap_up and ask the closing wrap-up question.
   - When questionCount >= ${targets.maxQuestions}: You MUST set finished=true.
   - If questionCount >= ${targets.minQuestions} and enough evidence has been gathered across selected skills, you may move to stage_8_wrap_up and finish.

Return ONLY valid JSON with this exact shape:
{
  "answerQuality": "strong | shallow | vague | partial | incorrect | stuck",
  "stage": "${stage}",
  "question": "concise spoken question or hint-guided question for candidate",
  "difficulty": "Beginner | Intermediate | Advanced",
  "topic": "current topic area",
  "questionType": "introduction | behavioral | background | project | github | conceptual | practical | debugging | scenario | architecture | trade-off | problem-solving | follow-up | wrap-up",
  "skillAssessed": "specific skill name being tested",
  "followUp": true | false,
  "finished": true | false,
  "hintGiven": true | false,
  "hint": "optional hint text if a hint was provided"
}`;
}

export function buildTurnInstruction(args: {
  messages: InterviewMessage[];
  latestAnswer?: string;
  firstTurn?: boolean;
  targetRole?: string | null;
  targetCompany?: string | null;
  difficulty?: InterviewDifficulty | null;
  currentStage?: InterviewStage;
  questionCount?: number;
  resumeContext?: ResumeContext | null;
}): string {
  // Trim to the last 8 messages (4 exchange turns) to prevent O(n) prompt growth.
  // The system prompt already carries last 6 question snippets + covered topics for broader context.
  const allMessages = args.messages.map((item) => ({
    speaker: item.type === "Assistant" ? "interviewer" : "candidate",
    message: item.message,
  }));
  const conversation = allMessages.slice(-8);

  // Brief resume hint for first turn (only mention if we have real data)
  const resumeHint = args.resumeContext && args.resumeContext.projects.length > 0
    ? `\n(Context: candidate's resume lists projects like: ${args.resumeContext.projects.slice(0, 2).join("; ")}. You may reference one naturally in your opening icebreaker.)`
    : "";

  if (args.firstTurn) {
    return `Start the interview with Stage 1 (Introduction):
1. Welcome candidate warmly to their interview for ${args.targetRole ?? "the software role"} at ${args.targetCompany ?? "our company"}.
2. State the interview format in 1 sentence (starting with background and project discussion, then technical depth and practical scenarios).
3. Conclude with an open icebreaker asking them to introduce themselves and highlight a standout technical project they've built.${resumeHint}
Keep the total opening under 3-4 sentences so it is natural to listen to.`;
  }

  const targets = getDifficultyTargets(args.difficulty);
  const count = args.questionCount ?? 1;
  const isNearEnd = count >= targets.maxQuestions - 1;
  const isHardStop = count >= targets.maxQuestions;

  const stage = args.currentStage || "stage_4_core_skills";
  const historyNote = allMessages.length > 8
    ? `(Showing last ${conversation.length} of ${allMessages.length} messages. Earlier turns are summarized in the system prompt.)\n`
    : "";

  return `The candidate's latest spoken answer was:
"${args.latestAnswer ?? ""}"

Pacing Status:
- Turn: Question ${count} of target ${targets.minQuestions}–${targets.maxQuestions} (${targets.label} difficulty).
- Near End: ${isNearEnd ? "YES (Must wrap up now)" : "NO"}.
- Hard Max Reached: ${isHardStop ? "YES (Must set finished=true)" : "NO"}.

Turn Instructions:
1. Listen carefully to the candidate's answer:
   - If they said "I don't know" or got stuck: give them room — a brief supportive transition, a hint for Beginners (set hintGiven=true), a simpler related question, or a natural move to another relevant area. Do NOT repeatedly attack the same concept.
   - If they gave a partial or shallow answer: ask ONE focused clarification probing the missing concept (e.g. they described JWT login → "Walk me through what happens when the token expires mid-request.").
   - If they gave a strong answer: acknowledge concisely ("Understood.", "Makes sense."), then EITHER go one level deeper on that thread (trade-off, edge case, failure mode — e.g. after a strong caching answer: "Now imagine the cached data goes stale while multiple servers serve requests. How do you handle that?"), OR thread forward from a specific claim they made (they said "we chose MongoDB for flexibility" → "How did that flexibility choice affect your schema design?"), OR move to the next stage (${stage}).
2. Thread the conversation: whenever the answer contains meaningful material, the next question must visibly build on it — quote or reference their specific claim, decision, or project. If their answer was thin or off-topic, bridge briefly and pivot naturally instead of forcing a follow-up.
3. Stage & Pacing:
   - If Near End (${isNearEnd}): Ask the final wrap-up question (stage_8_wrap_up) thanking them and asking for any closing thoughts/questions.
   - If Hard Max Reached (${isHardStop}): Conclude gracefully with finished=true.
4. Keep spoken response concise (1-2 sentences). Do NOT cheerlead with phrases like "Awesome!" or "Great answer!".

Recent conversation (last ${conversation.length} messages):
${historyNote}${JSON.stringify(conversation)}`;
}

/**
 * Sanitize and cap candidate answer text before it enters any AI prompt.
 * - strips control characters (except newline/tab)
 * - neutralizes common prompt-override phrasing
 * - enforces a hard length cap so oversized answers cannot bloat or derail turns
 */
export function sanitizeAnswer(raw: string, maxLength = 6000): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/ignore\s+(all\s+)?(previous|prior)\s+instructions/gi, "[removed]")
    .replace(/system\s*:\s*you\s+are/gi, "[removed]")
    .replace(/```/g, "'''")
    .trim()
    .slice(0, maxLength);
}

export function questionCount(messages: InterviewMessage[]): number {
  return messages.filter((message) => message.type === "Assistant").length;
}

/**
 * Deterministically infer a question's dimension from its wording.
 * Used to build the recent-question-type history for the type-rotation rule
 * (the LLM self-reports types only for the current turn; history is inferred).
 */
export function inferQuestionType(question: string): QuestionType {
  const q = question.toLowerCase();
  if (/tell me about a time|conflict|disagree|teammate|team|deadline|pressure situation|how did you handle/.test(q))
    return "behavioral";
  if (/debug|bug|slow|fails?|failing|broken|error|memory leak|root cause|investigate what went/.test(q))
    return "debugging";
  if (/trade-?off|instead of|why (did you|would you) choose|downside|downsides|when would you avoid|cost of/.test(q))
    return "trade-off";
  if (/architect|structure|how would you (organize|design|structure)|scale|10x|traffic increases|at scale/.test(q))
    return "architecture";
  if (/suppose|imagine|what (would|will) happen if|walk me through what happens|real.world scenario/.test(q))
    return "scenario";
  if (/your (project|resume)|you (mentioned|built|worked on)|earlier you (said|mentioned)|the (app|system) you/.test(q))
    return "project";
  if (/you (just )?(said|mentioned)|following up|to follow up|earlier/.test(q))
    return "follow-up";
  if (/walk me through|how (did|would) you (build|implement)|what (steps|approach) would you take/.test(q))
    return "practical";
  return "conceptual";
}

/**
 * Word-set near-duplicate detection between a candidate question and the
 * recent question history. Catches: exact repeats, reworded same questions,
 * and same-concept trivial rewordings ("What is JWT?" vs "Explain JWT.").
 * Deliberately lightweight (word Jaccard) — no infrastructure.
 */
const DUP_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "do", "does", "did",
  "can", "could", "would", "will", "you", "me", "your", "tell", "explain",
  "what", "how", "why", "when", "about", "to", "of", "in", "and", "or",
]);

function questionWordSet(question: string): Set<string> {
  return new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !DUP_STOPWORDS.has(w)),
  );
}

export function isNearDuplicateQuestion(
  candidate: string,
  previousQuestions: string[],
  threshold = 0.75,
): boolean {
  const candidateSet = questionWordSet(candidate);
  if (candidateSet.size === 0) return false;
  const candidateKey = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const prev of previousQuestions) {
    const prevKey = prev.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (candidateKey === prevKey) return true; // exact (punctuation-insensitive)

    const prevSet = questionWordSet(prev);
    if (prevSet.size === 0) continue;
    let intersection = 0;
    for (const w of candidateSet) if (prevSet.has(w)) intersection++;
    const union = candidateSet.size + prevSet.size - intersection;
    if (union > 0 && intersection / union >= threshold) return true;

    // Tiny-topic containment: definition probes often reduce to a single
    // content word ("What is JWT?" vs "How would you define JWT?"). If one
    // question's content set (≤2 words) is fully contained in the other's,
    // both are probing the same single concept — treat as a repeat.
    const smaller = candidateSet.size <= prevSet.size ? candidateSet : prevSet;
    const larger = candidateSet.size <= prevSet.size ? prevSet : candidateSet;
    if (smaller.size >= 1 && smaller.size <= 2) {
      let contained = true;
      for (const w of smaller) if (!larger.has(w)) { contained = false; break; }
      if (contained) return true;
    }
  }
  return false;
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
