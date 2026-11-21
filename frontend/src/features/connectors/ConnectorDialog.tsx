import { useCallback, useState } from "react";
import { useDeleteConnector, useSaveConnector, useTestConnector, type CatalogRequest } from "@/api/hooks";
import type { Catalog, Connector, ConnectorType, FieldSpec, IndexGroupConfig, Settings, TableConfig } from "@/api/types";
import { TypeLogo } from "@/components/status";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Checkbox, Field, Input, Select, TextArea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { Tabs } from "@/components/ui/Tabs";
import { formatDuration } from "@/lib/format";
import { IndexGroupsEditor } from "./catalog/IndexGroupsEditor";
import { TablesEditor } from "./catalog/TablesEditor";

type Values = Record<string, string | boolean>;
type Tab = "connection" | "catalog" | "advanced";

const initialValues = (type: ConnectorType, settings: Settings = {}): Values =>
  Object.fromEntries(
    type.fields
      .filter((field) => field.kind !== "catalog")
      .map((field) => {
        if (field.secret) return [field.name, ""];
        const value = settings[field.name] ?? (field.kind === "bool" ? field.default ?? false : "");
        return [field.name, field.kind === "bool" ? Boolean(value) : String(value)];
      }),
  );

function FieldControl({ field, value, onChange, secretStored }: { field: FieldSpec; value: string | boolean; onChange: (value: string | boolean) => void; secretStored: boolean }) {
  if (field.kind === "bool") return <Checkbox label={field.label} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;

  const code = field.name === "identifier_patterns";
  const placeholder = field.kind === "password" && secretStored ? "•••••• stored — leave blank to keep" : field.default != null ? String(field.default) : undefined;
  return (
    <Field label={field.label} help={field.help} required={field.required}>
      {field.kind === "select" ? (
        <Select value={String(value || field.default || "")} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      ) : field.kind === "textarea" ? (
        <TextArea value={String(value)} onChange={(e) => onChange(e.target.value)} rows={code ? 5 : 3}
          spellCheck={!code} className={code ? "font-mono text-[12.5px] leading-relaxed" : undefined} />
      ) : (
        <Input type={field.kind === "password" ? "password" : field.kind === "number" ? "number" : "text"}
          autoComplete={field.kind === "password" ? "new-password" : "off"}
          value={String(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function ConnectorDialog({ type, connector, onClose }: { type: ConnectorType; connector?: Connector; onClose: () => void }) {
  const catalogField = type.fields.find((field) => field.kind === "catalog");
  const [tab, setTab] = useState<Tab>("connection");
  const [name, setName] = useState(connector?.name ?? "");
  const [enabled, setEnabled] = useState(connector?.enabled ?? true);
  const [values, setValues] = useState<Values>(() => initialValues(type, connector?.settings));
  const [catalog, setCatalog] = useState<Catalog>(() => (catalogField ? (connector?.settings[catalogField.name] as Catalog) ?? {} : {}));
  const save = useSaveConnector();
  const test = useTestConnector();
  const remove = useDeleteConnector();
  const toast = useToast();
  const stored = new Set(connector?.secrets_set ?? []);

  // Fields with show_if are hidden (and not sent) unless the other field matches.
  const visible = (field: FieldSpec) =>
    !field.show_if ||
    Object.entries(field.show_if).every(([other, allowed]) => {
      const spec = type.fields.find((f) => f.name === other);
      return allowed.includes(String(values[other] || spec?.default || ""));
    });

  const connection = useCallback(() => {
    const settings: Settings = {};
    const secrets: Record<string, string> = {};
    for (const field of type.fields) {
      if (field.kind === "catalog" || !visible(field)) continue;
      const value = values[field.name];
      if (field.secret) secrets[field.name] = String(value);
      else if (value !== "") settings[field.name] = value;
    }
    return { settings, secrets };
  }, [type, values]); // `visible` reads the same values

  const catalogRequest = useCallback((): CatalogRequest => ({ type: type.type, id: connector?.id, ...connection() }), [type, connector, connection]);

  const payload = () => {
    const { settings, secrets } = connection();
    if (catalogField) settings[catalogField.name] = catalog;
    return { settings, secrets };
  };

  const fields = (group: FieldSpec["group"]) =>
    type.fields.filter((field) => field.group === group && field.kind !== "catalog" && visible(field)).map((field) => (
      <div key={field.name} className={field.kind === "textarea" || field.kind === "bool" ? "md:col-span-2" : undefined}>
        <FieldControl field={field} value={values[field.name]} secretStored={stored.has(field.name)}
          onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))} />
      </div>
    ));
  const error = (save.error ?? remove.error ?? test.error) as Error | null;

  const hasAdvanced = type.fields.some((field) => field.group === "advanced" && visible(field));
  const tabs = [
    { id: "connection" as const, label: "Connection" },
    ...(catalogField ? [{ id: "catalog" as const, label: type.catalog_label }] : []),
    ...(hasAdvanced ? [{ id: "advanced" as const, label: "Advanced" }] : []),
  ];

  return (
    <Modal
      onClose={onClose}
      toolbar={<Tabs items={tabs} value={tab} onChange={setTab} />}
      icon={<TypeLogo type={type.type} />}
      title={connector ? `Edit ${connector.name}` : `New ${type.label} connector`}
      subtitle={type.description}
      footer={
        <>
          {connector && (
            <Button variant="danger" loading={remove.isPending} onClick={() => {
              if (confirm(`Delete connector ${connector.name}? Its stored credentials are removed.`)) remove.mutate(connector.id, {
                onSuccess: () => { toast("ok", `Deleted ${connector.name}`); onClose(); },
              });
            }}>Delete</Button>
          )}
          <span className="flex-1" />
          <Button loading={test.isPending} onClick={() => test.mutate({ type: type.type, id: connector?.id, ...connection() })}>Test connection</Button>
          <Button variant="primary" loading={save.isPending} onClick={() =>
            save.mutate({ id: connector?.id, body: { name: name.trim(), enabled, ...(connector ? {} : { type: type.type }), ...payload() } }, { onSuccess: (saved) => { toast("ok", connector ? `Saved ${saved.name}` : `Added ${saved.name}`, saved.enabled ? "Used by new investigations." : "Disabled for now."); onClose(); } })
          }>Save</Button>
        </>
      }
    >
      {tab === "connection" && (
        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
          <Field label="Name" required help="Lowercase letters, digits and _. The agent refers to this source by its name.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. orders" autoFocus />
          </Field>
          <div className="flex items-start md:pt-7">
            <Checkbox label="Enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </div>
          {fields("main")}
          {catalogField && (
            <p className="text-[12.5px] text-muted md:col-span-2">
              Next, optionally describe your {type.catalog_label.toLowerCase()} in the <button type="button" className="text-accent hover:underline" onClick={() => setTab("catalog")}>{type.catalog_label}</button> tab.
            </p>
          )}
        </div>
      )}

      {tab === "catalog" && catalogField && (
        type.type === "postgres" ? (
          <TablesEditor value={catalog as Record<string, TableConfig>} onChange={setCatalog} request={catalogRequest} />
        ) : (
          <IndexGroupsEditor value={catalog as Record<string, IndexGroupConfig>} onChange={setCatalog} request={catalogRequest} />
        )
      )}

      {tab === "advanced" && hasAdvanced && <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">{fields("advanced")}</div>}

      {test.data && <Alert tone={test.data.ok ? "ok" : "err"}>{test.data.message}{test.data.latency_ms != null && ` (${formatDuration(test.data.latency_ms)})`}</Alert>}
      {error && <Alert tone="err">{error.message}</Alert>}
    </Modal>
  );
}
