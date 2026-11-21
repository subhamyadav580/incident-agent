import { Bot, ChevronRight, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useSaveSettings, useSettings } from "@/api/hooks";
import type { AgentSettings } from "@/api/types";
import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, TextArea } from "@/components/ui/Field";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

const PROVIDERS = ["openai", "anthropic", "google_genai", "ollama", "bedrock", "azure_openai"];

export function SettingsPage() {
  const { data, isLoading, error } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<AgentSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const set = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => setForm((current) => (current ? { ...current, [key]: value } : current));

  const submit = () =>
    form && save.mutate(
      { ...form, router_model_name: form.router_model_name?.trim() || null, model_api_key: apiKey },
      { onSuccess: () => setApiKey("") },
    );

  return (
    <>
      <PageHeader title="Settings" subtitle="Model and behaviour of the agent"
        actions={<Button variant="primary" onClick={submit} loading={save.isPending} disabled={!form}><Save /> Save settings</Button>} />
      <PageBody>
        {error && <Alert tone="err">{(error as Error).message}</Alert>}
        {isLoading || !form ? (
          <div className="grid place-items-center p-10"><Spinner /></div>
        ) : (
          <div className="max-w-3xl space-y-4">
            <Panel>
              <PanelHeader title="Model" icon={<Bot />}>
                <span className="text-[12px] text-muted">Stored in the app database; the API key is encrypted.</span>
              </PanelHeader>
              <PanelBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Provider" required help="Any LangChain provider; its package must be installed.">
                    <Input list="providers" value={form.model_provider} onChange={(e) => set("model_provider", e.target.value)} />
                    <datalist id="providers">{PROVIDERS.map((p) => <option key={p} value={p} />)}</datalist>
                  </Field>
                  <Field label="Model" required>
                    <Input value={form.model_name} onChange={(e) => set("model_name", e.target.value)} placeholder="gpt-4.1-mini" />
                  </Field>
                </div>
                <Field label="API key" help="Optional. Without it the provider's environment variable is used (OPENAI_API_KEY, …).">
                  <Input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    placeholder={data?.model_api_key_set ? "•••••• stored — leave blank to keep" : ""} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <Field label="Routing model" help="Classifies each message as chat, data question or investigation. A small model is enough.">
                    <Input value={form.router_model_name ?? ""} onChange={(e) => set("router_model_name", e.target.value)} placeholder="same as the main model" />
                  </Field>
                  <Field label="Max model steps">
                    <Input type="number" min={1} max={50} value={form.max_steps} onChange={(e) => set("max_steps", Number(e.target.value || 8))} />
                  </Field>
                </div>
                <Checkbox label="Classify messages before investigating" checked={form.router_enabled} onChange={(e) => set("router_enabled", e.target.checked)} />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Team instructions" icon={<Bot />} tone="violet" />
              <PanelBody className="space-y-3">
                <Field label="Added to the built-in prompt" help="Your terms, service map, status codes and runbooks. Applies to every new investigation.">
                  <TextArea rows={7} value={form.extra_instructions} onChange={(e) => set("extra_instructions", e.target.value)}
                    className="font-mono text-[12.5px] leading-relaxed" placeholder="Order ids look like ORD-48213. orders.status: P = pending, C = confirmed, F = failed. Payments are handled by payment-service; its logs show the provider's error code." />
                </Field>
                <button type="button" onClick={() => setShowPrompt(!showPrompt)} className="flex items-center gap-1 text-[12.5px] font-semibold text-fg-2 hover:text-fg" aria-expanded={showPrompt}>
                  <ChevronRight className={`size-3.5 transition-transform ${showPrompt ? "rotate-90" : ""}`} /> Built-in prompt
                </button>
                {showPrompt && (
                  <pre className="max-h-96 overflow-y-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[12px] whitespace-pre-wrap text-fg-2">{data?.default_prompt}</pre>
                )}
              </PanelBody>
            </Panel>

            {save.isSuccess && <Alert tone="ok">Saved. New investigations use these settings.</Alert>}
            {save.error && <Alert tone="err">{(save.error as Error).message}</Alert>}
          </div>
        )}
      </PageBody>
    </>
  );
}
