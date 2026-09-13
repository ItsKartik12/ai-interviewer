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
  generateRoleSkills,
  parseInterviewDecision,
  questionCount,
} from "./interview-prompts.ts";

const app = express();

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(express.json());

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

    const githubUrl = data.github.endsWith("/")
      ? data.github.slice(0, -1)
      : data.github;

    const githubUsername = githubUrl.split("/").pop();

    if (!githubUsername) {
      res.status(400).json({
        error: "Invalid GitHub URL",
      });
      return;
    }

    const { scrapeGithub } = await import("./scrapers/github.ts");

    const githubData = await scrapeGithub(githubUsername);

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

    // Ensure role skills are determined and attached
    let roleSkills = data.roleSkills;
    if (!roleSkills || !Array.isArray(roleSkills.technicalSkills) || roleSkills.technicalSkills.length === 0) {
      roleSkills = await generateRoleSkills({
        role: data.role,
        company: data.company,
        level: data.level,
        targetSkill: data.skill,
      });
    }

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
        githubMetadata: githubData,
        jobDescription: JSON.stringify(roleSkills),
        status: "Pre",
      },
    });

    console.log("Interview created:", interview.id);

    res.json({
      id: interview.id,
      roleSkills,
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

    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ttl_seconds: 600,
      }),
    });

    const data = (await response.json()) as {
      access_token?: unknown;
    };

    if (!response.ok) {
      console.error("Deepgram token error:", data);

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
  } catch (error) {
    console.error("Deepgram token error:", error);

    res.status(500).json({
      error: "Failed to generate Deepgram token",
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
          questionCount: 0,
          coveredTopics: [],
          durationMinutes: interview.duration,
          previousQuestions: [],
        }),
      },
      {
        role: "user",
        content: buildTurnInstruction({
          messages: [],
          firstTurn: true,
          targetRole: interview.targetRole ?? undefined,
          targetCompany: interview.targetCompany ?? undefined,
        }),
      },
    ]);

    if (!aiResponse) {
      throw new Error("OmniRoute returned an empty response");
    }

    const decision = parseInterviewDecision(aiResponse, interview.difficulty);

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
          questionCount: questionCount(interview.conversations),
          coveredTopics: coveredTopics(interview.conversations),
          durationMinutes: interview.duration,
          previousQuestions: interview.conversations
            .filter((item) => item.type === "Assistant")
            .map((item) => item.message),
        }),
      },
      {
        role: "user",
        content: buildTurnInstruction({
          messages: interview.conversations,
          latestAnswer: message,
        }),
      },
    ]);

    if (!aiResponse) {
      throw new Error("OmniRoute returned an empty response");
    }

    const decision = parseInterviewDecision(aiResponse, interview.difficulty);

    // Save AI response
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
        difficulty: decision.difficulty,
      },
    });

    res.json({
      message: decision.question,
      difficulty: decision.difficulty,
      topic: decision.topic,
      followUp: decision.followUp,
      finished: decision.finished,
      questionType: decision.questionType,
      skillAssessed: decision.skillAssessed,
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

    let roleSkills = null;
    if (interview.jobDescription) {
      try {
        roleSkills = JSON.parse(interview.jobDescription);
      } catch {
        roleSkills = null;
      }
    }

    if (interview.status !== "Done") {
      const result = await calculateResult(
        interview.conversations,
        interview.githubMetadata,
        {
          role: interview.targetRole,
          company: interview.targetCompany,
          targetSkill: interview.targetSkill,
          selfAssessedLevel: interview.selfAssessedLevel,
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
