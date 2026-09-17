import "dotenv/config";
import express from "express";
import cors from "cors";

import { askOmniRoute } from "./omniroute.ts";
import { PreInterviewBody } from "./types";
import { calculateResult } from "./result";
import {
  getFrontendUrl,
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
  generateRoleSkills,
  getDifficultyTargets,
  parseInterviewDecision,
  parseResumeText,
  questionCount,
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
} {
  if (!raw) return { roleSkills: null, resumeContext: null, selectedSkills: [] };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const selectedSkills = Array.isArray(parsed.selectedSkills)
      ? (parsed.selectedSkills as string[]).map(String)
      : [];

    if (parsed.roleSkills !== undefined || parsed.resumeContext !== undefined) {
      return {
        roleSkills: (parsed.roleSkills as RoleSkillRequirement) ?? null,
        resumeContext: (parsed.resumeContext as ResumeContext) ?? null,
        selectedSkills,
      };
    }
    // Legacy: raw roleSkills at top level
    if (Array.isArray((parsed as any).technicalSkills)) {
      return {
        roleSkills: parsed as unknown as RoleSkillRequirement,
        resumeContext: null,
        selectedSkills,
      };
    }
  } catch { /* ignore */ }
  return { roleSkills: null, resumeContext: null, selectedSkills: [] };
}

const app = express();

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));


app.use(
  cors({
    origin: (origin, callback) => {
      const frontendUrl = getFrontendUrl();

      if (
        !origin ||
        origin === frontendUrl ||
        origin.includes("localhost") ||
        origin.includes("devtunnels.ms")
      ) {
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
// ANALYZE ROLE SKILLS
// --------------------------------------------------

app.post("/api/v1/analyze-role", async (req, res) => {
  try {
    const { role, company, level, skill, context } = req.body ?? {};

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

app.post("/api/v1/parse-pdf", async (req, res) => {
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

app.post("/api/v1/pre-interview", async (req, res) => {
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

    const { prisma } = await import("./db.ts");

    // Temporary user for local development
    const user = await prisma.userProfile.upsert({
      where: {
        uid: "local-dev-user",
      },
      update: {},
      create: {
        uid: "local-dev-user",
        email: "local-dev@example.com",
        name: "Local Developer",
      },
    });

    // Store roleSkills, resumeContext, and selectedSkills in jobDescription JSON
    const jobDescriptionJson = JSON.stringify({
      roleSkills,
      resumeContext: resumeContext ?? null,
      selectedSkills: data.selectedSkills ?? [],
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

    console.log("Interview created:", interview.id);

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

app.post("/api/v1/deepgram-token", async (_req, res) => {
  try {
    const deepgramKey = process.env.DEEPGRAM_API_KEY;

    if (!deepgramKey) {
      res.status(500).json({
        error: "Deepgram API key is not configured",
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ttl_seconds: 600,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = (await response.json()) as {
      access_token?: unknown;
    };

    if (!response.ok) {
      console.error("Deepgram token error response:", data);

      res.status(response.status).json({
        error: "Failed to generate Deepgram token",
      });
      return;
    }

    if (typeof data.access_token !== "string" || !data.access_token) {
      console.error("Deepgram token response did not include an access token");

      res.status(502).json({
        error: "Deepgram returned an invalid token response",
      });
      return;
    }

    res.set("Cache-Control", "no-store");

    res.json({
      token: data.access_token,
    });
  } catch (error: any) {
    const isDnsError =
      error?.code === "ENOTFOUND" ||
      error?.cause?.code === "ENOTFOUND" ||
      String(error?.message || "").includes("ENOTFOUND") ||
      String(error?.cause?.message || "").includes("ENOTFOUND");

    const isTimeout = error?.name === "AbortError";

    console.warn(
      `[deepgram-token] ${isDnsError ? "DNS resolution failed (ENOTFOUND)" : isTimeout ? "Request timed out after 8s" : error?.message || error}`,
    );

    res.status(isDnsError ? 503 : 500).json({
      error: isDnsError
        ? "Unable to reach Deepgram speech recognition service. Check internet, DNS, or proxy connectivity."
        : isTimeout
          ? "Deepgram token request timed out. Please check network connection."
          : "Failed to generate Deepgram token",
    });
  }
});

// --------------------------------------------------
// START INTERVIEW
// --------------------------------------------------
// This replaces the old OpenAI Realtime session endpoint.
//
// Frontend calls this when the interview page opens.
// OmniRoute generates the first interviewer question.

app.post("/api/v1/interview/start/:interviewId", async (req, res) => {
  try {
    const { prisma } = await import("./db.ts");

    const interview = await prisma.interview.findUnique({
      where: {
        id: req.params.interviewId,
      },
    });

    if (!interview) {
      res.status(404).json({
        error: "Interview not found",
      });
      return;
    }

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

  const { roleSkills, resumeContext } = parseJobDesc(interview.jobDescription ?? null);

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
          questionCount: 0,
          coveredTopics: [],
          durationMinutes: interview.duration,
          previousQuestions: [],
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

app.post("/api/v1/interview/respond/:interviewId", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({
        error: "Message is required",
      });
      return;
    }

    const { prisma } = await import("./db.ts");

    const interview = await prisma.interview.findUnique({
      where: {
        id: req.params.interviewId,
      },
      include: {
        conversations: true,
      },
    });

    if (!interview) {
      res.status(404).json({
        error: "Interview not found",
      });
      return;
    }

    // Save candidate response
    await prisma.message.create({
      data: {
        interviewId: interview.id,
        type: "User",
        message,
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
      content: message,
    });

  const { roleSkills, resumeContext } = parseJobDesc(interview.jobDescription ?? null);

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
          questionCount: currentQuestionCount,
          coveredTopics: coveredTopics(interview.conversations),
          durationMinutes: interview.duration,
          previousQuestions: previousAssistantMessages.map((item) => item.message),
          currentStage: stage,
        }),
      },
      {
        role: "user",
        content: buildTurnInstruction({
          messages: interview.conversations,
          latestAnswer: message,
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

    const decision = parseInterviewDecision(aiResponse, interview.difficulty, stage);

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

app.get("/api/v1/result/:interviewId", async (req, res) => {
  try {
    const { prisma } = await import("./db.ts");

    const interview = await prisma.interview.findUnique({
      where: {
        id: req.params.interviewId,
      },
      include: {
        conversations: true,
      },
    });

    if (!interview) {
      res.status(404).json({
        error: "Interview not found",
      });
      return;
    }

    let score = interview.score;
    let feedback = interview.feedback;
    let status = interview.status;

    const { roleSkills, resumeContext, selectedSkills } = parseJobDesc(
      interview.jobDescription ?? null,
    );

    if (interview.status !== "Done") {
      const result = await calculateResult(
        interview.conversations,
        interview.githubMetadata,
        {
          role: interview.targetRole,
          company: interview.targetCompany,
          targetSkill: interview.targetSkill,
          selectedSkills,
          selfAssessedLevel: interview.selfAssessedLevel,
          roleSkills,
          resumeContext,
        },
      );

      const updatedInterview = await prisma.interview.update({
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

      score = updatedInterview.score;
      feedback = updatedInterview.feedback;
      status = updatedInterview.status;

      res.json({
        score,
        feedback,
        status,
        evaluation: result,
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
      return;
    }

    res.json({
      score,
      feedback,
      status,
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
