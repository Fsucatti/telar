/**
 * The data model of an agent. Everything saved, shared and run uses these types.
 * To add a block: add its data here, then see docs/BLOQUES.md.
 */
import type { Edge, Node } from "@xyflow/react";
import type { ToolName } from "../shared/api";

export interface InputData {
  kind: "input";
  title: string;
}

export interface OutputData {
  kind: "output";
  title: string;
}

/** A language model. With tools enabled it acts as an agent. */
export interface LlmData {
  kind: "llm";
  title: string;
  /** Small label above the title: "Language AI" or "Agent". */
  label: string;
  model: string;
  system: string;
  /** Sent as the user message. `{{input}}` is what the previous block produced. */
  prompt: string;
  temperature: number;
  maxTokens: number;
  tools: ToolName[];
  /** If the answer contains one of these, it's replaced by a refusal. */
  blockedTerms: string[];
}

export interface ImageData {
  kind: "image";
  title: string;
  prompt: string;
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  text: string;
  included: boolean;
}

export interface KnowledgeData {
  kind: "knowledge";
  title: string;
  docs: KnowledgeDoc[];
  /** Passages sent to the model on each run. */
  topK: number;
}

export interface MemoryData {
  kind: "memory";
  title: string;
  /** Previous question-and-answer pairs the model can see. */
  turns: number;
}

export type ConditionMode = "contains" | "regex" | "ai";

export interface ConditionData {
  kind: "condition";
  title: string;
  mode: ConditionMode;
  /** Text to find, pattern to match, or a yes/no question for the model. */
  value: string;
}

export interface TemplateData {
  kind: "template";
  title: string;
  template: string;
}

export interface CodeData {
  kind: "code";
  title: string;
  /** Body of an async function that receives `input` and returns the result. */
  code: string;
}

export type BlockData =
  | InputData
  | OutputData
  | LlmData
  | ImageData
  | KnowledgeData
  | MemoryData
  | ConditionData
  | TemplateData
  | CodeData;

export type BlockKind = BlockData["kind"];

export type BlockNode = Node<BlockData & Record<string, unknown>, "block">;
export type FlowEdge = Edge;

/**
 * Connection points on a block.
 * in/out carry the main text. ctx/context attach documents or memory to a model.
 * true/false are the two exits of a condition.
 */
export const HANDLES = {
  in: "in",
  out: "out",
  ctx: "ctx",
  context: "context",
  yes: "true",
  no: "false",
} as const;

export interface Flow {
  nodes: BlockNode[];
  edges: FlowEdge[];
}

export interface AgentVersion {
  number: number;
  savedAt: string;
  flow: Flow;
}

export interface RunStep {
  nodeId: string;
  title: string;
  status: "done" | "skipped" | "error";
  ms: number;
  detail?: string;
}

export interface RunRecord {
  id: string;
  at: string;
  input: string;
  output: string;
  ok: boolean;
  simulated: boolean;
  steps: RunStep[];
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  /** Example questions shown in the playground. */
  suggestions: string[];
  flow: Flow;
  versions: AgentVersion[];
  /** The version the canvas started from. */
  currentVersion: number;
  runs: RunRecord[];
  updatedAt: string;
}
