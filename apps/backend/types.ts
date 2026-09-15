import z from "zod";

export const PreInterviewBody = z.object({
  // GitHub URL is optional
  github: z.string().trim().optional().default(""),
  // Primary skill or selected skills from Step 2
  skill: z.string().trim().optional().default(""),
  selectedSkills: z.array(z.string().trim()).optional().default([]),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  company: z.string().trim().min(1, "Target company is required"),
  role: z.string().trim().min(1, "Target role is required"),
  roleSkills: z.any().optional(),
  // Candidate resume (structured context or extracted text)
  resumeText: z.string().trim().optional().default(""),
  resumeContext: z.any().optional(),
});


