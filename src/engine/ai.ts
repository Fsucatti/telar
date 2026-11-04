/**
 * How the engine talks to models. There are two clients with the same shape:
 * - httpAi calls this app's Worker, which calls Workers AI.
 * - simulatedAi answers locally and is clearly labeled, so demos and tests need no quota.
 */
import type {
  ApiError,
  ApiErrorCode,
  ChatRequest,
  ChatToolResponse,
} from "../shared/api";

export class AiError extends Error {
  constructor(
    readonly code: ApiErrorCode | "network",
    message: string,
  ) {
    super(message);
  }
}

export interface AiClient {
  readonly simulated: boolean;
  /** Streams text through onChunk and resolves with the full text. */
  stream(request: ChatRequest, onChunk: (text: string) => void, signal?: AbortSignal): Promise<string>;
  /** Asks a model that has tools. May return tool calls instead of text. */
  chatWithTools(request: ChatRequest, signal?: AbortSignal): Promise<ChatToolResponse>;
  /** Returns the image as a data URL. */
  image(prompt: string, signal?: AbortSignal): Promise<string>;
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AiError("network", "Couldn't reach the server. Check your connection.");
  }
  if (!response.ok) {
    let failure: Partial<ApiError> = {};
    try {
      failure = (await response.json()) as ApiError;
    } catch {
      // The status code below still tells the user something went wrong.
    }
    throw new AiError(
      failure.code ?? "upstream_error",
      failure.message ?? `The server answered with an error (${response.status}).`,
    );
  }
  return response;
}

/**
 * Extracts answer text from one SSE line. Models send `choices[].delta.content` or `response`.
 * Reasoning deltas are skipped on purpose: only the final answer is shown.
 */
export function parseSseLine(line: string): string {
  if (!line.startsWith("data:")) return "";
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    const data = JSON.parse(payload);
    const content = data.choices?.[0]?.delta?.content;
    if (typeof content === "string") return content;
    return typeof data.response === "string" ? data.response : "";
  } catch {
    return "";
  }
}

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Models sometimes stall at busy times. This turns a stall into a clear error, while the
 * user's Stop button still works through the same signal.
 */
async function withTimeout<T>(signal: AbortSignal | undefined, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  try {
    return await task(signal ? AbortSignal.any([signal, timeout]) : timeout);
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) {
      throw new AiError("upstream_error", "The model took too long to answer. Try again, or choose another model.");
    }
    throw error;
  }
}

export const httpAi: AiClient = {
  simulated: false,

  stream: (request, onChunk, signal) => withTimeout(signal, async (combined) => {
    const response = await post("/api/chat", request, combined);
    const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
    if (!reader) throw new AiError("upstream_error", "The server sent an empty answer.");

    let full = "";
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const text = parseSseLine(line);
        if (text) {
          full += text;
          onChunk(text);
        }
      }
    }
    const rest = parseSseLine(buffer);
    if (rest) {
      full += rest;
      onChunk(rest);
    }
    return full;
  }),

  chatWithTools: (request, signal) => withTimeout(signal, async (combined) => {
    const response = await post("/api/chat", request, combined);
    return (await response.json()) as ChatToolResponse;
  }),

  image: (prompt, signal) => withTimeout(signal, async (combined) => {
    const response = await post("/api/image", { prompt }, combined);
    const data = (await response.json()) as { image: string };
    return data.image;
  }),
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A labeled placeholder picture, so simulated runs still show the flow working. */
function placeholderImage(prompt: string): string {
  const label = prompt
    .slice(0, 48)
    .replace(/[<>&'"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c7d2fe"/><stop offset="1" stop-color="#fbcfe8"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><text x="256" y="245" font-family="sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="#312e81">Simulated image</text><text x="256" y="280" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#4338ca">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const simulatedAi: AiClient = {
  simulated: true,

  async stream(request, onChunk, signal) {
    const lastUser = [...request.messages].reverse().find((message) => message.role === "user");
    const hasDocuments = request.messages.some(
      (message) => message.role === "system" && message.content.includes("<documents>"),
    );
    if (request.messages[0]?.content.includes("Answer only YES or NO")) {
      onChunk("YES");
      return "YES";
    }
    const preview = (lastUser?.content ?? "").replace(/\s+/g, " ").slice(0, 140);
    const text =
      `[Simulated answer: no AI model was used.] This block received: "${preview}".` +
      (hasDocuments ? " Its attached documents were included as context." : "");
    let full = "";
    for (const word of text.split(/(?<= )/)) {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      await wait(12);
      full += word;
      onChunk(word);
    }
    return full;
  },

  async chatWithTools(request, signal) {
    let text = "";
    const noCalls = { text: "", toolCalls: [] };
    text = await this.stream({ ...request, tools: [] }, () => undefined, signal);
    return { ...noCalls, text };
  },

  async image(prompt) {
    await wait(300);
    return placeholderImage(prompt);
  },
};
