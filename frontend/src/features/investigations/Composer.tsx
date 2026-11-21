import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useRunInvestigation } from "@/api/hooks";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Alert, Kbd, Spinner } from "@/components/ui/Feedback";
import { Panel, PanelBody } from "@/components/ui/Panel";

// Generic examples: any error text, a failing id, or a question about data.
const EXAMPLES = [
  'java.lang.NumberFormatException: For input string: "ABC"',
  "Order ORD-48213 failed at checkout, why?",
  "What is the status of order ORD-48213?",
];

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono text-[12.5px] text-muted tabular-nums">{((now - since) / 1000).toFixed(1)} s</span>;
}

export function Composer() {
  const [message, setMessage] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const run = useRunInvestigation();
  const navigate = useNavigate();
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => input.current?.focus(), []);

  const submit = () => {
    const text = message.trim();
    if (!text || run.isPending) return;
    setStartedAt(Date.now());
    run.mutate(text, { onSuccess: (investigation) => navigate(`/investigations/${investigation.id}`) });
  };

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
            disabled={run.isPending}
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
              <Button variant="primary" onClick={submit} loading={run.isPending} disabled={!message.trim()}>
                Investigate <ArrowRight />
              </Button>
            </span>
          </div>
        </PanelBody>
      </Panel>

      {run.isPending && (
        <Panel className="flex items-center gap-3 p-pad">
          <Spinner />
          <div>
            <div className="font-medium text-fg">Investigating</div>
            <div className="text-[12.5px] text-muted">Classifying the message, searching enabled data sources, then analyzing the evidence.</div>
          </div>
          <span className="ml-auto"><Elapsed since={startedAt} /></span>
        </Panel>
      )}
      {run.error && <Alert tone="err">{(run.error as Error).message}</Alert>}

      {!run.isPending && (
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
