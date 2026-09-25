/**
 * Tech-only role catalog, organized by career track.
 *
 * These role names are sent to the existing AI role-analysis pipeline
 * (`/analyze-role` → `generateRoleSkills`), which generates role-specific
 * skills and questions dynamically. The catalog only constrains what the
 * candidate can pick — it does NOT hardcode question banks.
 */
export type TechRoleCategory = {
  category: string;
  roles: string[];
};

export const TECH_ROLE_CATEGORIES: TechRoleCategory[] = [
  {
    category: "Software Development",
    roles: [
      "Software Engineer",
      "Full Stack Developer",
      "Frontend Developer",
      "Backend Developer",
      "Mobile Developer",
      "Game Developer",
      "Blockchain/Web3 Developer",
      "Embedded Systems Engineer",
      "IoT Engineer",
    ],
  },
  {
    category: "AI & Data",
    roles: [
      "AI/ML Engineer",
      "Generative AI Engineer",
      "Data Scientist",
      "Data Engineer",
      "NLP Engineer",
      "Computer Vision Engineer",
    ],
  },
  {
    category: "DevOps & Infrastructure",
    roles: [
      "DevOps Engineer",
      "Cloud Engineer",
      "Site Reliability Engineer",
      "Systems Engineer",
    ],
  },
  {
    category: "Security",
    roles: [
      "Cybersecurity Engineer",
      "Security Analyst",
      "Application Security Engineer",
      "SOC Analyst",
    ],
  },
  {
    category: "Quality",
    roles: ["QA/Automation Engineer"],
  },
];
