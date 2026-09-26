import { useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText, Loader2, UploadCloud, X } from "lucide-react";
import axios from "axios";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* PageShell — consistent solid page container                          */
/* ------------------------------------------------------------------ */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen w-full overflow-x-clip bg-background text-foreground flex flex-col">
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeading — eyebrow + title + description, consistent hierarchy */
/* ------------------------------------------------------------------ */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge — small status/label pill                                     */
/* ------------------------------------------------------------------ */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-muted/50 text-muted-foreground",
    primary: "border-primary/30 bg-primary/10 text-primary",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    danger: "border-destructive/30 bg-destructive/10 text-destructive",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* StatCard — compact stat tile with optional sparkline-scale emphasis  */
/* ------------------------------------------------------------------ */
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "primary",
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "primary" | "success" | "warning" | "neutral";
}) {
  const tones = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    warning: "text-amber-500 bg-amber-500/10",
    neutral: "text-muted-foreground bg-muted",
  } as const;
  return (
    <div className="hover-elevate rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={cn("grid size-7 place-items-center rounded-lg", tones[tone])}>
            <Icon className="size-3.5" />
          </span>
        )}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton — loading placeholder with pulse                           */
/* ------------------------------------------------------------------ */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-muted/70", className)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* FormSection — glass card with icon, title, optional badge, helper    */
/* ------------------------------------------------------------------ */
export function FormSection({
  icon: Icon,
  title,
  description,
  badge,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border p-5 shadow-sm transition-colors focus-within:border-primary/30 sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/10">
            <Icon className="size-4 text-primary" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {badge && <Badge tone="neutral">{badge}</Badge>}
          </div>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ResumeUploader — shared drag & drop PDF uploader backed by the       */
/* existing /api/v1/parse-pdf endpoint. Used by Profile Setup and the   */
/* per-interview form so parsing stays in one place.                    */
/* ------------------------------------------------------------------ */
export interface ParsedResumeContext {
  candidateName?: string;
  education?: string[];
  experience?: string[];
  projects?: string[];
  technologies?: string[];
  achievements?: string[];
  certifications?: string[];
}

export function ResumeUploader({
  fileName,
  parsedContext,
  disabled,
  onChange,
  className,
}: {
  fileName: string | null;
  parsedContext?: ParsedResumeContext | null;
  disabled?: boolean;
  onChange: (next: { fileName: string | null; context: ParsedResumeContext | null }) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateFile(file: File): string | null {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
      return "Only PDF files are accepted.";
    if (file.size === 0) return "The file is empty.";
    if (file.size > 10 * 1024 * 1024) return "File exceeds the 10 MB limit.";
    return null;
  }

  async function handleFile(file: File) {
    const err = validateFile(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setParsing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(((reader.result as string) ?? "").split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const response = await api.post("/api/v1/parse-pdf", {
        pdfBase64: base64,
        fileName: file.name,
      });
      onChange({
        fileName: file.name,
        context: (response.data?.resumeContext as ParsedResumeContext) ?? null,
      });
    } catch (e) {
      const message = axios.isAxiosError(e)
        ? (e.response?.data?.error ?? "Unable to parse PDF.")
        : "Unable to parse PDF.";
      setError(message);
    } finally {
      setParsing(false);
    }
  }

  const parsedSummary = parsedContext
    ? [
        parsedContext.technologies?.length
          ? `${parsedContext.technologies.length} technologies`
          : null,
        parsedContext.projects?.length ? `${parsedContext.projects.length} projects` : null,
        parsedContext.experience?.length
          ? `${parsedContext.experience.length} experience items`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className={cn("grid gap-2", className)}>
      {!fileName ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload resume PDF"
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => setIsDragOver(true)}
          onDragLeave={() => setIsDragOver(false)}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center transition-all",
            "hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            isDragOver && "border-primary bg-primary/10",
            (disabled || parsing) && "pointer-events-none opacity-50",
            error && "border-destructive/60 bg-destructive/5",
          )}
        >
          <UploadCloud className={cn("size-7", isDragOver ? "text-primary" : "text-muted-foreground")} />
          <div>
            <p className="text-sm font-medium">Drag & drop your resume here</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              or click to browse · PDF only · max 10 MB
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border p-3.5",
            error
              ? "border-destructive/60 bg-destructive/5"
              : parsing
                ? "border-border bg-muted/30"
                : "border-primary/25 bg-primary/[0.06]",
          )}
        >
          <FileText
            className={cn(
              "size-8 shrink-0",
              parsing ? "text-muted-foreground" : "text-primary",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {parsing
                ? "Parsing resume…"
                : parsedSummary
                  ? `Parsed: ${parsedSummary}`
                  : error
                    ? error
                    : "Ready — the AI will personalize interviews with this."}
            </p>
          </div>
          {parsing ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange({ fileName: null, context: null })}
                disabled={disabled}
                aria-label="Remove resume"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Resume PDF file input"
        disabled={disabled || parsing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      {error && !fileName && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ErrorState — consistent inline error with optional retry            */
/* ------------------------------------------------------------------ */
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
      <p className="text-sm font-semibold text-destructive">{title}</p>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
