import { extractText } from "unpdf";
import { parseResumeText, type ResumeContext } from "../interview-prompts.ts";

export interface ParsedPdfResult {
  text: string;
  totalPages: number;
  resumeContext: ResumeContext;
}

/**
 * Sanitize candidate PDF text to prevent prompt injection and remove corrupted glyphs.
 */
export function sanitizePdfText(rawText: string): string {
  if (!rawText) return "";

  return rawText
    // Normalize newlines
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Remove control characters except tab and newline
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Neutralize typical prompt injection phrases in candidate document
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[removed prompt override]")
    .replace(/system\s*:\s*you\s+are/gi, "[removed directive]")
    .replace(/```/g, "'''")
    // Collapse excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse an uploaded PDF buffer ONCE and extract structured candidate context.
 */
export async function parsePdfDocument(
  data: Buffer | Uint8Array,
): Promise<ParsedPdfResult> {
  const binaryData = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (!binaryData || binaryData.length === 0) {
    throw new Error("Uploaded PDF is empty");
  }

  // Enforce reasonable limit: 10MB
  if (binaryData.length > 10 * 1024 * 1024) {
    throw new Error("Uploaded PDF exceeds maximum allowed size of 10MB");
  }

  let rawPagesText = "";
  let totalPages = 1;

  try {
    const extraction = await extractText(binaryData);
    totalPages = extraction.totalPages || 1;
    if (Array.isArray(extraction.text)) {
      rawPagesText = extraction.text.join("\n\n");
    } else if (typeof extraction.text === "string") {
      rawPagesText = extraction.text;
    }
  } catch (extractError) {
    console.warn("[pdf] unpdf extraction warning:", extractError);
    throw new Error("Unable to parse the PDF document. Please ensure it is a valid, readable PDF.");
  }

  const sanitized = sanitizePdfText(rawPagesText);

  if (!sanitized || sanitized.length < 20) {
    throw new Error("The uploaded PDF does not contain sufficient extractable text (it may be an image-only scan).");
  }

  // Structured extraction (runs once, cached for session)
  const resumeContext = await parseResumeText(sanitized);

  return {
    text: sanitized.slice(0, 4000),
    totalPages,
    resumeContext,
  };
}
