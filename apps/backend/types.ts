import z from "zod";

export const PreInterviewBody = z.object({
  github: z.string().trim().min(1, "GitHub URL is required"),
  skill: z.string().trim().min(1, "Skill is required"),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  company: z.string().trim().min(1, "Target company is required"),
  role: z.string().trim().min(1, "Target role is required"),
});
