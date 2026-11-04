import { FileUp, Plus, Search, Trash2, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { newId } from "../flow/catalog";
import type {
  BlockData,
  CodeData,
  ConditionData,
  ImageData,
  KnowledgeData,
  KnowledgeDoc,
  LlmData,
  MemoryData,
  TemplateData,
} from "../flow/types";
import { LIMITS, MODELS, TOOL_NAMES, TOOL_SCHEMAS, type ToolName } from "../shared/api";
import { useCurrentAgent, useStore } from "../state/store";

const MAX_FILE_BYTES = 300_000;

const TOOL_LABELS: Record<ToolName, string> = {
  calculator: "Calculator",
  current_datetime: "Date and time",
  search_documents: "Search documents",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
}

type Update<T> = (patch: Partial<T>) => void;

function LlmForm({ data, update }: { data: LlmData; update: Update<LlmData> }) {
  const [tab, setTab] = useState<"model" | "prompt" | "tools" | "policies">("prompt");
  const model = MODELS.find((candidate) => candidate.id === data.model);
  return (
    <>
      <div className="tabs" role="tablist">
        {(["model", "prompt", "tools", "policies"] as const).map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>

      {tab === "model" && (
        <>
          <Field label="Model" hint={model?.description}>
            <select
              value={data.model}
              onChange={(event) => {
                const next = MODELS.find((candidate) => candidate.id === event.target.value);
                update({ model: event.target.value, tools: next?.tools ? data.tools : [] });
              }}
            >
              {MODELS.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
              ))}
            </select>
          </Field>
          <Field label={`Creativity: ${data.temperature.toFixed(1)}`} hint="Lower is more predictable, higher is more varied.">
            <input type="range" min={0} max={1.5} step={0.1} value={data.temperature} onChange={(event) => update({ temperature: Number(event.target.value) })} />
          </Field>
          <Field label={`Longest answer: ${data.maxTokens} tokens`} hint="Longer answers use more of the free daily allowance.">
            <input type="range" min={64} max={LIMITS.maxTokens} step={32} value={data.maxTokens} onChange={(event) => update({ maxTokens: Number(event.target.value) })} />
          </Field>
        </>
      )}

      {tab === "prompt" && (
        <>
          <Field label="Instructions" hint="How this model should behave. Sent on every run.">
            <textarea rows={7} value={data.system} onChange={(event) => update({ system: event.target.value })} />
          </Field>
          <Field label="Input message" hint="{{input}} is replaced by what the previous block produced.">
            <textarea rows={4} value={data.prompt} onChange={(event) => update({ prompt: event.target.value })} />
          </Field>
        </>
      )}

      {tab === "tools" && (
        <div className="stack">
          <p className="muted small">The model decides when to call these. They run in your browser.</p>
          {!model?.tools && <p className="notice">{model?.label} can't use tools. Choose another model in the Model tab.</p>}
          {TOOL_NAMES.map((name) => (
            <label className={`toggle-row${model?.tools ? "" : " is-disabled"}`} key={name}>
              <input
                type="checkbox"
                disabled={!model?.tools}
                checked={data.tools.includes(name)}
                onChange={(event) =>
                  update({ tools: event.target.checked ? [...data.tools, name] : data.tools.filter((tool) => tool !== name) })
                }
              />
              <span>
                <strong>{TOOL_LABELS[name]}</strong>
                <span className="muted small">{TOOL_SCHEMAS[name].description}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {tab === "policies" && (
        <Field label="Blocked terms" hint="One per line. An answer that contains one of these is withheld.">
          <textarea
            rows={6}
            value={data.blockedTerms.join("\n")}
            onChange={(event) => update({ blockedTerms: event.target.value.split("\n") })}
          />
        </Field>
      )}
    </>
  );
}

function KnowledgeForm({ data, update }: { data: KnowledgeData; update: Update<KnowledgeData> }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "included" | "ignored">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [pasting, setPasting] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const visible = data.docs.filter(
    (doc) =>
      doc.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (status === "all" || (status === "included") === doc.included),
  );

  const addDocs = (docs: KnowledgeDoc[]) => update({ docs: [...data.docs, ...docs] });

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    setError("");
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    const accepted: KnowledgeDoc[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) rejected.push(file.name);
      else accepted.push({ id: newId(), name: file.name, text: await file.text(), included: true });
    }
    if (accepted.length) addDocs(accepted);
    if (rejected.length) setError(`Too large (300 KB at most): ${rejected.join(", ")}`);
  };

  const setIncluded = (ids: string[], included: boolean) => {
    update({ docs: data.docs.map((doc) => (ids.includes(doc.id) ? { ...doc, included } : doc)) });
    setSelected([]);
  };

  return (
    <div className="stack">
      <div className="row">
        <button className="button" onClick={() => fileInput.current?.click()}><FileUp size={15} /> Upload</button>
        <button className="button" onClick={() => setPasting(!pasting)}><Plus size={15} /> Paste text</button>
        <input ref={fileInput} type="file" hidden multiple accept=".txt,.md,.csv,.json,.html,text/*" aria-label="Upload text files" onChange={onFiles} />
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {pasting && (
        <div className="stack paste-box">
          <Field label="Name"><input value={pasteName} onChange={(event) => setPasteName(event.target.value)} /></Field>
          <Field label="Text"><textarea rows={6} value={pasteText} onChange={(event) => setPasteText(event.target.value)} /></Field>
          <button
            className="button primary"
            disabled={!pasteText.trim()}
            onClick={() => {
              addDocs([{ id: newId(), name: pasteName.trim() || "Pasted text", text: pasteText, included: true }]);
              setPasteName("");
              setPasteText("");
              setPasting(false);
            }}
          >
            Add document
          </button>
        </div>
      )}

      <div className="row">
        <label className="search grow">
          <Search size={15} />
          <input placeholder="Search" aria-label="Search documents" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All</option>
          <option value="included">Included</option>
          <option value="ignored">Ignored</option>
        </select>
      </div>

      {data.docs.length === 0 ? (
        <p className="muted small">No documents yet. Upload text files or paste text.</p>
      ) : (
        <ul className="doc-list">
          {visible.map((doc) => (
            <li key={doc.id}>
              <input
                type="checkbox"
                aria-label={`Select ${doc.name}`}
                checked={selected.includes(doc.id)}
                onChange={(event) =>
                  setSelected(event.target.checked ? [...selected, doc.id] : selected.filter((id) => id !== doc.id))
                }
              />
              <span className="doc-name" title={doc.name}>{doc.name}</span>
              <button
                className={`chip ${doc.included ? "chip-green" : "chip-gray"}`}
                title="Click to switch"
                onClick={() => setIncluded([doc.id], !doc.included)}
              >
                {doc.included ? "Included" : "Ignored"}
              </button>
              <button
                className="icon-button"
                aria-label={`Remove ${doc.name}`}
                onClick={() => update({ docs: data.docs.filter((candidate) => candidate.id !== doc.id) })}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="row selection-bar">
          <span className="muted small grow">{selected.length} selected</span>
          <button className="button" onClick={() => setIncluded(selected, false)}>Ignore</button>
          <button className="button primary" onClick={() => setIncluded(selected, true)}>Include</button>
        </div>
      )}

      <Field label={`Passages per question: ${data.topK}`} hint="Only the most relevant passages reach the model. The files stay in your browser.">
        <input type="range" min={1} max={10} value={data.topK} onChange={(event) => update({ topK: Number(event.target.value) })} />
      </Field>
    </div>
  );
}

function ConditionForm({ data, update }: { data: ConditionData; update: Update<ConditionData> }) {
  const labels = {
    contains: { label: "Text to find", hint: "Takes the Yes path if the input contains this text." },
    regex: { label: "Pattern", hint: "A regular expression. Takes the Yes path on a match." },
    ai: { label: "Question", hint: "A yes/no question that a model answers about the input." },
  }[data.mode];
  return (
    <>
      <Field label="Decide by">
        <select value={data.mode} onChange={(event) => update({ mode: event.target.value as ConditionData["mode"] })}>
          <option value="contains">Contains text</option>
          <option value="regex">Pattern</option>
          <option value="ai">AI decides</option>
        </select>
      </Field>
      <Field label={labels.label} hint={labels.hint}>
        <textarea rows={3} value={data.value} onChange={(event) => update({ value: event.target.value })} />
      </Field>
    </>
  );
}

function FormFor({ data, update }: { data: BlockData; update: (patch: Partial<BlockData>) => void }) {
  switch (data.kind) {
    case "llm":
      return <LlmForm data={data} update={update as Update<LlmData>} />;
    case "knowledge":
      return <KnowledgeForm data={data} update={update as Update<KnowledgeData>} />;
    case "condition":
      return <ConditionForm data={data} update={update as Update<ConditionData>} />;
    case "image":
      return (
        <Field label="Image prompt" hint="{{input}} is replaced by what the previous block produced.">
          <textarea rows={5} value={data.prompt} onChange={(event) => (update as Update<ImageData>)({ prompt: event.target.value })} />
        </Field>
      );
    case "memory":
      return (
        <Field label={`Turns to remember: ${data.turns}`} hint="Attach this to a model. Earlier playground messages are sent along.">
          <input type="range" min={1} max={15} value={data.turns} onChange={(event) => (update as Update<MemoryData>)({ turns: Number(event.target.value) })} />
        </Field>
      );
    case "template":
      return (
        <Field label="Template" hint="{{input}} is replaced by what the previous block produced.">
          <textarea rows={8} value={data.template} onChange={(event) => (update as Update<TemplateData>)({ template: event.target.value })} />
        </Field>
      );
    case "code":
      return (
        <Field label="JavaScript" hint="Receives `input` and returns the result. It has no network access and stops after 3 seconds.">
          <textarea className="code-input" spellCheck={false} rows={12} value={data.code} onChange={(event) => (update as Update<CodeData>)({ code: event.target.value })} />
        </Field>
      );
    case "input":
      return <p className="muted small">Where each run starts. It receives the message typed in the playground.</p>;
    case "output":
      return <p className="muted small">What reaches this block is the agent's final answer.</p>;
  }
}

export function ConfigPanel() {
  const agent = useCurrentAgent();
  const selectedNodeId = useStore((state) => state.selectedNodeId);
  const { updateNodeData, selectNode } = useStore.getState();
  const node = agent?.flow.nodes.find((candidate) => candidate.id === selectedNodeId);
  if (!node) return null;
  const data = node.data as BlockData;

  return (
    <aside className="side-panel" aria-label="Block settings">
      <div className="side-panel-head">
        <input
          className="panel-title"
          aria-label="Block name"
          value={data.title}
          onChange={(event) => updateNodeData(node.id, { title: event.target.value })}
        />
        <button className="icon-button" aria-label="Close settings" onClick={() => selectNode(null)}>
          <X size={18} />
        </button>
      </div>
      <div className="side-panel-body">
        <FormFor key={node.id} data={data} update={(patch) => updateNodeData(node.id, patch)} />
      </div>
    </aside>
  );
}
