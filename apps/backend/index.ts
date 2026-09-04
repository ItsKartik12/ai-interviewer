import "dotenv/config";
import express from "express";
import { PreInterviewBody } from "./types";
import cors from "cors";
import { calculateResult } from "./result";
import { getFrontendUrl, getPort, logServiceConfiguration } from "./config/env.ts";
import { healthRouter } from "./routes/health.ts";
import { authRateLimit, globalRateLimit } from "./middleware/rateLimit.ts";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.ts";

const app = express();
app.use(express.json());
app.use(express.text({ type: ["application/sdp", "text/plain"] }));
app.use(
  cors({
    origin: getFrontendUrl(),
    credentials: true,
  }),
);
app.use(globalRateLimit);
app.use(healthRouter);

app.get("/api/v1/me", authRateLimit, requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    uid: req.user?.uid,
    email: req.user?.email ?? null,
    name: req.user?.name ?? null,
  });
});

app.post("/api/v1/pre-interview", async (req, res) => { 
    const { success, data } = PreInterviewBody.safeParse(req.body) ;

    if (!success) {
        res.status(411).json({
            message: "Incorrect body"
        });
        return 
    }

    // TODO: URL can be very malformed, probably use an SLM here?
    const githubUrl = data.github.endsWith("/") ? data.github.slice(0, -1) : data.github;

    const githubUsername = githubUrl.split("/").pop()!;
    const { scrapeGithub } = await import("./scrapers/github.ts");

    const githubData = await scrapeGithub(githubUsername);
    const { prisma } = await import("./db.ts");

    const interview = await prisma.interview.create({
        data: {
            githubMetadata: JSON.stringify(githubData),
            status: "Pre"
        }
    })

    res.json({ id: interview.id });
})

app.post("/api/v1/session/:interviewId", async (req, res) => {
    
    const sessionConfig = JSON.stringify({
        type: "realtime",
        model: "gpt-realtime",
        audio: { output: { voice: "marin" } },
    });

    const fd = new FormData();
    fd.set("sdp", req.body);
    fd.set("session", sessionConfig);
  
    try {
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_KEY}`,
          "OpenAI-Safety-Identifier": "hashed-user-id",
        },
        body: fd,
      });

      const location = sdpResponse.headers.get("Location");
      const callId = location?.split("/").pop()!;
      console.log(callId);
      // Send back the SDP we received from the OpenAI REST API
      const sdp = await sdpResponse.text();
      res.send(sdp);

      const { initSideband } = await import("./sideband.ts");
      initSideband(callId, req.params.interviewId);
    } catch (error) {
      console.error("Token generation error:", error);
      res.status(500).json({ error: "Failed to generate token" });
    }

});

app.post("/api/v1/session/user/response/:interviewId", async (req, res) => {
  const { message } = req.body;
  const { prisma } = await import("./db.ts");
  await prisma.message.create({
    data: {
        interviewId: req.params.interviewId!,
        type: "User",
        message: message
    }
  });

  res.json({message: "Message saved"});
})

app.get("/api/v1/result/:interviewId", async (req, res) => {
  const { prisma } = await import("./db.ts");
  const interview = await prisma.interview.findFirst({
    where: {
      id: req.params.interviewId
    },
    include: {
      conversations: true
    }
  })

  if (!interview) {
    res.status(411).json({
      message: "Interview not found"
    })
    return 
  }

  res.json({
    score: interview?.score,
    feedback: interview?.feedback,
    transcript: interview?.conversations.map(c => ({
      type: c.type,
      content: c.message,
      createdAt: c.createdAt
    })),
    status: interview.status
  })

  // TODO: Should add some sort of a lock here.
  if (interview.status != "Done") {
    const result = await calculateResult(interview.conversations)

    await prisma.interview.update({
      where: {
        id: req.params.interviewId
      },
      data: {
        status: "Done",
        feedback: result.feedback,
        score: result.score
      }
    })
  }
})

const port = getPort();
logServiceConfiguration();
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
