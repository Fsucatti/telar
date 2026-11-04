/**
 * Cleans a flow that comes from outside the running app: a shared link or browser storage.
 * Anything unknown is dropped, so a crafted link can't inject unexpected data.
 */
import { MODELS, TOOL_NAMES, DEFAULT_MODEL, type ToolName } from "../shared/api";
import { codeData, conditionData, imageData, knowledgeData, llmData, memoryData, newId, templateData } from "./catalog";
import { HANDLES, type BlockData, type BlockNode, type Flow, type FlowEdge, type KnowledgeDoc } from "./types";

const text = (value: unknown, fallback: string, max = 20_000) =>
  typeof value === "string" ? value.slice(0, max) : fallback;

const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function sanitizeDocs(value: unknown): KnowledgeDoc[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((raw): KnowledgeDoc[] => {
    if (!raw || typeof raw !== "object") return [];
    const doc = raw as Record<string, unknown>;
    return [
      {
        id: text(doc.id, newId(), 80),
        name: text(doc.name, "Document", 200),
        text: text(doc.text, "", 400_000),
        included: doc.included !== false,
      },
    ];
  });
}

export function sanitizeBlockData(raw: unknown): BlockData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const title = (fallback: string) => text(data.title, fallback, 120);

  switch (data.kind) {
    case "input":
      return { kind: "input", title: title("Input") };
    case "output":
      return { kind: "output", title: title("Output") };
    case "llm": {
      const base = llmData();
      const model = MODELS.find((candidate) => candidate.id === data.model) ?? MODELS.find((m) => m.id === DEFAULT_MODEL);
      const tools = Array.isArray(data.tools)
        ? data.tools.filter((tool): tool is ToolName => TOOL_NAMES.includes(tool as ToolName))
        : [];
      return {
        kind: "llm",
        title: title(base.title),
        label: text(data.label, base.label, 40),
        model: model?.id ?? DEFAULT_MODEL,
        system: text(data.system, base.system),
        prompt: text(data.prompt, base.prompt),
        temperature: number(data.temperature, base.temperature, 0, 1.5),
        maxTokens: Math.round(number(data.maxTokens, base.maxTokens, 16, 1024)),
        tools: model?.tools ? tools : [],
        blockedTerms: Array.isArray(data.blockedTerms)
          ? data.blockedTerms.filter((term): term is string => typeof term === "string").slice(0, 50)
          : [],
      };
    }
    case "image": {
      const base = imageData();
      return { kind: "image", title: title(base.title), prompt: text(data.prompt, base.prompt) };
    }
    case "knowledge": {
      const base = knowledgeData();
      return {
        kind: "knowledge",
        title: title(base.title),
        docs: sanitizeDocs(data.docs),
        topK: Math.round(number(data.topK, base.topK, 1, 10)),
      };
    }
    case "memory": {
      const base = memoryData();
      return { kind: "memory", title: title(base.title), turns: Math.round(number(data.turns, base.turns, 1, 15)) };
    }
    case "condition": {
      const base = conditionData();
      const mode = data.mode === "regex" || data.mode === "ai" ? data.mode : "contains";
      return { kind: "condition", title: title(base.title), mode, value: text(data.value, "", 1_000) };
    }
    case "template": {
      const base = templateData();
      return { kind: "template", title: title(base.title), template: text(data.template, base.template) };
    }
    case "code": {
      const base = codeData();
      return { kind: "code", title: title(base.title), code: text(data.code, base.code) };
    }
    default:
      return null;
  }
}

export function makeNode(id: string, data: BlockData, x: number, y: number): BlockNode {
  const fixed = data.kind === "input" || data.kind === "output";
  return {
    id,
    type: "block",
    position: { x, y },
    data: data as BlockNode["data"],
    deletable: !fixed,
  };
}

export function sanitizeFlow(raw: unknown): Flow | null {
  if (!raw || typeof raw !== "object") return null;
  const { nodes: rawNodes, edges: rawEdges } = raw as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) return null;

  const nodes = rawNodes.slice(0, 200).flatMap((value): BlockNode[] => {
    const node = value as { id?: unknown; data?: unknown; position?: { x?: unknown; y?: unknown } };
    const data = sanitizeBlockData(node?.data);
    if (!data || typeof node.id !== "string") return [];
    return [makeNode(node.id.slice(0, 80), data, number(node.position?.x, 0, -1e5, 1e5), number(node.position?.y, 0, -1e5, 1e5))];
  });

  const ids = new Set(nodes.map((node) => node.id));
  const handles = new Set<string>(Object.values(HANDLES));
  const edges = rawEdges.slice(0, 400).flatMap((value): FlowEdge[] => {
    const edge = value as Record<string, unknown>;
    const { source, target, sourceHandle, targetHandle } = edge ?? {};
    if (
      typeof source !== "string" ||
      typeof target !== "string" ||
      !ids.has(source) ||
      !ids.has(target) ||
      !handles.has(String(sourceHandle)) ||
      !handles.has(String(targetHandle))
    ) {
      return [];
    }
    return [
      {
        id: typeof edge.id === "string" ? edge.id.slice(0, 200) : newId(),
        source,
        target,
        sourceHandle: String(sourceHandle),
        targetHandle: String(targetHandle),
      },
    ];
  });

  return { nodes, edges };
}
