const OMNIROUTE_URL = process.env.OMNIROUTE_URL || "http://localhost:20128";

const OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY;

const OMNIROUTE_MODEL = process.env.OMNIROUTE_MODEL || "oc/big-pickle";

type OmniRouteResponse = {
  error?: { message?: string };
  choices?: { message?: { content?: unknown } }[];
};

export async function askOmniRoute(
  messages: {
    role: "system" | "user" | "assistant";
    content: string;
  }[],
): Promise<string> {
  if (!OMNIROUTE_API_KEY) {
    throw new Error("OMNIROUTE_API_KEY is not configured");
  }

  const endpoint = `${OMNIROUTE_URL.replace(/\/$/, "")}/v1/chat/completions`;
  const requestBody = {
    model: OMNIROUTE_MODEL,
    messages,
    temperature: 0.7,
  };

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OMNIROUTE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    console.error("OmniRoute request failed", {
      endpoint,
      model: OMNIROUTE_MODEL,
      failureType: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("OmniRoute is unavailable");
  }

  const responseText = await response.text();
  let data: OmniRouteResponse;

  try {
    data = JSON.parse(responseText) as OmniRouteResponse;
  } catch {
    data = {};
  }

  if (!response.ok) {
    console.error("OmniRoute error", {
      status: response.status,
      endpoint,
      model: OMNIROUTE_MODEL,
      responseBody: responseText.slice(0, 4000),
    });

    throw new Error(
      data.error?.message || `OmniRoute request failed (${response.status})`,
    );
  }

  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("OmniRoute returned an invalid response");
  }

  return content;
}
