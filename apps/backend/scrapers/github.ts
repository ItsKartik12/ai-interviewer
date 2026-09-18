import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

export type ScrapedRepo = {
  name: string;
  fullName: string;
  description: string;
  primaryLanguage: string;
  topics: string[];
  starCount: number;
  isFork: boolean;
  updatedAt: string;
};

export type StructuredGithubContext = {
  username: string;
  status: "ok" | "not_found" | "rate_limited" | "empty" | "error";
  totalPublicRepos: number;
  totalStars: number;
  topLanguages: string[];
  highlightProjects: ScrapedRepo[];
  summary: string;
};

/**
 * Sanitizes untrusted user-controlled text from GitHub (descriptions, topics)
 * to prevent prompt injection or format breakage.
 */
function sanitizeText(text: unknown, maxLength = 200): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[^\x20-\x7E\n]/g, " ") // retain printable ASCII
    .replace(/(?:system:|assistant:|human:|instruction:|ignore all previous)/gi, "") // prompt injection defenses
    .replace(/```/g, "'''") // avoid closing code blocks prematurely
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function scrapeGithub(
  rawUsername: string,
): Promise<StructuredGithubContext> {
  const username = rawUsername.trim().replace(/^@/, "");

  // Safe fallback if username is invalid
  if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    return {
      username: username || "unknown",
      status: "not_found",
      totalPublicRepos: 0,
      totalStars: 0,
      topLanguages: [],
      highlightProjects: [],
      summary: "Invalid or missing GitHub username. Ground questions in candidate self-assessment and direct questions.",
    };
  }

  const proxyUrl = process.env.PROXY_URL;
  const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  const token = process.env.GITHUB_TOKEN;

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "AI-Interviewer-Bot/1.0",
    };

    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const response = await axios.get(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=30&sort=updated`,
      {
        headers,
        timeout: 5000,
        ...(httpsAgent ? { httpsAgent } : {}),
      },
    );

    const rawRepos = Array.isArray(response.data) ? response.data : [];

    if (rawRepos.length === 0) {
      return {
        username,
        status: "empty",
        totalPublicRepos: 0,
        totalStars: 0,
        topLanguages: [],
        highlightProjects: [],
        summary: `GitHub user @${username} has no public repositories. Interviewer should ask candidate directly about their practical projects.`,
      };
    }

    // Process and sanitize repos
    const parsedRepos: ScrapedRepo[] = rawRepos.map((repo: any) => ({
      name: sanitizeText(repo.name, 50),
      fullName: sanitizeText(repo.full_name, 80),
      description: sanitizeText(repo.description, 200),
      primaryLanguage: sanitizeText(repo.language, 30),
      topics: Array.isArray(repo.topics)
        ? repo.topics.map((t: any) => sanitizeText(t, 25)).filter(Boolean).slice(0, 5)
        : [],
      starCount: typeof repo.stargazers_count === "number" ? repo.stargazers_count : 0,
      isFork: Boolean(repo.fork),
      updatedAt: typeof repo.updated_at === "string" ? repo.updated_at.slice(0, 10) : "",
    }));

    // Prioritize original repositories with stars or recent activity
    const originalRepos = parsedRepos.filter((r) => !r.isFork);
    const reposToConsider = originalRepos.length >= 2 ? originalRepos : parsedRepos;

    reposToConsider.sort((a, b) => b.starCount - a.starCount || (b.updatedAt > a.updatedAt ? 1 : -1));
    const highlightProjects = reposToConsider.slice(0, 5);

    // Aggregate top languages
    const languageCounts: Record<string, number> = {};
    let totalStars = 0;

    for (const repo of parsedRepos) {
      totalStars += repo.starCount;
      if (repo.primaryLanguage) {
        languageCounts[repo.primaryLanguage] = (languageCounts[repo.primaryLanguage] || 0) + 1;
      }
    }

    const topLanguages = Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang)
      .slice(0, 4);

    const highlightsText = highlightProjects
      .map((p) => `"${p.name}" (${p.primaryLanguage || "unspecified"}${p.description ? `: ${p.description}` : ""})`)
      .join(", ");

    const summary = `Public GitHub profile for @${username}: ${rawRepos.length} repos. Primary languages: ${
      topLanguages.join(", ") || "None specified"
    }. Key projects: ${highlightsText || "None"}. Remember to probe whether candidate authored the architecture rather than assuming library presence proves mastery.`;

    return {
      username,
      status: "ok",
      totalPublicRepos: rawRepos.length,
      totalStars,
      topLanguages,
      highlightProjects,
      summary,
    };
  } catch (error: any) {
    const status = error?.response?.status;
    console.warn(`[github-scraper] Failed for @${username} (status: ${status || "network_error"}): ${error?.message}`);

    if (status === 404) {
      return {
        username,
        status: "not_found",
        totalPublicRepos: 0,
        totalStars: 0,
        topLanguages: [],
        highlightProjects: [],
        summary: `GitHub user @${username} was not found (404). Ground interview in stated skills and ask the candidate to describe a recent project verbally.`,
      };
    }

    if (status === 403) {
      return {
        username,
        status: "rate_limited",
        totalPublicRepos: 0,
        totalStars: 0,
        topLanguages: [],
        highlightProjects: [],
        summary: `GitHub API rate limit reached. Candidate claims profile @${username}. Ask the candidate directly to walk through their most prominent project.`,
      };
    }

    return {
      username,
      status: "error",
      totalPublicRepos: 0,
      totalStars: 0,
      topLanguages: [],
      highlightProjects: [],
      summary: `Unable to access GitHub metadata for @${username}. Interviewer will proceed by asking the candidate to describe their practical projects.`,
    };
  }
}