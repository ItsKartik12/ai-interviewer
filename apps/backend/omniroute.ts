const OMNIROUTE_URL = process.env.OMNIROUTE_URL || "http://localhost:20128";
const OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY;
const OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL || "oc/big-pickle";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const DEFAULT_OMNI_TIMEOUT_MS = 8_000;
const GEMINI_TIMEOUT_MS = 15_000;

export type OmniRouteResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
  choices?: {
    message?: {
      content?: unknown;
    };
  }[];
};

export type MessageItem = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AskAiOptions = {
  forceProvider?: "omniroute" | "gemini";
  omniTimeoutMs?: number;
  omniUrl?: string;
  omniModel?: string;
};

/**
 * Safely read an API key from the environment.
 */
function getOmniRouteKey(): string | undefined {
  const key = process.env.OMNIROUTE_API_KEY || OMNIROUTE_API_KEY;
  if (!key) return undefined;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Safely read Gemini API key from the environment.
 */
function getGeminiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  if (!key) return undefined;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Direct Google Gemini execution.
 *
 * Used as safe default or automatic fallback when OmniRoute is unavailable,
 * returns an error (401, 403, 429, 5xx), or times out.
 */
export async function callGeminiDirect(messages: MessageItem[]): Promise<string> {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured for Gemini fallback.");
  }

  const systemMessage = messages.find((m) => m.role === "system")?.content;
  const conversationTurns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  /* Gemini requires at least one user turn. */
  if (conversationTurns.length === 0) {
    conversationTurns.push({
      role: "user",
      parts: [{ text: systemMessage || "Please begin the technical interview." }],
    });
  }

  const requestBody: Record<string, unknown> = {
    contents: conversationTurns,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  if (systemMessage) {
    requestBody.systemInstruction = {
      parts: [{ text: systemMessage }],
    };
  }

  /* Candidate models in order of responsiveness & quota stability */
  const candidateModels = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
  ];

  let lastError: unknown = null;

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, GEMINI_TIMEOUT_MS);

    try {
      console.log(`[ai-router] Trying Gemini model: ${model}`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        data = {};
      }

      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === "string" && text.trim().length > 0) {
          console.log(`[ai-router] Gemini response received using ${model}`);
          return text.trim();
        }
      }

      const errorMessage = data?.error?.message || `Gemini HTTP ${response.status}`;
      lastError = new Error(errorMessage);
      console.warn(`[ai-router] Gemini ${model} failed: ${errorMessage}`);
    } catch (error: any) {
      lastError = error;
      const isTimeout = error?.name === "AbortError";
      console.warn(
        `[ai-router] Gemini ${model} ${
          isTimeout
            ? `timed out after ${GEMINI_TIMEOUT_MS / 1000}s`
            : `failed: ${error?.message || String(error)}`
        }`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("All Gemini fallback models failed.");
}

/**
 * Execute a chat completion through OmniRoute.
 */
async function callOmniRouteInternal(
  messages: MessageItem[],
  options?: AskAiOptions,
): Promise<string> {
  const omniKey = getOmniRouteKey();
  if (!omniKey) {
    throw new Error("OMNIROUTE_API_KEY is missing or empty.");
  }

  const omniUrl = options?.omniUrl || process.env.OMNIROUTE_URL || OMNIROUTE_URL;
  const omniModel = options?.omniModel || process.env.OMNIROUTE_MODEL || OMNIROUTE_MODEL;
  const timeoutMs = options?.omniTimeoutMs ?? DEFAULT_OMNI_TIMEOUT_MS;

  console.log("[ai-router] Calling OmniRoute:", {
    url: omniUrl,
    model: omniModel,
    timeoutMs,
    hasApiKey: Boolean(omniKey),
    apiKeyLength: omniKey.length,
  });

  const endpoint = `${omniUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const requestBody = {
    model: omniModel,
    messages,
    temperature: 0.7,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${omniKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let data: OmniRouteResponse = {};
    try {
      data = JSON.parse(responseText) as OmniRouteResponse;
    } catch {
      data = {};
    }

    if (response.ok) {
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        console.log("[ai-router] OmniRoute response received successfully.");
        return content.trim();
      }
      throw new Error("OmniRoute returned HTTP 200 but response content was empty.");
    }

    const errorMessage =
      data.error?.message || responseText.slice(0, 200) || `HTTP ${response.status}`;
    const err: any = new Error(`OmniRoute returned HTTP ${response.status}: ${errorMessage}`);
    err.status = response.status;
    err.details = data.error;
    throw err;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const timeoutErr: any = new Error(`OmniRoute request timed out after ${timeoutMs / 1000}s`);
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main AI request function.
 *
 * Supports OmniRoute and Google Gemini.
 * OmniRoute 401, 403, 429, 5xx, timeouts, or network failures NEVER
 * terminate the interview if GEMINI_API_KEY is available.
 */
export async function askOmniRoute(
  messages: MessageItem[],
  options?: AskAiOptions,
): Promise<string> {
  const configuredProvider = (
    options?.forceProvider ||
    process.env.AI_PROVIDER ||
    "omniroute"
  ).toLowerCase().trim();

  const omniKey = getOmniRouteKey();
  const geminiKey = getGeminiKey();

  /* ---------------------------------------------------------
   * Scenario A: Gemini explicitly configured as primary
   * --------------------------------------------------------- */
  if (configuredProvider === "gemini") {
    if (geminiKey) {
      try {
        return await callGeminiDirect(messages);
      } catch (geminiError: any) {
        console.warn("[ai-router] Primary Gemini request failed:", geminiError?.message || geminiError);
        if (omniKey) {
          console.warn("[ai-router] Attempting secondary OmniRoute fallback...");
          try {
            return await callOmniRouteInternal(messages, options);
          } catch (omniError: any) {
            throw new Error(`Both Gemini and OmniRoute failed. Gemini: ${geminiError?.message}; OmniRoute: ${omniError?.message}`);
          }
        }
        throw geminiError;
      }
    }
  }

  /* ---------------------------------------------------------
   * Scenario B: OmniRoute as primary (default) with Gemini fallback
   * --------------------------------------------------------- */
  if (omniKey) {
    try {
      return await callOmniRouteInternal(messages, options);
    } catch (omniError: any) {
      console.warn(`[ai-router] OmniRoute failed: ${omniError?.message || String(omniError)}`);

      if (geminiKey) {
        console.warn("[ai-router] Immediately falling back to direct Gemini...");
        try {
          return await callGeminiDirect(messages);
        } catch (geminiError: any) {
          console.error("[ai-router] Gemini fallback also failed:", geminiError);
          throw new Error(
            `Both OmniRoute and Gemini failed. OmniRoute: ${omniError?.message}; Gemini: ${geminiError?.message}`
          );
        }
      }

      throw new Error(
        `OmniRoute failed (${omniError?.message}) and GEMINI_API_KEY is not configured.`
      );
    }
  }

  /* ---------------------------------------------------------
   * Scenario C: OmniRoute not configured -> Direct Gemini
   * --------------------------------------------------------- */
  if (geminiKey) {
    console.warn("[ai-router] OMNIROUTE_API_KEY missing. Using Gemini direct.");
    return await callGeminiDirect(messages);
  }

  throw new Error(
    "No working AI service configured. Please provide a valid OMNIROUTE_API_KEY or GEMINI_API_KEY."
  );
}