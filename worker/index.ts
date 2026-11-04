/**
 * Thin API between the browser and Workers AI. Flows run in the browser;
 * this only validates requests, applies limits and calls the models.
 */
import {
  IMAGE_MODEL,
  LIMITS,
  MODELS,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  type ApiError,
  type ApiErrorCode,
  type ChatMessage,
  type ChatRequest,
  type ChatToolResponse,
  type ToolCall,
  type ToolName,
} from "../src/shared/api";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  AI: { run(model: string, input: unknown): Promise<unknown> };
  ASSETS: { fetch(request: Request): Promise<Response> };
  CHAT_LIMIT: RateLimiter;
  IMAGE_LIMIT: RateLimiter;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Browsers send Origin on POST. Other sites can't spend this app's allowance from their pages. */
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "forbidden", "Requests from other sites aren't allowed.");
  }
}

async function assertWithinLimit(limiter: RateLimiter, request: Request): Promise<void> {
  // Visitors have no accounts, so the address is the only available key.
  const key = request.headers.get("cf-connecting-ip") ?? "local";
  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new HttpError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > LIMITS.bodyChars) {
    throw new HttpError(413, "invalid_request", "The request is too large.");
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Reported below.
  }
  throw new HttpError(400, "invalid_request", "The request isn't valid JSON.");
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function parseChatRequest(body: Record<string, unknown>): ChatRequest {
  const invalid = (message: string) => new HttpError(400, "invalid_request", message);

  const model = MODELS.find((candidate) => candidate.id === body.model);
  if (!model) throw invalid("Unknown model.");

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw invalid("Messages are required.");
  }
  if (body.messages.length > LIMITS.messageCount) throw invalid("Too many messages.");

  let totalChars = 0;
  const messages = body.messages.map((raw): ChatMessage => {
    const message = raw as Partial<ChatMessage>;
    if (!["system", "user", "assistant", "tool"].includes(String(message.role))) {
      throw invalid("Invalid message role.");
    }
    if (typeof message.content !== "string") throw invalid("Message content must be text.");
    totalChars += message.content.length;
    return message as ChatMessage;
  });
  if (totalChars > LIMITS.totalMessageChars) throw invalid("The conversation is too long.");

  const tools = Array.isArray(body.tools)
    ? body.tools.filter((tool): tool is ToolName => TOOL_NAMES.includes(tool as ToolName))
    : [];
  if (tools.length > 0 && !model.tools) throw invalid("This model can't use tools.");

  return {
    model: model.id,
    messages,
    tools,
    temperature: clamp(body.temperature, 0, 1.5, 0.4),
    maxTokens: Math.round(clamp(body.maxTokens, 16, LIMITS.maxTokens, 512)),
  };
}

/** Our message format to the OpenAI-style one Workers AI expects. */
function toModelMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // A model can produce malformed arguments. The tool then reports what's missing.
    }
  }
  return {};
}

/** Models answer in one of two shapes: `{response, tool_calls}` or OpenAI's `choices`. */
export function normalizeToolResponse(raw: unknown): ChatToolResponse {
  const data = (raw ?? {}) as Record<string, any>;
  const message = data.choices?.[0]?.message;
  const text: unknown = message?.content ?? data.response ?? "";
  const calls: any[] = message?.tool_calls ?? data.tool_calls ?? [];
  const toolCalls: ToolCall[] = calls.map((call, index) => ({
    id: String(call.id ?? `call_${index}`),
    name: String(call.function?.name ?? call.name ?? ""),
    arguments: parseArguments(call.function?.arguments ?? call.arguments),
  }));
  return { text: typeof text === "string" ? text : JSON.stringify(text), toolCalls };
}

function mapUpstreamError(error: unknown): HttpError {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Workers AI error:", message);
  if (/4006|neurons|allocation/i.test(message)) {
    return new HttpError(
      429,
      "quota_exhausted",
      "Today's free AI allowance is used up. It resets at 00:00 UTC.",
    );
  }
  if (/3040|capacity|rate limit/i.test(message)) {
    return new HttpError(429, "rate_limited", "The model is busy. Try again in a moment.");
  }
  return new HttpError(502, "upstream_error", "The model couldn't answer. Try again.");
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  assertSameOrigin(request);
  await assertWithinLimit(env.CHAT_LIMIT, request);
  const chat = parseChatRequest(await readJson(request));
  const input = {
    messages: toModelMessages(chat.messages),
    temperature: chat.temperature,
    max_tokens: chat.maxTokens,
    // Reasoning spends the token budget before any answer appears, and the daily allowance with it.
    chat_template_kwargs: { enable_thinking: false },
  };

  try {
    if (chat.tools?.length) {
      const tools = chat.tools.map((name) => ({
        type: "function",
        function: { name, ...TOOL_SCHEMAS[name] },
      }));
      const raw = await env.AI.run(chat.model, { ...input, tools });
      return jsonResponse(normalizeToolResponse(raw));
    }
    const stream = await env.AI.run(chat.model, { ...input, stream: true });
    return new Response(stream as ReadableStream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    });
  } catch (error) {
    throw mapUpstreamError(error);
  }
}

async function handleImage(request: Request, env: Env): Promise<Response> {
  assertSameOrigin(request);
  await assertWithinLimit(env.IMAGE_LIMIT, request);
  const body = await readJson(request);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > LIMITS.imagePromptChars) {
    throw new HttpError(400, "invalid_request", "The image prompt is empty or too long.");
  }
  try {
    const raw = (await env.AI.run(IMAGE_MODEL, { prompt, steps: 4 })) as { image?: string };
    if (!raw.image) throw new Error("The image model returned nothing.");
    return jsonResponse({ image: `data:image/jpeg;base64,${raw.image}` });
  } catch (error) {
    throw mapUpstreamError(error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/api/chat" && request.method === "POST") {
        return await handleChat(request, env);
      }
      if (pathname === "/api/image" && request.method === "POST") {
        return await handleImage(request, env);
      }
      if (pathname.startsWith("/api/")) {
        throw new HttpError(404, "invalid_request", "Unknown endpoint.");
      }
      return await env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) {
        const body: ApiError = { code: error.code, message: error.message };
        return jsonResponse(body, error.status);
      }
      console.error("Unexpected error:", error);
      const body: ApiError = { code: "upstream_error", message: "Something went wrong." };
      return jsonResponse(body, 500);
    }
  },
};
