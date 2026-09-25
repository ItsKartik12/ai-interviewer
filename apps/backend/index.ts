import "dotenv/config";
import express from "express";
import cors from "cors";
import z from "zod";
import { Prisma } from "./generated/prisma/client";

import { askOmniRoute } from "./omniroute.ts";
import { PreInterviewBody } from "./types";
import { calculateResult } from "./result";
import {
  getAllowedFrontendOrigins,
  getPort,
  logServiceConfiguration,
} from "./config/env.ts";
import { healthRouter } from "./routes/health.ts";
import { authRateLimit, globalRateLimit } from "./middleware/rateLimit.ts";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.ts";
import {
  buildInterviewSystemPrompt,
  buildTurnInstruction,
  coveredTopics,
  determineInterviewStage,
  inferQuestionType,
  isNearDuplicateQuestion,
  sanitizeAnswer,
  generateRoleSkills,
  getDifficultyTargets,
  parseInterviewDecision,
  parseResumeText,
  questionCount,
  type QuestionType,
  type ResumeContext,
  type RoleSkillRequirement,
} from "./interview-prompts.ts";
import { integrationRouter } from "./routes/integration.ts";
import { parsePdfDocument } from "./scrapers/pdf.ts";

// --------------------------------------------------
// MODULE-LEVEL HELPER: Parse combined jobDescription JSON
// --------------------------------------------------
function parseJobDesc(raw: string | null): {
  roleSkills: RoleSkillRequirement | null;
  resumeContext: ResumeContext | null;
  selectedSkills: string[];
  selectedSoftSkills: string[];
} {
  if (!raw)
    return { roleSkills: null, resumeContext: null, selectedSkills: [], selectedSoftSkills: [] };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const selectedSkills = Array.isArray(parsed.selectedSkills)
      ? (parsed.selectedSkills as string[]).map(String)
      : [];
    const selectedSoftSkills = Array.isArray(parsed.selectedSoftSkills)
      ? (parsed.selectedSoftSkills as string[]).map(String)
      : [];

    if (parsed.roleSkills !== undefined || parsed.resumeContext !== undefined) {
      return {
        roleSkills: (parsed.roleSkills as RoleSkillRequirement) ?? null,
        resumeContext: (parsed.resumeContext as ResumeContext) ?? null,
        selectedSkills,
        selectedSoftSkills,
      };
    }
    // Legacy: raw roleSkills at top level
    if (Array.isArray((parsed as any).technicalSkills)) {
      return {
        roleSkills: parsed as unknown as RoleSkillRequirement,
        resumeContext: null,
        selectedSkills,
        selectedSoftSkills,
      };
    }
  } catch { /* ignore */ }
  return { roleSkills: null, resumeContext: null, selectedSkills: [], selectedSoftSkills: [] };
}

const app = express();

const isProduction = process.env.NODE_ENV === "production";

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedFrontendOrigins();

      // Non-browser tools (curl, mobile apps, same-origin server calls) send no Origin.
      // Render health checks also hit us without an Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      // Local dev allowances only outside production; production trusts
      // exclusively the FRONTEND_URL allowlist.
      const isLocalDev =
        !isProduction &&
        (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
          origin.endsWith(".devtunnels.ms"));

      if (isLocalDev || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(globalRateLimit);
app.use(healthRouter);
app.use(integrationRouter);

// --------------------------------------------------
// AUTH
// --------------------------------------------------

app.get(
  "/api/v1/me",
  authRateLimit,
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    res.json({
      uid: req.user?.uid,
      email: req.user?.email ?? null,
      name: req.user?.name ?? null,
    });
  },
);

// --------------------------------------------------
// USER PROFILE (persistent, owned by the authenticated Firebase user)
// --------------------------------------------------

const ProfileUpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  education: z.string().trim().max(2000).optional(),
  targetRole: z.string().trim().min(1).max(120).optional(),
  experienceLevel: z
    .enum(["Beginner", "Intermediate", "Advanced"])
    .optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  // Persistent resume metadata: only the parsed structured context (projects,
  // technologies, education…) and the display file name are stored. The raw
  // PDF / file bytes are never persisted.
  resumeFileName: z.string().trim().max(200).optional(),
  resumeContext: z.any().optional(),
  githubUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/.+/.test(v), {
      message: "GitHub URL must be a valid http(s) URL",
    })
    .optional(),
  profileComplete: z.boolean().optional(),
});

app.get(
  "/api/v1/profile",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = await ensureUserProfile(req.user!);
      res.json({ profile: user });
    } catch (error) {
      console.error("Profile fetch error:", error);
      res.status(500).json({ error: "Failed to load profile" });
    }
  },
);

app.patch(
  "/api/v1/profile",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = ProfileUpdateBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid profile update",
          fields: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      await ensureUserProfile(req.user!);
      const { prisma } = await import("./db.ts");
      // Resume removal: explicitly clearing the file name resets both fields.
      const clearedResume =
        parsed.data.resumeFileName !== undefined &&
        parsed.data.resumeFileName.trim() === "";
      const profile = await prisma.userProfile.update({
        where: { uid: req.user!.uid },
        data: {
          name: parsed.data.name,
          education: parsed.data.education,
          targetRole: parsed.data.targetRole,
          experienceLevel: parsed.data.experienceLevel,
          skills: parsed.data.skills,
          githubUrl: parsed.data.githubUrl,
          profileComplete: parsed.data.profileComplete,
          resumeFileName: clearedResume ? null : parsed.data.resumeFileName,
          resumeContext: clearedResume
            ? Prisma.JsonNull
            : parsed.data.resumeContext !== undefined
              ? (parsed.data.resumeContext as Prisma.InputJsonValue)
              : undefined,
        },
      });

      res.json({ profile });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  },
);

// --------------------------------------------------
// RESULTS HISTORY (scoped strictly to the authenticated user)
// --------------------------------------------------

app.get(
  "/api/v1/interviews",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { prisma } = await import("./db.ts");
      const interviews = await prisma.interview.findMany({
        where: { userId: req.user!.uid, status: "Done", score: { not: null } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          role: true,
          targetRole: true,
          targetCompany: true,
          targetSkill: true,
          selfAssessedLevel: true,
          score: true,
          feedback: true,
          strengthsList: true,
          weaknessesList: true,
          evaluation: true,
          completedAt: true,
          createdAt: true,
        },
      });

      res.json({ interviews });
    } catch (error) {
      console.error("History fetch error:", error);
      res.status(500).json({ error: "Failed to load interview history" });
    }
  },
);

// --------------------------------------------------
// AUTH HELPERS — shared guards for user-owned resources
// --------------------------------------------------

/**
 * Load an interview and enforce that it belongs to the authenticated user.
 * Returns the interview or null after sending the appropriate error response.
 */
async function loadOwnedInterview(
  req: AuthenticatedRequest,
  res: express.Response,
  interviewId: string,
) {
  const { prisma } = await import("./db.ts");
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { conversations: true },
  });

  if (!interview) {
    res.status(404).json({ error: "Interview not found" });
    return null;
  }

  // Ownership check: a valid interview ID alone is NOT enough — the resource
  // must belong to the authenticated Firebase user.
  if (req.user?.uid && interview.userId !== req.user.uid) {
    res.status(403).json({ error: "You do not have access to this interview" });
    return null;
  }

  return interview;
}

/**
 * Create or fetch the database user record for an authenticated Firebase user.
 * Identity always comes from the verified Firebase ID token — never from the client body.
 */
async function ensureUserProfile(user: NonNullable<AuthenticatedRequest["user"]>) {
  const { prisma } = await import("./db.ts");
  return prisma.userProfile.upsert({
    where: { uid: user.uid },
    update: {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
    },
    create: {
      uid: user.uid,
      email: user.email ?? `${user.uid}@unknown.local`,
      name: user.name ?? null,
    },
  });
}

// --------------------------------------------------
// ANALYZE ROLE SKILLS
// --------------------------------------------------

app.post("/api/v1/analyze-role", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { role, company, level, skill, context, githubUrl, resumeContext } =
      req.body ?? {};

    if (!role || typeof role !== "string") {
      res.status(400).json({
        error: "Target role is required",
      });
      return;
    }

    const roleSkills = await generateRoleSkills({
      role: String(role).trim(),
      company: company ? String(company).trim() : undefined,
      level: level ? String(level).trim() : undefined,
      targetSkill: skill ? String(skill).trim() : undefined,
      context: context ? String(context).trim() : undefined,
      // Enrich recommendations with the candidate's GitHub + parsed resume so
      // suggested skills bridge the role with the candidate's real stack.
      githubMetadata: githubUrl
        ? { summary: `Candidate GitHub profile: ${String(githubUrl).trim()}` }
        : undefined,
      resumeContext:
        resumeContext && typeof resumeContext === "object"
          ? (resumeContext as ResumeContext)
          : undefined,
    });

    res.json({
      roleSkills,
    });
  } catch (error) {
    console.error("Analyze role error:", error);

    res.status(500).json({
      error: "Failed to analyze role skills",
    });
  }
});

// --------------------------------------------------
// PARSE PDF RESUME
// --------------------------------------------------

app.post("/api/v1/parse-pdf", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { pdfBase64, fileName } = req.body ?? {};

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      res.status(400).json({ error: "PDF data (base64) is required." });
      return;
    }

    let binaryData: Uint8Array;
    try {
      const buf = Buffer.from(pdfBase64, "base64");
      binaryData = new Uint8Array(buf);
    } catch {
      res.status(400).json({ error: "Invalid base64 PDF data." });
      return;
    }

    const result = await parsePdfDocument(binaryData);

    res.json({
      resumeContext: result.resumeContext,
      textPreview: result.text.slice(0, 500),
      totalPages: result.totalPages,
      fileName: fileName ?? "resume.pdf",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse PDF";
    console.error("[parse-pdf] Error:", message);
    res.status(422).json({ error: message });
  }
});

// --------------------------------------------------
// CREATE PRE-INTERVIEW
// --------------------------------------------------

app.post("/api/v1/pre-interview", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsedBody = PreInterviewBody.safeParse(req.body);

    if (!parsedBody.success) {
      res.status(400).json({
        error: "Interview configuration is incomplete or invalid",
        fields: parsedBody.error.flatten().fieldErrors,
      });
      return;
    }

    const data = parsedBody.data;

    // --------------------------------------------------
    // GitHub + Resume + Role Skills: all run in parallel
    // --------------------------------------------------
    let githubData: unknown = null;
    const githubUrl = (data.github || "").trim().replace(/\/$/, "");
    const githubUsername = githubUrl ? githubUrl.split("/").pop() : null;

    let resumeContext: ResumeContext | null = null;
    // Resolve profile-level resume fallback once — used below when the
    // interview form has no per-interview upload.
    const profileForResume = await ensureUserProfile(req.user!);
    const profileResume: ResumeContext | null =
      profileForResume.resumeContext &&
      typeof profileForResume.resumeContext === "object"
        ? (profileForResume.resumeContext as ResumeContext)
        : null;

    // Pre-compute heuristic roleSkills so parallel task has the full input
    // The LLM call inside generateRoleSkills may be slow — run it alongside scraping.
    const alreadyHasRoleSkills =
      data.roleSkills &&
      Array.isArray(data.roleSkills.technicalSkills) &&
      data.roleSkills.technicalSkills.length > 0;

    const [githubResult, resumeResult, roleSkillsResult] = await Promise.allSettled([
      // GitHub scrape (only if URL provided)
      githubUsername
        ? (async () => {
            const { scrapeGithub } = await import("./scrapers/github.ts");
            return scrapeGithub(githubUsername);
          })()
        : Promise.resolve(null),
      // Resume parse (only if text provided)
      data.resumeText && data.resumeText.trim().length >= 30
        ? parseResumeText(data.resumeText)
        : Promise.resolve(null),
      // Role skills — skip if already provided by frontend (from analyze-role step)
      alreadyHasRoleSkills
        ? Promise.resolve(data.roleSkills)
        : generateRoleSkills({
            role: data.role,
            company: data.company,
            level: data.level,
            targetSkill: data.skill,
          }),
    ]);

    if (githubResult.status === "fulfilled") {
      githubData = githubResult.value;
    } else {
      console.warn("[github] Scrape failed, continuing:", githubResult.reason);
    }

    if (resumeResult.status === "fulfilled") {
      resumeContext = resumeResult.value;
      if (resumeContext) {
        console.log("[resume] Parsed resume context:", {
          projects: resumeContext.projects.length,
          technologies: resumeContext.technologies.length,
          experience: resumeContext.experience.length,
        });
      }
    } else {
      console.warn("[resume] Parse failed, continuing:", resumeResult.reason);
    }

    // Fall back to the profile-level resume when the interview form has no
    // per-interview upload, so profile personalization always applies.
    if (!resumeContext && profileResume) {
      resumeContext = profileResume;
      console.log("[resume] Using profile-level resume context (no per-interview upload).");
    }

    // Resolve role skills: parallel result → frontend-provided → fallback
    let roleSkills =
      roleSkillsResult.status === "fulfilled" && roleSkillsResult.value
        ? roleSkillsResult.value
        : data.roleSkills ?? null;

    if (!roleSkills || !Array.isArray(roleSkills.technicalSkills) || roleSkills.technicalSkills.length === 0) {
      console.warn("[roleSkills] Parallel generation failed, using heuristic fallback:",
        roleSkillsResult.status === "rejected" ? roleSkillsResult.reason : "no result");
      roleSkills = await generateRoleSkills({
        role: data.role,
        company: data.company,
        level: data.level,
        targetSkill: data.skill,
      });
    }

    // Identity comes exclusively from the verified Firebase token.
    // (profileForResume was already fetched above for the resume fallback.)
    const user = profileForResume;
    const { prisma } = await import("./db.ts");

    // Store roleSkills, resumeContext, and selectedSkills in jobDescription JSON
    const jobDescriptionJson = JSON.stringify({
      roleSkills,
      resumeContext: resumeContext ?? null,
      selectedSkills: data.selectedSkills ?? [],
      selectedSoftSkills: data.selectedSoftSkills ?? [],
    });

    const interview = await prisma.interview.create({
      data: {
        userId: user.uid,
        type: "Technical",
        role: data.role,
        difficulty: data.level,
        targetSkill: data.skill,
        selfAssessedLevel: data.level,
        targetCompany: data.company,
        targetRole: data.role,
        duration: 30,
        githubMetadata: githubData ?? {},
        jobDescription: jobDescriptionJson,
        status: "Pre",
      },
    });

    console.log("Interview created:", interview.id, "for user:", user.uid);

    res.json({
      id: interview.id,
      roleSkills,
      hasResume: resumeContext !== null,
      hasGithub: githubData !== null,
    });
  } catch (error) {
    console.error("Pre-interview error:", error);

    res.status(500).json({
      error: "Failed to create interview",
    });
  }
});

// --------------------------------------------------
// DEEPGRAM SHORT-LIVED TOKEN
// --------------------------------------------------

// In-memory cache for Deepgram project ID
let cachedDeepgramProjectId: string | null = null;

async function getDeepgramTemporaryKey(masterKey: string): Promise<string> {
  // 1. Resolve project ID if not already cached
  let projectId = cachedDeepgramProjectId;
  if (!projectId) {
    const projectResponse = await fetch("https://api.deepgram.com/v1/projects", {
      method: "GET",
      headers: {
        Authorization: `Token ${masterKey}`,
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!projectResponse.ok) {
      const errText = await projectResponse.text();
      throw new Error(`Failed to list Deepgram projects (${projectResponse.status}): ${errText.slice(0, 150)}`);
    }

    const projectData = (await projectResponse.json()) as {
      projects?: Array<{ project_id: string }>;
    };

    const firstProject = projectData.projects?.[0];
    if (!firstProject?.project_id) {
      throw new Error("No Deepgram project found for this API key.");
    }

    projectId = firstProject.project_id;
    cachedDeepgramProjectId = projectId;
  }

  // 2. Generate short-lived project key (600s TTL, usage:write scope only)
  const keyResponse = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
    method: "POST",
    headers: {
      Authorization: `Token ${masterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      comment: "Temporary interview voice session",
      scopes: ["usage:write"],
      time_to_live_in_seconds: 600,
    }),
    signal: AbortSignal.timeout(7000),
  });

  if (!keyResponse.ok) {
    // If cached project ID became invalid, clear cache
    cachedDeepgramProjectId = null;
    const errText = await keyResponse.text();
    throw new Error(`Failed to generate temporary Deepgram key (${keyResponse.status}): ${errText.slice(0, 150)}`);
  }

  const keyData = (await keyResponse.json()) as {
    key?: string;
  };

  if (!keyData.key || typeof keyData.key !== "string") {
    throw new Error("Deepgram did not return a valid temporary key.");
  }

  return keyData.key;
}

const handleDeepgramTokenRequest = async (_req: express.Request, res: express.Response) => {
  try {
    const deepgramKey = process.env.DEEPGRAM_API_KEY;

    if (!deepgramKey) {
      res.status(500).json({
        error: "Deepgram API key is not configured on the backend.",
      });
      return;
    }

    const temporaryToken = await getDeepgramTemporaryKey(deepgramKey.trim());

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    res.json({
      token: temporaryToken,
    });
  } catch (error: any) {
    const isDnsError =
      error?.code === "ENOTFOUND" ||
      error?.cause?.code === "ENOTFOUND" ||
      String(error?.message || "").includes("ENOTFOUND") ||
      String(error?.cause?.message || "").includes("ENOTFOUND");

    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";

    console.warn(
      `[deepgram-token] ${isDnsError ? "DNS resolution failed (ENOTFOUND)" : isTimeout ? "Request timed out after 7s" : error?.message || error}`,
    );

    res.status(isDnsError ? 503 : 500).json({
      error: isDnsError
        ? "Unable to reach Deepgram speech recognition service. Check internet, DNS, or proxy connectivity."
        : isTimeout
          ? "Deepgram token request timed out. Please check network connection."
          : "Failed to generate Deepgram voice token.",
    });
  }
};

// Both POST and GET are authenticated and rate-limited: only signed-in users
// may mint short-lived speech credentials (abuse/cost protection).
app.post("/api/v1/deepgram-token", requireAuth, authRateLimit, handleDeepgramTokenRequest);
app.get("/api/v1/deepgram-token", requireAuth, authRateLimit, handleDeepgramTokenRequest);

// --------------------------------------------------
// START INTERVIEW
// --------------------------------------------------
// This replaces the old OpenAI Realtime session endpoint.
//
// Frontend calls this when the interview page opens.
// OmniRoute generates the first interviewer question.

app.post("/api/v1/interview/start/:interviewId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const interview = await loadOwnedInterview(
      req,
      res,
      String(req.params.interviewId),
    );
    if (!interview) return;

    const { prisma } = await import("./db.ts");

    // Don't create another first question if one already exists.
    const existingMessages = await prisma.message.findMany({
      where: {
        interviewId: interview.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (existingMessages.length > 0) {
      const firstAssistantMessage = existingMessages.find(
        (message) => message.type === "Assistant",
      );

      res.json({
        message:
          firstAssistantMessage?.message ??
          "Let's begin the interview. Please introduce yourself.",
        targetSkill: interview.targetSkill,
        targetRole: interview.targetRole,
        targetCompany: interview.targetCompany,
        selfAssessedLevel: interview.selfAssessedLevel,
        questionType: "introduction",
        skillAssessed: "Background & Communication",
      });

      return;
    }

  const { roleSkills, resumeContext, selectedSkills, selectedSoftSkills } = parseJobDesc(interview.jobDescription ?? null);

  const targets = getDifficultyTargets(interview.difficulty);
  const stage = determineInterviewStage(0, interview.difficulty);

    const aiTimerLabel = `[start] OmniRoute (interview ${interview.id})`;
    console.time(aiTimerLabel);
    const aiResponse = await askOmniRoute([
      {
        role: "system",
        content: buildInterviewSystemPrompt({
          githubMetadata: interview.githubMetadata,
          difficulty: interview.difficulty,
          targetSkill: interview.targetSkill,
          selfAssessedLevel: interview.selfAssessedLevel,
          targetCompany: interview.targetCompany,
          targetRole: interview.targetRole,
          roleSkills,
          resumeContext,
          selectedSkills,
          selectedSoftSkills,
          questionCount: 0,
          coveredTopics: [],
          durationMinutes: interview.duration,
          previousQuestions: [],
          previousQuestionTypes: [],
          currentStage: stage,
        }),
      },
      {
        role: "user",
        content: buildTurnInstruction({
          messages: [],
          firstTurn: true,
          targetRole: interview.targetRole ?? undefined,
          targetCompany: interview.targetCompany ?? undefined,
          difficulty: interview.difficulty,
          currentStage: stage,
          questionCount: 1,
          resumeContext,
        }),
      },
    ]);
    console.timeEnd(aiTimerLabel);

    if (!aiResponse) {
      throw new Error("OmniRoute returned an empty response");
    }

    const decision = parseInterviewDecision(aiResponse, interview.difficulty, stage);

    await prisma.message.create({
      data: {
        interviewId: interview.id,
        type: "Assistant",
        message: decision.question,
      },
    });

    await prisma.interview.update({
      where: { id: interview.id },
      data: {
        status: "InProgress",
        startedAt: interview.startedAt ?? new Date(),
        difficulty: decision.difficulty,
      },
    });

    res.json({
      message: decision.question,
      targetSkill: interview.targetSkill,
      targetRole: interview.targetRole,
      targetCompany: interview.targetCompany,
      selfAssessedLevel: interview.selfAssessedLevel,
      questionType: decision.questionType,
      skillAssessed: decision.skillAssessed,
      stage: decision.stage || stage,
      answerQuality: decision.answerQuality,
      minQuestions: targets.minQuestions,
      maxQuestions: targets.maxQuestions,
    });
  } catch (error) {
    console.error("Interview start error:", error);

    res.status(500).json({
      error: "Failed to start interview",
    });
  }
});

// --------------------------------------------------
// INTERVIEW RESPONSE
// --------------------------------------------------

app.post("/api/v1/interview/respond/:interviewId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({
        error: "Message is required",
      });
      return;
    }

    // Sanitize + cap before persisting or prompting (prompt-injection and
    // prompt-bloat protection for untrusted candidate input).
    const sanitizedAnswer = sanitizeAnswer(message);
    if (!sanitizedAnswer) {
      res.status(400).json({ error: "Message content is empty after sanitization" });
      return;
    }

    const { prisma } = await import("./db.ts");

    const interview = await loadOwnedInterview(req, res, String(req.params.interviewId));
    if (!interview) return;

    // Save candidate response
    await prisma.message.create({
      data: {
        interviewId: interview.id,
        type: "User",
        message: sanitizedAnswer,
      },
    });

    // Build conversation history
    const conversation = interview.conversations.map((item) => ({
      role: item.type === "User" ? ("user" as const) : ("assistant" as const),
      content: item.message,
    }));

    // Add current candidate response
    conversation.push({
      role: "user",
      content: sanitizedAnswer,
    });

    const { roleSkills, resumeContext, selectedSkills, selectedSoftSkills } = parseJobDesc(interview.jobDescription ?? null);

    const targets = getDifficultyTargets(interview.difficulty);
    const currentQuestionCount = questionCount(interview.conversations);

    // Hard stopping condition: If candidate has already answered the maximum questions for their level,
    // finalize cleanly and stop generating new questions.
    if (currentQuestionCount >= targets.maxQuestions) {
      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          status: "Done",
          completedAt: new Date(),
        },
      });

      res.json({
        message:
          "Thank you for sharing your background and answering our technical questions today. That concludes our interview! Let's review your performance summary.",
        difficulty: interview.difficulty,
        topic: "Interview Conclusion",
        followUp: false,
        finished: true,
        questionType: "wrap-up",
        skillAssessed: "Interview Conclusion",
        stage: "stage_8_wrap_up",
        answerQuality: "strong",
        minQuestions: targets.minQuestions,
        maxQuestions: targets.maxQuestions,
      });
      return;
    }

    const isNearEnd = currentQuestionCount >= targets.maxQuestions - 1;
    const stage = isNearEnd
      ? "stage_8_wrap_up"
      : determineInterviewStage(currentQuestionCount, interview.difficulty);

    const previousAssistantMessages = interview.conversations.filter(
      (item) => item.type === "Assistant",
    );

    // Question-type history is deterministically inferred from the actual
    // questions asked, so the prompt's type-rotation rule reflects reality.
    const previousQuestionTypes: QuestionType[] = previousAssistantMessages.map(
      (item) => inferQuestionType(item.message),
    );

    const respondTimerLabel = `[respond] OmniRoute (interview ${interview.id}, Q${currentQuestionCount + 1})`;
    console.time(respondTimerLabel);
    const aiResponse = await askOmniRoute([
      {
        role: "system",
        content: buildInterviewSystemPrompt({
          githubMetadata: interview.githubMetadata,
          difficulty: interview.difficulty,
          targetSkill: interview.targetSkill,
          selfAssessedLevel: interview.selfAssessedLevel,
          targetCompany: interview.targetCompany,
          targetRole: interview.targetRole,
          roleSkills,
          resumeContext,
          selectedSkills,
          selectedSoftSkills,
          questionCount: currentQuestionCount,
          coveredTopics: coveredTopics(interview.conversations),
          durationMinutes: interview.duration,
          previousQuestions: previousAssistantMessages.map((item) => item.message),
          previousQuestionTypes,
          currentStage: stage,
        }),
      },
      {
        role: "user",
        content: buildTurnInstruction({
          messages: interview.conversations,
          latestAnswer: sanitizedAnswer,
          difficulty: interview.difficulty,
          currentStage: stage,
          questionCount: currentQuestionCount + 1,
          resumeContext,
        }),
      },
    ]);
    console.timeEnd(respondTimerLabel);

    if (!aiResponse) {
      throw new Error("OmniRoute returned an empty response");
    }

    let decision = parseInterviewDecision(aiResponse, interview.difficulty, stage);

    // Deterministic repetition guard: if the generated question is a near
    // duplicate of anything already asked (same wording, reworded, or same
    // underlying concept), ask the model ONCE for a fresh angle instead of
    // shipping the repeat. No loop — if the retry is also a duplicate, the
    // original decision stands.
    const recentQuestions = previousAssistantMessages.map((item) => item.message);
    if (decision.question && isNearDuplicateQuestion(decision.question, recentQuestions)) {
      console.warn(
        `[respond] Near-duplicate question detected for interview ${interview.id}; requesting a fresh angle.`,
      );
      const retryResponse = await askOmniRoute([
        {
          role: "system",
          content: buildInterviewSystemPrompt({
            githubMetadata: interview.githubMetadata,
            difficulty: interview.difficulty,
            targetSkill: interview.targetSkill,
            selfAssessedLevel: interview.selfAssessedLevel,
            targetCompany: interview.targetCompany,
            targetRole: interview.targetRole,
            roleSkills,
            resumeContext,
            selectedSkills,
            selectedSoftSkills,
            questionCount: currentQuestionCount,
            coveredTopics: coveredTopics(interview.conversations),
            durationMinutes: interview.duration,
            previousQuestions: recentQuestions,
            previousQuestionTypes,
            currentStage: stage,
          }),
        },
        {
          role: "user",
          content: `The candidate's latest answer was:
"${sanitizedAnswer}"

Your previous draft question was:
"${decision.question}"

That question (or a trivial rewording of it) was ALREADY asked earlier in this interview. Ask a COMPLETELY DIFFERENT question: move to a different selected skill, or explore a new dimension (practical, debugging, architecture, trade-off, or project-grounded). Do NOT re-test the same underlying concept. Keep it 1-2 sentences, conversational, and grounded in the candidate's earlier answers where natural. Return ONLY valid JSON with the same shape as before.`,
        },
      ]);
      if (retryResponse) {
        const retryDecision = parseInterviewDecision(retryResponse, interview.difficulty, stage);
        if (
          retryDecision.question &&
          !isNearDuplicateQuestion(retryDecision.question, recentQuestions)
        ) {
          decision = retryDecision;
        }
      }
    }

    // If hard max will be reached on this turn or decision finished:
    const isFinished = decision.finished === true || (isNearEnd && decision.questionType === "wrap-up");

    // Save AI response + update interview status in parallel
    await Promise.all([
      prisma.message.create({
        data: {
          interviewId: interview.id,
          type: "Assistant",
          message: decision.question,
        },
      }),
      prisma.interview.update({
        where: { id: interview.id },
        data: {
          status: isFinished ? "Done" : "InProgress",
          difficulty: decision.difficulty,
          completedAt: isFinished ? new Date() : undefined,
        },
      }),
    ]);

    res.json({
      message: decision.question,
      difficulty: decision.difficulty,
      topic: decision.topic,
      followUp: decision.followUp,
      finished: isFinished,
      questionType: decision.questionType,
      skillAssessed: decision.skillAssessed,
      stage: decision.stage || stage,
      answerQuality: decision.answerQuality,
      hintGiven: decision.hintGiven ?? false,
      hint: decision.hint,
      minQuestions: targets.minQuestions,
      maxQuestions: targets.maxQuestions,
    });
  } catch (error) {
    console.error("Interview response error:", error);

    res.status(500).json({
      error: "Failed to generate interviewer response",
    });
  }
});

// --------------------------------------------------
// INTERVIEW RESULT
// --------------------------------------------------

// Per-interview in-flight evaluation promises (single-process race guard).
const inFlightEvaluations = new Map<string, Promise<void>>();

app.get("/api/v1/result/:interviewId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const interview = await loadOwnedInterview(req, res, String(req.params.interviewId));
    if (!interview) return;

    const { prisma } = await import("./db.ts");

    const { roleSkills, resumeContext, selectedSkills, selectedSoftSkills } = parseJobDesc(
      interview.jobDescription ?? null,
    );

    // Compute the result if the interview is still in progress OR if it was
    // marked "Done" without ever being scored (e.g. the hard max-questions
    // completion path sets status "Done" directly without an evaluation).
    if (interview.status !== "Done" || interview.score == null) {
      // Race guard: result-page polling, refreshes, and multiple tabs can all
      // hit this endpoint concurrently. Share a single in-flight evaluation
      // promise per interview so the LLM evaluation runs exactly once; later
      // requests await the same promise instead of re-triggering the AI call.
      const existing = inFlightEvaluations.get(interview.id);
      if (existing) {
        await existing.catch(() => undefined);
        return res.redirect(302, req.originalUrl);
      }

      const evaluationPromise = (async () => {
        const result = await calculateResult(
          interview.conversations,
          interview.githubMetadata,
          {
            role: interview.targetRole,
            company: interview.targetCompany,
            targetSkill: interview.targetSkill,
            selectedSkills,
            selectedSoftSkills,
            selfAssessedLevel: interview.selfAssessedLevel,
            roleSkills,
            resumeContext,
          },
        );

        await prisma.interview.update({
          where: {
            id: interview.id,
          },
          data: {
            status: "Done",
            feedback: result.overallFeedback,
            score: result.score,
            evaluation: result,
            strengthsList: result.strengths,
            weaknessesList: result.weaknesses,
            recommendations: result.topicsToImprove,
            completedAt: new Date(),
          },
        });
      })();

      inFlightEvaluations.set(interview.id, evaluationPromise);
      try {
        await evaluationPromise;
      } finally {
        inFlightEvaluations.delete(interview.id);
      }

      // Re-read the persisted, freshly evaluated interview so every waiter —
      // including requests that joined the in-flight promise — gets the same
      // stored evaluation payload.
      const evaluated = await prisma.interview.findUnique({
        where: { id: interview.id },
        include: { conversations: true },
      });
      if (!evaluated) {
        res.status(404).json({ error: "Interview not found" });
        return;
      }

      res.json({
        score: evaluated.score,
        feedback: evaluated.feedback,
        status: evaluated.status,
        evaluation: evaluated.evaluation,
        targetSkill: evaluated.targetSkill,
        targetRole: evaluated.targetRole,
        targetCompany: evaluated.targetCompany,
        selfAssessedLevel: evaluated.selfAssessedLevel,
        roleSkills,
        transcript: evaluated.conversations.map((conversation) => ({
          type: conversation.type,
          content: conversation.message,
          createdAt: conversation.createdAt,
        })),
      });
      return;
    }

    res.json({
      score: interview.score,
      feedback: interview.feedback,
      status: interview.status,
      evaluation: interview.evaluation,
      targetSkill: interview.targetSkill,
      targetRole: interview.targetRole,
      targetCompany: interview.targetCompany,
      selfAssessedLevel: interview.selfAssessedLevel,
      roleSkills,

      transcript: interview.conversations.map((conversation) => ({
        type: conversation.type,
        content: conversation.message,
        createdAt: conversation.createdAt,
      })),
    });
  } catch (error) {
    console.error("Result error:", error);

    res.status(500).json({
      error: "Failed to generate interview result",
    });
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const port = getPort();

logServiceConfiguration();

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
