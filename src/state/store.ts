/**
 * All app state: saved agents, the open canvas, and the live run.
 * Agents are saved in this browser's localStorage. There are no accounts or server storage.
 */
import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from "@xyflow/react";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { create } from "zustand";
import { newId } from "../flow/catalog";
import { makeNode, sanitizeBlockData, sanitizeFlow } from "../flow/sanitize";
import { PILL_X, blankFlow, type AgentTemplate } from "../flow/templates";
import { HANDLES, type Agent, type BlockData, type BlockNode, type Flow, type RunRecord } from "../flow/types";
import { wouldCreateCycle } from "../engine/run";

const STORAGE_KEY = "telar:agents:v1";
const MAX_RUNS = 15;
const MAX_UNDO = 30;

export type NodeStatus = "running" | "done" | "error" | "skipped";

export interface RunStepView {
  nodeId: string;
  title: string;
  status: NodeStatus;
  ms?: number;
  detail?: string;
  tools: string[];
}

export interface ChatEntry {
  id: string;
  role: "user" | "agent";
  text: string;
  images: string[];
  /** Streaming text from the block running now. */
  live?: string;
  steps: RunStepView[];
  error?: { message: string; code?: string };
  simulated?: boolean;
  running?: boolean;
  /** The question, kept to offer a simulated retry. */
  input?: string;
}

interface Store {
  agents: Agent[];
  currentId: string | null;
  tab: "design" | "overview";
  selectedNodeId: string | null;
  panel: "config" | "playground" | null;
  undoStack: Flow[];
  redoStack: Flow[];
  chat: ChatEntry[];
  nodeStatus: Record<string, NodeStatus>;
  isRunning: boolean;
  /** Kept here so closing the playground can't silently turn real AI calls back on. */
  simulated: boolean;
  toast: string | null;

  setSimulated(simulated: boolean): void;
  openAgent(id: string): void;
  closeAgent(): void;
  createBlank(): void;
  createFromTemplate(template: AgentTemplate): void;
  deleteAgent(id: string): void;
  updateAgentMeta(meta: Partial<Pick<Agent, "name" | "description">>): void;
  setTab(tab: Store["tab"]): void;
  setPanel(panel: Store["panel"]): void;
  selectNode(id: string | null): void;

  onNodesChange(changes: NodeChange<BlockNode>[]): void;
  onEdgesChange(changes: EdgeChange[]): void;
  onConnect(connection: Connection): void;
  isValidConnection(connection: { source?: string | null; target?: string | null; sourceHandle?: string | null; targetHandle?: string | null }): boolean;
  addBlock(data: BlockData, position?: { x: number; y: number }): void;
  duplicateNode(id: string): void;
  deleteNode(id: string): void;
  updateNodeData(id: string, patch: Partial<BlockData>): void;
  checkpoint(): void;
  undo(): void;
  redo(): void;

  saveVersion(): void;
  restoreVersion(number: number): void;
  shareLink(): string | null;
  importFromHash(hash: string): boolean;

  resetRunView(): void;
  setChat(update: (chat: ChatEntry[]) => ChatEntry[]): void;
  setNodeStatus(id: string, status: NodeStatus): void;
  setRunning(running: boolean): void;
  addRunRecord(record: RunRecord): void;
  clearChat(): void;
  showToast(message: string): void;
  dismissToast(): void;
}

function loadAgents(): Agent[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((raw): Agent[] => {
      const flow = sanitizeFlow(raw?.flow);
      if (!flow || typeof raw.id !== "string") return [];
      return [
        {
          ...(raw as Agent),
          flow,
          versions: Array.isArray(raw.versions)
            ? raw.versions.flatMap((version: Agent["versions"][number]) => {
                const saved = sanitizeFlow(version?.flow);
                return saved ? [{ ...version, flow: saved }] : [];
              })
            : [],
          runs: Array.isArray(raw.runs) ? raw.runs : [],
          suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [],
        },
      ];
    });
  } catch {
    return [];
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Drops canvas-only state (selection, measurements) before saving a flow. */
function cleanFlow(flow: Flow): Flow {
  return sanitizeFlow(clone(flow)) ?? flow;
}

function createAgent(name: string, description: string, suggestions: string[], flow: Flow): Agent {
  return {
    id: newId(),
    name,
    description,
    suggestions,
    flow,
    versions: [{ number: 1, savedAt: new Date().toISOString(), flow: clone(flow) }],
    currentVersion: 1,
    runs: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Space between stacked blocks when one is added by clicking. */
const VERTICAL_GAP = 190;

export const useStore = create<Store>((set, get) => {
  const current = () => get().agents.find((agent) => agent.id === get().currentId) ?? null;

  const patchCurrent = (patch: (agent: Agent) => Partial<Agent>) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === state.currentId ? { ...agent, ...patch(agent), updatedAt: new Date().toISOString() } : agent,
      ),
    }));

  const setFlow = (flow: Flow) => patchCurrent(() => ({ flow }));

  const open = (id: string) =>
    set({
      currentId: id,
      tab: "design",
      selectedNodeId: null,
      panel: null,
      undoStack: [],
      redoStack: [],
      chat: [],
      nodeStatus: {},
      isRunning: false,
    });

  return {
    agents: loadAgents(),
    currentId: null,
    tab: "design",
    selectedNodeId: null,
    panel: null,
    undoStack: [],
    redoStack: [],
    chat: [],
    nodeStatus: {},
    isRunning: false,
    simulated: false,
    toast: null,

    setSimulated: (simulated) => set({ simulated }),
    openAgent: open,
    closeAgent: () => set({ currentId: null, panel: null, selectedNodeId: null }),

    createBlank() {
      const agent = createAgent("Untitled agent", "", [], blankFlow());
      set((state) => ({ agents: [agent, ...state.agents] }));
      open(agent.id);
    },

    createFromTemplate(template) {
      const agent = createAgent(template.name, template.description, template.suggestions, template.build());
      set((state) => ({ agents: [agent, ...state.agents] }));
      open(agent.id);
    },

    deleteAgent: (id) => set((state) => ({ agents: state.agents.filter((agent) => agent.id !== id) })),
    updateAgentMeta: (meta) => patchCurrent(() => meta),
    setTab: (tab) => set({ tab }),
    setPanel: (panel) => set({ panel }),

    selectNode: (id) =>
      set((state) => ({
        selectedNodeId: id,
        panel: id ? "config" : state.panel === "config" ? null : state.panel,
      })),

    onNodesChange(changes) {
      const agent = current();
      if (!agent) return;
      if (changes.some((change) => change.type === "remove")) get().checkpoint();
      const nodes = applyNodeChanges(changes, agent.flow.nodes);
      const removed = changes.flatMap((change) => (change.type === "remove" ? [change.id] : []));
      if (removed.includes(get().selectedNodeId ?? "")) set({ selectedNodeId: null, panel: null });
      setFlow({ ...agent.flow, nodes });
    },

    onEdgesChange(changes) {
      const agent = current();
      if (!agent) return;
      if (changes.some((change) => change.type === "remove")) get().checkpoint();
      setFlow({ ...agent.flow, edges: applyEdgeChanges(changes, agent.flow.edges) });
    },

    isValidConnection({ source, target, sourceHandle, targetHandle }) {
      const agent = current();
      if (!agent || !source || !target) return false;
      const contextLink = sourceHandle === HANDLES.ctx;
      if (contextLink !== (targetHandle === HANDLES.context)) return false;
      return contextLink || !wouldCreateCycle(agent.flow.edges, source, target);
    },

    onConnect(connection) {
      const agent = current();
      if (!agent || !get().isValidConnection(connection)) return;
      get().checkpoint();
      setFlow({ ...agent.flow, edges: addEdge({ ...connection, id: newId() }, agent.flow.edges) });
    },

    addBlock(data, position) {
      const agent = current();
      if (!agent) return;
      get().checkpoint();
      const { nodes, edges } = agent.flow;
      const id = newId();
      const input = nodes.find((node) => node.data.kind === "input");
      const output = nodes.find((node) => node.data.kind === "output");

      // Documents and memory attach to a model from the side.
      if (data.kind === "knowledge" || data.kind === "memory") {
        const model = nodes.find((node) => node.data.kind === "llm");
        const siblings = model
          ? edges.filter((edge) => edge.target === model.id && edge.targetHandle === HANDLES.context).length
          : 0;
        const spot = position ?? {
          x: (model?.position.x ?? 60) - 330,
          y: (model?.position.y ?? 150) + siblings * 170,
        };
        setFlow({
          nodes: [...nodes, makeNode(id, data, spot.x, spot.y)],
          edges: model
            ? [...edges, { id: newId(), source: id, target: model.id, sourceHandle: HANDLES.ctx, targetHandle: HANDLES.context }]
            : edges,
        });
        set({ selectedNodeId: id, panel: "config" });
        return;
      }

      const middleBlocks = nodes.some((node) => node.data.kind !== "input" && node.data.kind !== "output");

      // Dropped somewhere specific on a canvas that already has blocks: let the user wire it.
      if (position && middleBlocks) {
        setFlow({ nodes: [...nodes, makeNode(id, data, position.x, position.y)], edges });
        set({ selectedNodeId: id, panel: "config" });
        return;
      }

      // Otherwise insert it right before Output, so a click always gives a working flow.
      const before = output ? edges.find((edge) => edge.target === output.id) : undefined;
      const sourceId = before?.source ?? input?.id;
      const source = nodes.find((node) => node.id === sourceId);
      const x = 60;
      const y = (source?.position.y ?? 0) + (source?.data.kind === "input" ? 110 : VERTICAL_GAP);
      const sourceHandle = before?.sourceHandle ?? HANDLES.out;
      const exitHandle = data.kind === "condition" ? HANDLES.yes : HANDLES.out;

      const nextEdges = edges.filter((edge) => edge !== before);
      if (sourceId) {
        nextEdges.push({ id: newId(), source: sourceId, target: id, sourceHandle, targetHandle: HANDLES.in });
      }
      if (output) {
        nextEdges.push({ id: newId(), source: id, target: output.id, sourceHandle: exitHandle, targetHandle: HANDLES.in });
      }
      const nextNodes = nodes.map((node) =>
        node.id === output?.id ? { ...node, position: { x: PILL_X, y: y + VERTICAL_GAP } } : node,
      );
      setFlow({ nodes: [...nextNodes, makeNode(id, data, x, y)], edges: nextEdges });
      set({ selectedNodeId: id, panel: "config" });
    },

    duplicateNode(id) {
      const agent = current();
      const node = agent?.flow.nodes.find((candidate) => candidate.id === id);
      if (!agent || !node) return;
      const data = sanitizeBlockData(clone(node.data));
      if (!data) return;
      get().checkpoint();
      const copy = makeNode(newId(), data, node.position.x + 40, node.position.y + 40);
      setFlow({ ...agent.flow, nodes: [...agent.flow.nodes, copy] });
    },

    deleteNode(id) {
      const agent = current();
      const node = agent?.flow.nodes.find((candidate) => candidate.id === id);
      if (!agent || !node || node.deletable === false) return;
      get().checkpoint();
      setFlow({
        nodes: agent.flow.nodes.filter((candidate) => candidate.id !== id),
        edges: agent.flow.edges.filter((edge) => edge.source !== id && edge.target !== id),
      });
      if (get().selectedNodeId === id) set({ selectedNodeId: null, panel: null });
    },

    updateNodeData(id, patch) {
      const agent = current();
      if (!agent) return;
      setFlow({
        ...agent.flow,
        nodes: agent.flow.nodes.map((node) =>
          node.id === id ? ({ ...node, data: { ...node.data, ...patch } } as BlockNode) : node,
        ),
      });
    },

    checkpoint() {
      const agent = current();
      if (!agent) return;
      set((state) => ({
        undoStack: [...state.undoStack.slice(-(MAX_UNDO - 1)), clone(agent.flow)],
        redoStack: [],
      }));
    },

    undo() {
      const agent = current();
      const previous = get().undoStack.at(-1);
      if (!agent || !previous) return;
      set((state) => ({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, clone(agent.flow)],
        selectedNodeId: null,
      }));
      setFlow(previous);
    },

    redo() {
      const agent = current();
      const next = get().redoStack.at(-1);
      if (!agent || !next) return;
      set((state) => ({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, clone(agent.flow)],
        selectedNodeId: null,
      }));
      setFlow(next);
    },

    saveVersion() {
      const agent = current();
      if (!agent) return;
      const number = Math.max(0, ...agent.versions.map((version) => version.number)) + 1;
      patchCurrent((value) => ({
        currentVersion: number,
        versions: [...value.versions, { number, savedAt: new Date().toISOString(), flow: cleanFlow(value.flow) }],
      }));
      get().showToast(`Saved as version ${number}`);
    },

    restoreVersion(number) {
      const agent = current();
      const version = agent?.versions.find((candidate) => candidate.number === number);
      if (!agent || !version) return;
      get().checkpoint();
      patchCurrent(() => ({ flow: clone(version.flow), currentVersion: number }));
      set({ selectedNodeId: null, panel: null, nodeStatus: {} });
      get().showToast(`Restored version ${number}. Undo brings your changes back.`);
    },

    shareLink() {
      const agent = current();
      if (!agent) return null;
      const payload = {
        name: agent.name,
        description: agent.description,
        suggestions: agent.suggestions,
        flow: cleanFlow(agent.flow),
      };
      const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
      return `${location.origin}${location.pathname}#share=${encoded}`;
    },

    importFromHash(hash) {
      const match = /^#share=(.+)$/.exec(hash);
      if (!match) return false;
      try {
        const payload = JSON.parse(decompressFromEncodedURIComponent(match[1]) ?? "null");
        const flow = sanitizeFlow(payload?.flow);
        if (!flow) throw new Error("Invalid link");
        const text = (value: unknown, fallback: string) => (typeof value === "string" ? value.slice(0, 500) : fallback);
        const suggestions: string[] = Array.isArray(payload.suggestions)
          ? payload.suggestions.filter((item: unknown): item is string => typeof item === "string").slice(0, 6)
          : [];
        const agent = createAgent(text(payload.name, "Shared agent"), text(payload.description, ""), suggestions, flow);
        set((state) => ({ agents: [agent, ...state.agents] }));
        open(agent.id);
        return true;
      } catch {
        get().showToast("That share link is damaged, so it couldn't be opened.");
        return false;
      }
    },

    resetRunView: () => set({ nodeStatus: {} }),
    setChat: (update) => set((state) => ({ chat: update(state.chat) })),
    setNodeStatus: (id, status) => set((state) => ({ nodeStatus: { ...state.nodeStatus, [id]: status } })),
    setRunning: (isRunning) => set({ isRunning }),
    addRunRecord: (record) => patchCurrent((agent) => ({ runs: [record, ...agent.runs].slice(0, MAX_RUNS) })),
    clearChat: () => set({ chat: [], nodeStatus: {} }),
    showToast: (toast) => set({ toast }),
    dismissToast: () => set({ toast: null }),
  };
});

export function useCurrentAgent(): Agent | null {
  return useStore((state) => state.agents.find((agent) => agent.id === state.currentId) ?? null);
}

// Save shortly after changes settle, so dragging doesn't write on every frame.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state, previous) => {
  if (state.agents === previous.agents) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const saved = state.agents.map((agent) => ({ ...agent, flow: cleanFlow(agent.flow) }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      useStore.getState().showToast("Your browser's storage is full, so recent changes weren't saved.");
    }
  }, 400);
});
