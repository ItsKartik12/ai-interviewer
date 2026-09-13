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

  const response = await fetch(`${OMNIROUTE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OMNIROUTE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OMNIROUTE_MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  const data = (await response.json()) as OmniRouteResponse;

  if (!response.ok) {
    console.error("OmniRoute error:", data);

    throw new Error(data?.error?.message || "OmniRoute request failed");
  }

  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("OmniRoute returned an invalid response");
  }

  return content;
}
