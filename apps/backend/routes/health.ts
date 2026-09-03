import { Router } from "express";
import { isFirebaseConfigured, isGeminiConfigured } from "../config/env.ts";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    services: {
      firebase: isFirebaseConfigured() ? "configured" : "missing",
      gemini: isGeminiConfigured() ? "configured" : "missing",
    },
  });
});
