import "dotenv/config";
import express from "express";
import { PreInterviewBody } from "./types";
import cors from "cors";
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

app.use(express.json());
app.use(express.text({ type: ["application/sdp", "text/plain"] }));

// Dynamic CORS configuration supporting local development and VS Code tunnels
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
// PRE-INTERVIEW
// --------------------------------------------------

app.post("/api/v1/pre-interview", async (req, res) => {
  const { success, data } = PreInterviewBody.safeParse(req.body);

  if (!success) {
    res.status(411).json({
      message: "Incorrect body",
    });
    return;
  }

  const githubUrl = data.github.endsWith("/")
    ? data.github.slice(0, -1)
    : data.github;

  const githubUsername = githubUrl.split("/").pop()!;

  const { scrapeGithub } = await import("./scrapers/github.ts");

  const githubData = await scrapeGithub(githubUsername);

  const { prisma } = await import("./db.ts");

  // Temporary local user for development
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

  res.json({ id: interview.id });
});

// --------------------------------------------------
// DEEPGRAM SHORT-LIVED TOKEN
// --------------------------------------------------

app.post("/api/v1/deepgram-token", async (_req, res) => {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      console.error("DEEPGRAM_API_KEY is missing");
      res.status(500).json({
        error: "Deepgram API key is not configured",
      });
      return;
    }

    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
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
// OPENAI REALTIME SESSION
// --------------------------------------------------

app.post("/api/v1/session/:interviewId", async (req, res) => {
  const sessionConfig = JSON.stringify({
    type: "realtime",
    model: "gpt-realtime",
    audio: {
      output: {
        voice: "marin",
      },
    },
  });

  const fd = new FormData();

  fd.set("sdp", req.body);
  fd.set("session", sessionConfig);

  try {
    const sdpResponse = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_KEY}`,
          "OpenAI-Safety-Identifier": "hashed-user-id",
        },
        body: fd,
      },
    );

    const location = sdpResponse.headers.get("Location");
    const callId = location?.split("/").pop()!;

    console.log(callId);

    const sdp = await sdpResponse.text();

    res.send(sdp);

    const { initSideband } = await import("./sideband.ts");

    initSideband(callId, req.params.interviewId);
  } catch (error) {
    console.error("Token generation error:", error);

    res.status(500).json({
      error: "Failed to generate token",
    });
  }
});

// --------------------------------------------------
// SAVE USER RESPONSE
// --------------------------------------------------

app.post("/api/v1/session/user/response/:interviewId", async (req, res) => {
  const { message } = req.body;

  const { prisma } = await import("./db.ts");

  await prisma.message.create({
    data: {
      interviewId: req.params.interviewId!,
      type: "User",
      message: message,
    },
  });

  res.json({
    message: "Message saved",
  });
});

// --------------------------------------------------
// INTERVIEW RESULT
// --------------------------------------------------

app.get("/api/v1/result/:interviewId", async (req, res) => {
  const { prisma } = await import("./db.ts");

  const interview = await prisma.interview.findFirst({
    where: {
      id: req.params.interviewId,
    },
    include: {
      conversations: true,
    },
  });

  if (!interview) {
    res.status(411).json({
      message: "Interview not found",
    });

    return;
  }

  res.json({
    score: interview.score,
    feedback: interview.feedback,

    transcript: interview.conversations.map((c) => ({
      type: c.type,
      content: c.message,
      createdAt: c.createdAt,
    })),

    status: interview.status,
  });

  if (interview.status != "Done") {
    const result = await calculateResult(interview.conversations);

    await prisma.interview.update({
      where: {
        id: req.params.interviewId,
      },
      data: {
        status: "Done",
        feedback: result.feedback,
        score: result.score,
      },
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
