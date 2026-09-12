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
// CREATE PRE-INTERVIEW
// --------------------------------------------------

app.post("/api/v1/pre-interview", async (req, res) => {
  try {
    const { success, data } = PreInterviewBody.safeParse(req.body);

    if (!success) {
      res.status(400).json({
        error: "Incorrect request body",
      });
      return;
    }

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

    const interview = await prisma.interview.create({
      data: {
        userId: user.uid,
        type: "Technical",
        role: "Software Developer",
        difficulty: "Intermediate",
        duration: 30,
        githubMetadata: githubData,
        status: "Pre",
      },
    });

    console.log("Interview created:", interview.id);

    res.json({
      id: interview.id,
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
        ttl_seconds: 60,
      }),
    });

    const data = await response.json();

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
      });

      return;
    }

    const githubContext =
      interview.githubMetadata && typeof interview.githubMetadata === "object"
        ? JSON.stringify(interview.githubMetadata)
        : "No GitHub information available.";

    const aiResponse = await askOmniRoute([
      {
        role: "system",
        content:
          "You are a professional technical interviewer. " +
          "You are conducting a realistic software developer interview. " +
          "Ask one question at a time. " +
          "Keep your response concise. " +
          "Start the interview naturally. " +
          "Use the candidate's GitHub information when useful. " +
          "Do not provide answers to questions. " +
          "The interview should test practical software development knowledge.\n\n" +
          "Candidate GitHub information:\n" +
          githubContext,
      },
      {
        role: "user",
        content:
          "Start the technical interview. " +
          "Ask the candidate the first appropriate question.",
      },
    ]);

    if (!aiResponse) {
      throw new Error("OmniRoute returned an empty response");
    }

    await prisma.message.create({
      data: {
        interviewId: interview.id,
        type: "Assistant",
        message: aiResponse,
      },
    });

    res.json({
      message: aiResponse,
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

    const githubContext =
      interview.githubMetadata && typeof interview.githubMetadata === "object"
        ? JSON.stringify(interview.githubMetadata)
        : "No GitHub information available.";

    // Ask OmniRoute
    const aiResponse = await askOmniRoute([
      {
        role: "system",
        content:
          "You are a professional technical interviewer. " +
          "Conduct a realistic software developer interview. " +
          "Ask one question at a time. " +
          "Keep questions concise. " +
          "Do not give the candidate the answer. " +
          "Adapt difficulty based on the candidate's responses. " +
          "Ask follow-up questions when appropriate. " +
          "Focus on software development, programming, " +
          "data structures, algorithms, web development, " +
          "databases, APIs and practical engineering concepts " +
          "when relevant.\n\n" +
          "Candidate GitHub information:\n" +
          githubContext,
      },
      ...conversation,
    ]);

    if (!aiResponse) {
      throw new Error("OmniRoute returned an empty response");
    }

    // Save AI response
    await prisma.message.create({
      data: {
        interviewId: interview.id,
        type: "Assistant",
        message: aiResponse,
      },
    });

    res.json({
      message: aiResponse,
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

    if (interview.status !== "Done") {
      const result = await calculateResult(interview.conversations);

      const updatedInterview = await prisma.interview.update({
        where: {
          id: interview.id,
        },
        data: {
          status: "Done",
          feedback: result.feedback,
          score: result.score,
        },
      });

      score = updatedInterview.score;
      feedback = updatedInterview.feedback;
      status = updatedInterview.status;
    }

    res.json({
      score,
      feedback,
      status,

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
