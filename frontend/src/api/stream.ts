import type { Investigation, TraceSpan } from "./types";

export type RunEvent =
  | { type: "run"; run_id: string }
  | { type: "step"; phase: "start" | "end"; index: number; span: TraceSpan }
  | { type: "done"; investigation: Investigation }
  | { type: "error"; message: string; run_id?: string }
  | { type: "ping" };

/**
 * Start an investigation and receive its steps as they happen (newline-delimited
 * JSON from POST /api/investigations/stream). Resolves with the saved investigation.
 */
export async function streamInvestigation(message: string, onEvent: (event: RunEvent) => void, signal?: AbortSignal): Promise<Investigation> {
  const response = await fetch("/api/investigations/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || `${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Investigation | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as RunEvent;
      onEvent(event);
      if (event.type === "done") result = event.investigation;
      if (event.type === "error") throw new Error(event.message);
    }
  }
  if (!result) throw new Error("The investigation ended without a result.");
  return result;
}
