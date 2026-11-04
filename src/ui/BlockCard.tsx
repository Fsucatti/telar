import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Check, Loader2, MoreHorizontal, X } from "lucide-react";
import { createContext, memo, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MODELS } from "../shared/api";
import { KIND_LABEL } from "../flow/catalog";
import { HANDLES, type BlockData, type BlockNode } from "../flow/types";
import { useStore } from "../state/store";

/** Problems found by the validator, by block id. Provided by the canvas. */
export const IssuesContext = createContext<Record<string, string>>({});

function Chip({ tone, children }: { tone: "purple" | "green" | "pink" | "orange" | "gray"; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

function chipsFor(data: BlockData): ReactNode {
  switch (data.kind) {
    case "llm": {
      const model = MODELS.find((candidate) => candidate.id === data.model);
      return (
        <>
          <Chip tone="purple">{model?.label ?? "Model"}</Chip>
          {data.tools.length > 0 && <Chip tone="pink">{data.tools.length} tools</Chip>}
          {data.blockedTerms.length > 0 && <Chip tone="orange">{data.blockedTerms.length} policies</Chip>}
        </>
      );
    }
    case "image":
      return <Chip tone="purple">FLUX Schnell</Chip>;
    case "knowledge": {
      const included = data.docs.filter((doc) => doc.included).length;
      return <Chip tone="green">{included} {included === 1 ? "file" : "files"}</Chip>;
    }
    case "memory":
      return <Chip tone="green">Last {data.turns} turns</Chip>;
    case "condition":
      return <Chip tone="gray">{{ contains: "Contains text", regex: "Pattern", ai: "AI decides" }[data.mode]}</Chip>;
    case "template":
      return <Chip tone="gray">Template</Chip>;
    case "code":
      return <Chip tone="orange">Custom JavaScript</Chip>;
    default:
      return null;
  }
}

function BlockMenu({ id, deletable }: { id: string; deletable: boolean }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const { duplicateNode, deleteNode } = useStore.getState();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!deletable) return null;
  return (
    <div className="menu-anchor nodrag" ref={menu}>
      <button
        className="block-menu-button"
        aria-label="Block options"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="menu menu-right" role="menu" onClick={(event) => event.stopPropagation()}>
          <button role="menuitem" onClick={() => { duplicateNode(id); setOpen(false); }}>Duplicate</button>
          <button role="menuitem" className="danger" onClick={() => { deleteNode(id); setOpen(false); }}>Delete</button>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ id, issue }: { id: string; issue?: string }) {
  const status = useStore((state) => state.nodeStatus[id]);
  if (status === "running") return <Loader2 size={15} className="spin status-running" aria-label="Running" />;
  if (status === "done") return <Check size={15} className="status-done" aria-label="Finished" />;
  if (status === "error") return <X size={15} className="status-error" aria-label="Failed" />;
  if (issue) {
    return (
      <span className="status-warning" title={issue} aria-label={issue}>
        <AlertTriangle size={14} />
      </span>
    );
  }
  return null;
}

export const BlockCard = memo(function BlockCard({ id, data, selected, deletable }: NodeProps<BlockNode>) {
  const block = data as BlockData;
  const issue = useContext(IssuesContext)[id];
  const status = useStore((state) => state.nodeStatus[id]);
  const statusClass = status ? ` is-${status}` : "";

  if (block.kind === "input" || block.kind === "output") {
    return (
      <div className={`block-pill${selected ? " is-selected" : ""}${statusClass}`}>
        {block.title}
        {block.kind === "input" ? (
          <Handle type="source" position={Position.Bottom} id={HANDLES.out} />
        ) : (
          <Handle type="target" position={Position.Top} id={HANDLES.in} />
        )}
      </div>
    );
  }

  const attachesToModel = block.kind === "knowledge" || block.kind === "memory";
  const label = block.kind === "llm" ? block.label : KIND_LABEL[block.kind];

  return (
    <div className={`block${selected ? " is-selected" : ""}${statusClass}`}>
      {attachesToModel ? (
        <Handle type="source" position={Position.Right} id={HANDLES.ctx} />
      ) : (
        <Handle type="target" position={Position.Top} id={HANDLES.in} />
      )}
      {block.kind === "llm" && (
        <Handle type="target" position={Position.Left} id={HANDLES.context} className="handle-context" title="Attach documents or memory" />
      )}

      <div className="block-head">
        <span className="block-label">{label}</span>
        <span className="block-actions">
          <StatusIcon id={id} issue={issue} />
          <BlockMenu id={id} deletable={deletable !== false} />
        </span>
      </div>
      <div className="block-title">{block.title}</div>
      <div className="chips">{chipsFor(block)}</div>
      {block.kind === "llm" && <div className="block-footer">Input messages</div>}

      {block.kind === "condition" ? (
        <>
          <div className="condition-exits">
            <span>Yes</span>
            <span>No</span>
          </div>
          <Handle type="source" position={Position.Bottom} id={HANDLES.yes} className="handle-yes" title="Yes" />
          <Handle type="source" position={Position.Bottom} id={HANDLES.no} className="handle-no" title="No" />
        </>
      ) : (
        !attachesToModel && <Handle type="source" position={Position.Bottom} id={HANDLES.out} />
      )}
    </div>
  );
});
