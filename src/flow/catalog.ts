/**
 * The blocks offered in the left panel, and the defaults each one starts with.
 * Blocks with `available: false` appear greyed out, as in the design.
 */
import {
  Bot,
  Braces,
  Brain,
  Code2,
  Eye,
  FileText,
  GitBranch,
  ImageIcon,
  ImagePlus,
  MessageSquareText,
  Video,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_MODEL, type ToolName } from "../shared/api";
import type { BlockData, BlockKind, CodeData, ConditionData, ImageData, KnowledgeData, LlmData, MemoryData, TemplateData } from "./types";

export function newId(): string {
  return crypto.randomUUID();
}

export function llmData(overrides: Partial<LlmData> = {}): LlmData {
  return {
    kind: "llm",
    title: "Language AI",
    label: "Language AI",
    model: DEFAULT_MODEL,
    system: "You are a helpful assistant. Answer clearly, in the language of the user.",
    prompt: "{{input}}",
    temperature: 0.4,
    maxTokens: 512,
    tools: [],
    blockedTerms: [],
    ...overrides,
  };
}

export function imageData(overrides: Partial<ImageData> = {}): ImageData {
  return { kind: "image", title: "Image generation", prompt: "{{input}}", ...overrides };
}

export function knowledgeData(overrides: Partial<KnowledgeData> = {}): KnowledgeData {
  return { kind: "knowledge", title: "Documents", docs: [], topK: 4, ...overrides };
}

export function memoryData(overrides: Partial<MemoryData> = {}): MemoryData {
  return { kind: "memory", title: "Conversation memory", turns: 5, ...overrides };
}

export function conditionData(overrides: Partial<ConditionData> = {}): ConditionData {
  return { kind: "condition", title: "Condition", mode: "contains", value: "", ...overrides };
}

export function templateData(overrides: Partial<TemplateData> = {}): TemplateData {
  return { kind: "template", title: "Text template", template: "{{input}}", ...overrides };
}

export function codeData(overrides: Partial<CodeData> = {}): CodeData {
  return {
    kind: "code",
    title: "JavaScript",
    code: "// `input` holds the previous block's text. Return the result.\nreturn input.trim();",
    ...overrides,
  };
}

const ALL_TOOLS: ToolName[] = ["calculator", "current_datetime", "search_documents"];

export interface CatalogItem {
  id: string;
  label: string;
  /** Short note under the label. */
  hint: string;
  icon: LucideIcon;
  available: boolean;
  /** Greyed-out items have no block to create. */
  create?: () => BlockData;
}

export interface CatalogSection {
  id: string;
  label: string;
  icon: LucideIcon;
  items: CatalogItem[];
}

export const CATALOG: CatalogSection[] = [
  {
    id: "models",
    label: "Models",
    icon: Brain,
    items: [
      { id: "language", label: "Language", hint: "Text → Text", icon: MessageSquareText, available: true, create: () => llmData() },
      { id: "image-generation", label: "Image generation", hint: "Text → Image", icon: ImageIcon, available: true, create: () => imageData() },
      { id: "vision", label: "Vision", hint: "Coming soon", icon: Eye, available: false },
      { id: "image-edit", label: "Image edit", hint: "Coming soon", icon: ImagePlus, available: false },
      { id: "video", label: "Video", hint: "Coming soon", icon: Video, available: false },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    icon: FileText,
    items: [{ id: "documents", label: "Documents", hint: "Answer from your files", icon: FileText, available: true, create: () => knowledgeData() }],
  },
  {
    id: "logic",
    label: "Flow logic",
    icon: GitBranch,
    items: [
      { id: "condition", label: "Condition", hint: "Split into two paths", icon: GitBranch, available: true, create: () => conditionData() },
      { id: "template", label: "Text template", hint: "Combine text", icon: Braces, available: true, create: () => templateData() },
    ],
  },
  {
    id: "memory",
    label: "Memory",
    icon: Brain,
    items: [{ id: "conversation", label: "Conversation", hint: "Remember earlier turns", icon: Brain, available: true, create: () => memoryData() }],
  },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    items: [
      {
        id: "agent",
        label: "Agent",
        hint: "A model that uses tools",
        icon: Bot,
        available: true,
        create: () =>
          llmData({
            title: "Agent",
            label: "Agent",
            tools: ALL_TOOLS,
            system: "You are a capable assistant. Use your tools whenever they give a more reliable answer than guessing. Answer in the language of the user.",
          }),
      },
    ],
  },
  {
    id: "code",
    label: "Code blocks",
    icon: Code2,
    items: [{ id: "javascript", label: "JavaScript", hint: "Runs in a sandbox", icon: Code2, available: true, create: () => codeData() }],
  },
];

export function iconFor(data: BlockData): LucideIcon {
  const icons: Record<BlockKind, LucideIcon> = {
    input: MessageSquareText,
    output: MessageSquareText,
    llm: data.kind === "llm" && data.tools.length > 0 ? Bot : MessageSquareText,
    image: ImageIcon,
    knowledge: FileText,
    memory: Brain,
    condition: GitBranch,
    template: Braces,
    code: Code2,
  };
  return icons[data.kind];
}

export const KIND_LABEL: Record<BlockKind, string> = {
  input: "Input",
  output: "Output",
  llm: "Language AI",
  image: "Image generation",
  knowledge: "Data source",
  memory: "Memory",
  condition: "Flow logic",
  template: "Flow logic",
  code: "Code block",
};
