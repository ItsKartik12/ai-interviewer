import type {
  InterviewDifficulty,
  MessageType,
} from "./generated/prisma/client";

export type InterviewMessage = {
  type: MessageType;
  message: string;
};

export type InterviewDecision = {
  question: string;
  difficulty: InterviewDifficulty;
  topic: string;
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
        followUp: parsed.followUp === true,
        finished: parsed.finished === true,
      };
    }
  } catch {
    // Preserve compatibility with a plain-text model response.
  }

  return {
    question: response.trim(),
    difficulty: fallbackDifficulty,
    topic: "Programming",
    followUp: false,
    finished: false,
  };
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

  return `You are a senior technical interviewer conducting a finite, realistic software interview.

Candidate GitHub context (use only evidence present here; never invent project details):
${asGithubContext(args.githubMetadata)}

Interview target:
- Primary skill to assess: ${args.targetSkill ?? "General software development"}
- Candidate self-assessed level (context only, not the final rating): ${args.selfAssessedLevel ?? args.difficulty}
- Target company: ${args.targetCompany ?? "Not specified"}
- Target role: ${args.targetRole ?? "Software Developer"}

Interview state:
- Current difficulty: ${args.difficulty}
- Candidate answers/questions completed: ${args.questionCount}
- Topics already covered: ${topics}
- Target duration: ${args.durationMinutes} minutes
- Available topic areas: ${TOPICS.join(", ")}

For each turn, evaluate the candidate's latest answer for correctness, depth, relevance, clarity, confidence as expressed in the answer, and missing concepts. Decide whether the answer was strong, weak, partial, or off-topic. Use that judgment to choose the next move:
- Strong answer: increase difficulty or ask a deeper, targeted follow-up.
- Weak answer: clarify the missing concept with a simpler targeted question.
- Partial answer: follow up on the missing part before changing topic.
- Off-topic or ambiguous answer: briefly acknowledge it only when useful and refocus with one clear question.

Keep the primary skill as the main assessment area. Use related concepts only when they help evaluate that skill or the target role. Use the company name only as context for expected depth and engineering standards; do not claim questions are from that company's actual interview and do not invent company-specific facts. Choose relevant topics based on the GitHub evidence and conversation. Do not force every topic into the interview. Avoid questions that are substantially similar to anything already asked. Prefer project-specific questions only when the GitHub context supports them.

Ask exactly one concise question at a time. Do not teach, reveal an expected answer, stack multiple questions, or add excessive filler. Gradually move toward completion as the finite interview progresses. Set finished=true only when enough evidence has been gathered or the conversation is clearly complete.

Return ONLY valid JSON with this exact shape:
{
  "question": "one concise interviewer question",
  "difficulty": "Beginner | Intermediate | Advanced",
  "topic": "one topic area",
  "followUp": true,
  "finished": false
}`;
}

export function buildTurnInstruction(args: {
  messages: InterviewMessage[];
  latestAnswer?: string;
  firstTurn?: boolean;
}): string {
  const conversation = args.messages.map((item) => ({
    speaker: item.type === "Assistant" ? "interviewer" : "candidate",
    message: item.message,
  }));

  if (args.firstTurn) {
    return `Start the interview with one appropriate question. Use the GitHub context when it gives you a grounded, relevant angle. Do not ask for a generic self-introduction if the available context supports a more useful technical opening.\n\nConversation so far:\n${JSON.stringify(conversation)}`;
  }

  return `The candidate's latest answer was:\n${args.latestAnswer ?? ""}\n\nReview the full conversation below before deciding whether to follow up, change topic, or finish. Do not repeat a question that has already been asked.\n\nFull conversation:\n${JSON.stringify(conversation)}`;
}

export function questionCount(messages: InterviewMessage[]): number {
  return messages.filter((message) => message.type === "Assistant").length;
}

export function coveredTopics(messages: InterviewMessage[]): string[] {
  const topicSignals: Record<(typeof TOPICS)[number], RegExp> = {
    Programming: /javascript|typescript|python|java|coding|program|complexity/i,
    "Data Structures & Algorithms":
      /algorithm|array|linked list|tree|graph|hash map|complexity/i,
    OOP: /object[- ]oriented|class|inheritance|polymorphism|encapsulation/i,
    Databases: /database|sql|query|index|transaction|mongodb|postgres|schema/i,
    APIs: /api|rest|graphql|endpoint|authentication|authorization/i,
    "Web Development":
      /react|frontend|browser|html|css|web development|component/i,
    Backend: /backend|server|node|service|queue|cache|scaling/i,
    "Software Engineering":
      /testing|debug|deployment|architecture|ci\/cd|code review/i,
  };

  return TOPICS.filter((topic) =>
    messages.some(
      (message) =>
        message.type === "Assistant" &&
        topicSignals[topic].test(message.message),
    ),
  );
}
