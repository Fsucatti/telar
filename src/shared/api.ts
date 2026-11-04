/**
 * Contract shared by the browser and the Worker.
 * To offer another model, add it to MODELS. Check first that it doesn't need a paid plan:
 * https://developers.cloudflare.com/workers-ai/platform/pricing/
 */
export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  /** Whether the model can call tools, which the Agent block needs. */
  tools: boolean;
}

export const MODELS: ModelInfo[] = [
  {
    id: "@cf/zai-org/glm-4.7-flash",
    label: "GLM 4.7 Flash",
    description: "Balanced default. Supports tools.",
    tools: true,
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    label: "Gemma 4 26B",
    description: "Supports tools. Often fast, but it can take over 30 seconds at busy times.",
    tools: true,
  },
  {
    id: "@cf/meta/llama-3.2-3b-instruct",
    label: "Llama 3.2 3B",
    description: "The fastest, for simple text tasks. It can't use tools.",
    tools: false,
  },
];

/** Also decides AI conditions: in testing it classified correctly where Llama 3.2 3B always said NO. */
export const DEFAULT_MODEL = MODELS[0].id;
export const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export type ToolName = "calculator" | "current_datetime" | "search_documents";

/** Tool schemas live on the server side of the contract, so clients can only pick by name. */
export const TOOL_SCHEMAS: Record<ToolName, { description: string; parameters: object }> = {
  calculator: {
    description: "Evaluate an arithmetic expression with + - * / % ^ and parentheses.",
    parameters: {
      type: "object",
      properties: { expression: { type: "string", description: "For example: (12 + 3) * 4" } },
      required: ["expression"],
    },
  },
  current_datetime: {
    description: "Get the current date and time in UTC.",
    parameters: { type: "object", properties: {} },
  },
  search_documents: {
    description: "Search the documents attached to this agent and return the relevant passages.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for" } },
      required: ["query"],
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOL_SCHEMAS) as ToolName[];

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** On assistant messages that asked for tools. */
  toolCalls?: ToolCall[];
  /** On tool messages: the call this answers. */
  toolCallId?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** With tools the answer comes back whole, otherwise it is streamed. */
  tools?: ToolName[];
}

export interface ChatToolResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface ImageRequest {
  prompt: string;
}

export type ApiErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "quota_exhausted"
  | "upstream_error"
  | "forbidden";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export const LIMITS = {
  bodyChars: 60_000,
  messageCount: 40,
  totalMessageChars: 40_000,
  maxTokens: 1024,
  imagePromptChars: 1_500,
};
