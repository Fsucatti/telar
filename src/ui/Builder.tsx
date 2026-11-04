import { ReactFlowProvider } from "@xyflow/react";
import { ChevronDown, GitCommitVertical, Link2, Play, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCurrentAgent, useStore } from "../state/store";
import { Canvas } from "./Canvas";
import { ConfigPanel } from "./ConfigPanel";
import { Overview } from "./Overview";
import { Palette } from "./Palette";
import { Playground } from "./Playground";

function VersionMenu() {
  const agent = useCurrentAgent();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!agent) return null;
  return (
    <div className="menu-anchor" ref={menu}>
      <button className="version-chip" aria-expanded={open} aria-label="Versions" onClick={() => setOpen(!open)}>
        v{agent.currentVersion} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {[...agent.versions].reverse().map((version) => (
            <button
              role="menuitem"
              key={version.number}
              onClick={() => {
                useStore.getState().restoreVersion(version.number);
                setOpen(false);
              }}
            >
              <strong>Version {version.number}</strong>
              <span className="muted small">{new Date(version.savedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Builder() {
  const agent = useCurrentAgent();
  const tab = useStore((state) => state.tab);
  const panel = useStore((state) => state.panel);
  const { closeAgent, updateAgentMeta, setTab, setPanel, saveVersion, shareLink, showToast, undo, redo } =
    useStore.getState();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Undo and redo, unless the cursor is in a text field, which has its own.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (!agent) return null;

  const copyShareLink = async () => {
    const link = shareLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copied. It includes this agent's blocks and documents.");
    } catch {
      showToast("Your browser blocked copying the link.");
    }
  };

  return (
    <ReactFlowProvider>
      <div className="builder">
        <header className="topbar">
          <div className="topbar-left">
            <input
              className="agent-name"
              aria-label="Agent name"
              value={agent.name}
              onChange={(event) => updateAgentMeta({ name: event.target.value })}
            />
            <VersionMenu />
          </div>
          <div className="segmented" role="tablist" aria-label="View">
            <button role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </button>
            <button role="tab" aria-selected={tab === "design"} onClick={() => setTab("design")}>
              Design
            </button>
          </div>
          <div className="topbar-right">
            <button className="button" onClick={saveVersion}>
              <GitCommitVertical size={15} /> <span className="hide-narrow">Create new version</span>
            </button>
            <button className="button soft" onClick={copyShareLink}>
              <Link2 size={15} /> <span className="hide-narrow">Share</span>
            </button>
            <button className="icon-button" aria-label="Close agent" onClick={closeAgent}>
              <X size={18} />
            </button>
          </div>
        </header>

        {tab === "overview" ? (
          <Overview />
        ) : (
          <div className="builder-body">
            <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <div className="canvas-area">
              <Canvas />
              <button className="button add-block-mobile" onClick={() => setPaletteOpen(true)}>
                <Plus size={15} /> Add block
              </button>
              {panel !== "playground" && (
                <button className="button playground-button" onClick={() => setPanel("playground")}>
                  <Play size={14} /> Playground
                </button>
              )}
            </div>
            {panel === "config" && <ConfigPanel />}
            {panel === "playground" && <Playground />}
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
