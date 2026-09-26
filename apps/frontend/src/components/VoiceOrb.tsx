import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface VoiceOrbProps {
  /** Normalized volume level, 0..1 */
  level: number;
  /** Whether this participant is the active/loud speaker right now */
  speaking: boolean;
  label: string;
  sublabel: string;
  icon: LucideIcon;
  /** tailwind color family used for the accent, e.g. "violet" or "emerald" */
  accent: "violet" | "emerald";
}

const ACCENTS = {
  violet: {
    core: "bg-indigo-500",
    ring: "border-indigo-400/30",
    text: "text-indigo-600 dark:text-indigo-400",
    bars: "bg-indigo-500",
  },
  emerald: {
    core: "bg-emerald-500",
    ring: "border-emerald-400/30",
    text: "text-emerald-600 dark:text-emerald-400",
    bars: "bg-emerald-500",
  },
} as const;

export function VoiceOrb({
  level,
  speaking,
  label,
  sublabel,
  icon: Icon,
  accent,
}: VoiceOrbProps) {
  const a = ACCENTS[accent];
  const clamped = Math.min(1, Math.max(0, level));
  const scale = 1 + clamped * 0.35;
  const Icon_ = Icon;

  return (
    <div className="flex flex-col items-center gap-2 sm:gap-4 md:gap-5">
      <div className="relative grid size-28 sm:size-36 md:size-48 lg:size-52 place-items-center">
        {/* Outer reactive ring */}
        <div
          className={cn(
            "absolute inset-0 rounded-full border transition-opacity duration-150",
            a.ring,
          )}
          style={{
            transform: `scale(${1 + clamped * 0.2})`,
            opacity: 0.3 + clamped * 0.5,
          }}
        />
        {/* Secondary ring */}
        <div
          className={cn(
            "absolute size-20 sm:size-28 md:size-36 lg:size-40 rounded-full border",
            a.ring,
          )}
          style={{
            transform: `scale(${1 + clamped * 0.12})`,
            opacity: 0.4 + clamped * 0.4,
          }}
        />
        {/* Core orb — volume feedback via scale; no glow per design system */}
        <div
          className={cn(
            "relative grid size-14 sm:size-18 md:size-24 lg:size-28 place-items-center rounded-full text-white transition-transform duration-100",
            a.core,
          )}
          style={{
            transform: `scale(${scale})`,
          }}
        >
          <Icon_ className="size-6 sm:size-7 md:size-9 lg:size-10" strokeWidth={1.75} />
        </div>
      </div>

      {/* Equalizer bars driven by the volume level */}
      <div className="flex h-5 sm:h-6 items-end gap-1">
        {[0.6, 0.85, 1, 0.7, 0.45].map((weight, i) => (
          <span
            key={i}
            className={cn(
              "w-1 sm:w-1.5 rounded-full transition-all duration-100",
              a.bars,
            )}
            style={{
              height: `${Math.max(3, clamped * weight * 20)}px`,
              opacity: speaking ? 1 : 0.25,
            }}
          />
        ))}
      </div>

      <div className="text-center">
        <p
          className={cn(
            "text-xs sm:text-sm font-semibold",
            speaking ? a.text : "text-foreground",
          )}
        >
          {label}
        </p>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          {speaking ? "Speaking…" : sublabel}
        </p>
      </div>
    </div>
  );
}
