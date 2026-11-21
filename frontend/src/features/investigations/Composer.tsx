import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/api/hooks";
import { streamInvestigation } from "@/api/stream";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Alert, Kbd } from "@/components/ui/Feedback";
import { Panel, PanelBody } from "@/components/ui/Panel";
import { LiveRun, type LiveStep } from "./LiveRun";

// Generic examples: any error text, a failing id, or a question about data.
const EXAMPLES = [
  'java.lang.NumberFormatException: For input string: "ABC"',
  "Order ORD-48213 failed at checkout, why?",
  "What is the status of order ORD-48213?",
];

export function Composer() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState(() => params.get("q") ?? "");
  const [startedAt, setStartedAt] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => input.current?.focus(), []);

  const submit = async () => {
    const text = message.trim();
    if (!text || running) return;
    setStartedAt(Date.now());
    setRunning(text);
    setSteps([]);
    setError(null);
    try {
      const investigation = await streamInvestigation(text, (event) => {
        if (event.type !== "step") return;
        setSteps((current) => {
          const next = [...current];
          next[event.index] = { span: event.span, done: event.phase === "end" };
          return next;
        });
      });
      queryClient.setQueryData(keys.investigation(investigation.id), investigation);
      navigate(`/investigations/${investigation.id}`);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setRunning(null);
      queryClient.invalidateQueries({ queryKey: keys.investigations });
      queryClient.invalidateQueries({ queryKey: keys.overview });
    }
  };
  const isRunning = Boolean(running);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelBody className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <Sparkles className="size-4 text-accent" /> What went wrong?
          </div>
          <TextArea
            ref={input}
            rows={5}
            value={message}
            disabled={isRunning}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="Paste an error message, a stack trace line or a failing id — or ask a question about your data."
            className="font-mono text-[13px] leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted">Try:</span>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setMessage(example)}
                className="max-w-full truncate rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-fg-2 hover:bg-hover">
                {example}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <span className="hidden text-[12px] text-muted sm:inline"><Kbd>⌘</Kbd> <Kbd>Enter</Kbd></span>
              <Button variant="primary" onClick={submit} loading={isRunning} disabled={!message.trim()}>
                Investigate <ArrowRight />
              </Button>
            </span>
          </div>
        </PanelBody>
      </Panel>

      {running && <LiveRun steps={steps.filter(Boolean)} startedAt={startedAt} message={running} />}
      {error && <Alert tone="err">{error}</Alert>}

      {!isRunning && !steps.length && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Paste an error", "Exception names and fixed phrases are searched across every service; ids and numbers are ignored so all occurrences match."],
            ["Or a failing id", "The request is traced through each service's logs and looked up in your databases."],
            ["Get the cause", "A report with the affected services, a UTC timeline, the likely root cause and what still needs checking."],
          ].map(([title, text]) => (
            <Panel key={title} className="p-pad">
              <div className="text-[13px] font-semibold text-fg">{title}</div>
              <div className="mt-1 text-[12.5px] text-muted">{text}</div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
