import z from "zod";

export const PreInterviewBody = z
  .object({
    // GitHub URL is optional
    github: z.string().trim().optional().default(""),
    // Primary skill or selected skills from Step 2
    skill: z.string().trim().optional().default(""),
    selectedSkills: z.array(z.string().trim()).optional().default([]),
    // Soft skills the candidate explicitly chose to be assessed (from the
    // AI recommendation step). Empty means no specific soft-skill focus.
    selectedSoftSkills: z.array(z.string().trim()).optional().default([]),
    skills: z.array(z.string().trim()).optional(),
    level: z.preprocess((val) => {
      if (typeof val === "string") {
        const lower = val.trim().toLowerCase();
        if (lower === "beginner") return "Beginner";
        if (lower === "intermediate") return "Intermediate";
        if (lower === "advanced") return "Advanced";
      }
      return val;
    }, z.enum(["Beginner", "Intermediate", "Advanced"])),
    company: z.string().trim().min(1, "Target company is required"),
    role: z.string().trim().min(1, "Target role is required"),
    difficulty: z.string().trim().optional(),
    roleSkills: z.any().optional(),
    // Candidate resume (structured context or extracted text)
    resumeText: z.string().trim().optional().default(""),
    resumeContext: z.any().optional(),
  })
  .transform((data) => {
    const selectedSkills =
      data.selectedSkills && data.selectedSkills.length > 0
        ? data.selectedSkills
        : data.skills || [];
    return {
      ...data,
      selectedSkills,
    };
  });


