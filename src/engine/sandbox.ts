/**
 * Runs Code blocks in a throwaway Web Worker. Shared links can carry code, so it must not reach
 * the page, cookies or network. The worker has no DOM, the page's security policy blocks its
 * outgoing requests, and a timeout stops infinite loops.
 */
const TIMEOUT_MS = 3_000;

function workerSource(code: string): string {
  return `
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"]) {
  try { Object.defineProperty(self, name, { value: undefined, configurable: false }); } catch {}
}
const userFunction = async (input) => {
${code}
};
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ ok: true, value: await userFunction(data) });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error && error.message || error) });
  }
};`;
}

function stringifyResult(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function runSandboxedCode(code: string, input: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([workerSource(code)], { type: "text/javascript" }));
    const worker = new Worker(url);

    const finish = (done: () => void) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      URL.revokeObjectURL(url);
      done();
    };
    const onAbort = () => finish(() => reject(new DOMException("Stopped", "AbortError")));
    const timer = setTimeout(
      () => finish(() => reject(new Error(`The code took longer than ${TIMEOUT_MS / 1000} seconds.`))),
      TIMEOUT_MS,
    );

    signal?.addEventListener("abort", onAbort);
    worker.onmessage = ({ data }) =>
      finish(() => (data.ok ? resolve(stringifyResult(data.value)) : reject(new Error(data.error))));
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || "The code has a syntax error.")));
    };
    worker.postMessage(input);
  });
}
