import { Router, type Request, type Response, type NextFunction } from "express";
import z from "zod";
import { prisma } from "../db.ts";
import { generateRoleSkills } from "../interview-prompts.ts";
import { scrapeGithub } from "../scrapers/github.ts";
import { calculateResult } from "../result.ts";

export const integrationRouter = Router();

/**
 * Optional shared secret verification for platform-to-platform calls
 * (e.g. from InternSetu). If INTEGRATION_SECRET is set, requests must
 * supply matching 'x-integration-secret' or 'authorization: Bearer <secret>'.
 */
function requireIntegrationAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INTEGRATION_SECRET;
  if (!secret) {
    // In local development or when unconfigured, allow requests
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const customHeader = req.headers["x-integration-secret"];

  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const provided = customHeader || bearerToken;

  if (provided === secret) {
    next();
    return;
  }

  res.status(401).json({
    error: "Unauthorized integration request",
    message: "Missing or invalid integration authentication credentials.",
  });
}

const IntegrationSessionBody = z.object({
  candidateId: z.string().trim().min(1, "Candidate ID is required"),
  candidateName: z.string().trim().optional(),
  candidateEmail: z.string().trim().email().optional(),
  githubUrl: z.string().trim().optional(),
  targetRole: z.string().trim().min(1, "Target role is required"),
  targetCompany: z.string().trim().optional(),
  skills: z.array(z.string().trim()).min(1, "At least one skill is required"),
  selfAssessedLevel: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Intermediate"),
  resumeContext: z.string().trim().optional(),
  durationMinutes: z.number().int().min(5).max(60).default(30),
  callbackUrl: z.string().trim().url().optional(),
});

/**
 * Provision an interview session directly from an external platform (InternSetu).
 * Does not require internal user login.
 */
integrationRouter.post(
  "/api/v1/integration/session",
  requireIntegrationAuth,
  async (req: Request, res: Response) => {
    try {
      const parsed = IntegrationSessionBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid integration session request payload",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const data = parsed.data;

      // Upsert candidate UserProfile based on candidateId from parent platform
      const user = await prisma.userProfile.upsert({
        where: { uid: data.candidateId },
        update: {
          name: data.candidateName || undefined,
          targetRole: data.targetRole,
          skills: data.skills,
          experienceLevel: data.selfAssessedLevel.toLowerCase(),
          bio: data.resumeContext || undefined,
        },
        create: {
          uid: data.candidateId,
          email: data.candidateEmail || `${data.candidateId}@internsetu.platform`,
          name: data.candidateName || "Candidate",
          targetRole: data.targetRole,
          skills: data.skills,
          experienceLevel: data.selfAssessedLevel.toLowerCase(),
          bio: data.resumeContext || undefined,
        },
      });

      // Extract GitHub context if provided
      let githubMetadata = null;
      if (data.githubUrl) {
        const cleanUrl = data.githubUrl.endsWith("/") ? data.githubUrl.slice(0, -1) : data.githubUrl;
        const username = cleanUrl.split("/").pop();
        if (username) {
          githubMetadata = await scrapeGithub(username);
        }
      }

      // Generate or retrieve role competency requirements
      const primarySkill = data.skills[0] || "Software Engineering";
      const roleSkills = await generateRoleSkills({
        role: data.targetRole,
        company: data.targetCompany,
        level: data.selfAssessedLevel,
        targetSkill: primarySkill,
        githubMetadata,
        context: data.resumeContext,
      });

      // Create Interview record
      const interview = await prisma.interview.create({
        data: {
          userId: user.uid,
          type: "Technical",
          role: data.targetRole,
          difficulty: data.selfAssessedLevel,
          targetSkill: primarySkill,
          selfAssessedLevel: data.selfAssessedLevel,
          targetCompany: data.targetCompany || "Target Company",
          targetRole: data.targetRole,
          duration: data.durationMinutes,
          githubMetadata: githubMetadata ?? undefined,
          jobDescription: JSON.stringify(roleSkills),
          status: "Pre",
        },
      });

      console.info(`[integration] Provisioned interview ${interview.id} for candidate ${data.candidateId}`);

      res.status(201).json({
        interviewId: interview.id,
        interviewPath: `/interview/${interview.id}`,
        status: interview.status,
        roleSkills,
        targetRole: data.targetRole,
        targetCompany: data.targetCompany || "Target Company",
        candidateId: data.candidateId,
      });
    } catch (error) {
      console.error("[integration] Error provisioning interview:", error);
      res.status(500).json({
        error: "Failed to provision interview session for external platform",
      });
    }
  },
);

/**
 * Retrieve verified structured evaluation report for an interview session.
 * Used by InternSetu to update student applications or dashboard.
 */
integrationRouter.get(
  "/api/v1/integration/results/:interviewId",
  requireIntegrationAuth,
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.interviewId;
      const interviewId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!interviewId) {
        res.status(400).json({ error: "Missing interviewId parameter" });
        return;
      }

      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        include: { conversations: true },
      });

      if (!interview) {
        res.status(404).json({
          error: "Interview session not found",
        });
        return;
      }

      // If finished or requested after completion
      let evaluation = interview.evaluation as any;

      if (interview.status !== "Done" && interview.conversations.length > 2) {
        // Calculate result on-the-fly if candidate finished speaking
        evaluation = await calculateResult(
          interview.conversations,
          interview.githubMetadata,
          {
            role: interview.targetRole,
            company: interview.targetCompany,
            targetSkill: interview.targetSkill,
            selfAssessedLevel: interview.selfAssessedLevel,
          },
        );

        await prisma.interview.update({
          where: { id: interview.id },
          data: {
            status: "Done",
            score: evaluation.score,
            feedback: evaluation.overallFeedback,
            evaluation,
            strengthsList: evaluation.overallStrengths || evaluation.strengths || [],
            weaknessesList: evaluation.overallWeaknesses || evaluation.weaknesses || [],
            recommendations: evaluation.topicsToImprove || [],
            completedAt: new Date(),
          },
        });
      }

      res.json({
        interviewId: interview.id,
        candidateId: interview.userId,
        status: interview.status,
        score: interview.score ?? evaluation?.score ?? 0,
        demonstratedLevel: evaluation?.demonstratedLevel ?? "Intermediate",
        selfAssessedLevel: interview.selfAssessedLevel ?? "Intermediate",
        targetRole: interview.targetRole,
        targetCompany: interview.targetCompany,
        primarySkill: interview.targetSkill,
        overallFeedback: interview.feedback || evaluation?.overallFeedback || "",
        technicalSkills: evaluation?.technicalSkills || [],
        softSkills: evaluation?.softSkills || [],
        overallStrengths: interview.strengthsList.length > 0 ? interview.strengthsList : evaluation?.overallStrengths || [],
        overallWeaknesses: interview.weaknessesList.length > 0 ? interview.weaknessesList : evaluation?.overallWeaknesses || [],
        recommendations: interview.recommendations.length > 0 ? interview.recommendations : evaluation?.topicsToImprove || [],
        completedAt: interview.completedAt,
        turnsCount: interview.conversations.length,
      });
    } catch (error) {
      console.error("[integration] Error fetching results:", error);
      res.status(500).json({
        error: "Failed to retrieve interview results for external platform",
      });
    }
  },
);
