import type { Intent } from "@/api/types";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "err" | "violet";

export const INTENTS: Record<Intent | "unknown", { label: string; tone: Tone; color: string }> = {
  investigation: { label: "Investigation", tone: "warn", color: "var(--warn)" },
  data_question: { label: "Data question", tone: "accent", color: "var(--accent)" },
  conversation: { label: "Conversation", tone: "violet", color: "var(--violet)" },
  unknown: { label: "Unknown", tone: "neutral", color: "var(--muted)" },
};

export const intentMeta = (intent: string | null | undefined) =>
  INTENTS[(intent as Intent) ?? "unknown"] ?? INTENTS.unknown;
