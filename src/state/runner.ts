/** Connects the engine to the UI: starts runs, reports progress, and records the result. */
import { httpAi, simulatedAi, AiError } from "../engine/ai";
import { runFlow, type HistoryTurn, type RunEvent } from "../engine/run";
import { runSandboxedCode } from "../engine/sandbox";
import { newId } from "../flow/catalog";
import { useStore, type ChatEntry, type RunStepView } from "./store";

let controller: AbortController | null = null;

export function stopRun(): void {
  controller?.abort();
}

function historyFrom(chat: ChatEntry[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  chat.forEach((entry, index) => {
    const answer = chat[index + 1];
    if (entry.role === "user" && answer?.role === "agent" && answer.text) {
      turns.push({ user: entry.text, assistant: answer.text });
    }
  });
  return turns;
}

export async function startRun(input: string, simulated = false): Promise<void> {
  const store = useStore.getState();
  const agent = store.agents.find((candidate) => candidate.id === store.currentId);
  if (!agent || store.isRunning) return;

  const history = historyFrom(store.chat);
  const agentEntryId = newId();
  store.resetRunView();
  store.setRunning(true);
  store.setChat((chat) => [
    ...chat,
    { id: newId(), role: "user", text: input, images: [], steps: [] },
    { id: agentEntryId, role: "agent", text: "", images: [], steps: [], running: true, simulated, input },
  ]);

  const patchEntry = (patch: (entry: ChatEntry) => Partial<ChatEntry>) =>
    useStore.getState().setChat((chat) =>
      chat.map((entry) => (entry.id === agentEntryId ? { ...entry, ...patch(entry) } : entry)),
    );
  const patchStep = (nodeId: string, patch: (step: RunStepView) => Partial<RunStepView>) =>
    patchEntry((entry) => ({
      steps: entry.steps.map((step) => (step.nodeId === nodeId ? { ...step, ...patch(step) } : step)),
    }));
  const titleOf = (nodeId: string) =>
    String(agent.flow.nodes.find((node) => node.id === nodeId)?.data.title ?? "Block");

  const onEvent = (event: RunEvent) => {
    const { setNodeStatus } = useStore.getState();
    switch (event.type) {
      case "start":
        setNodeStatus(event.nodeId, "running");
        patchEntry((entry) => ({
          live: "",
          steps: [...entry.steps, { nodeId: event.nodeId, title: titleOf(event.nodeId), status: "running", tools: [] }],
        }));
        break;
      case "chunk":
        patchEntry((entry) => ({ live: (entry.live ?? "") + event.text }));
        break;
      case "tool":
        patchStep(event.nodeId, (step) => ({ tools: [...step.tools, event.name] }));
        break;
      case "done":
        setNodeStatus(event.nodeId, "done");
        patchStep(event.nodeId, () => ({
          status: "done",
          ms: event.ms,
          detail: event.output.slice(0, 1_500),
        }));
        break;
      case "skip":
        setNodeStatus(event.nodeId, "skipped");
        patchEntry((entry) => ({
          steps: [...entry.steps, { nodeId: event.nodeId, title: titleOf(event.nodeId), status: "skipped", tools: [] }],
        }));
        break;
      case "error":
        setNodeStatus(event.nodeId, "error");
        patchStep(event.nodeId, () => ({ status: "error", ms: event.ms, detail: event.message }));
        break;
    }
  };

  controller = new AbortController();
  let outputText = "";
  let failure: string | undefined;
  try {
    const result = await runFlow(agent.flow, {
      input,
      ai: simulated ? simulatedAi : httpAi,
      history,
      signal: controller.signal,
      runCode: runSandboxedCode,
      onEvent,
    });
    outputText = result.text;
    patchEntry(() => ({ text: result.text, images: result.images, running: false, live: undefined }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      failure = "Stopped.";
      patchEntry(() => ({ running: false, live: undefined, error: { message: failure as string, code: "stopped" } }));
    } else {
      failure = error instanceof Error ? error.message : String(error);
      const code = error instanceof AiError ? error.code : undefined;
      patchEntry(() => ({ running: false, live: undefined, error: { message: failure as string, code } }));
    }
  } finally {
    controller = null;
    const state = useStore.getState();
    state.setRunning(false);
    const finished = state.chat.find((entry) => entry.id === agentEntryId);
    state.addRunRecord({
      id: agentEntryId,
      at: new Date().toISOString(),
      input: input.slice(0, 500),
      output: (failure ?? outputText).slice(0, 1_000),
      ok: !failure,
      simulated,
      steps: (finished?.steps ?? []).map((step) => ({
        nodeId: step.nodeId,
        title: step.title,
        status: step.status === "running" ? "error" : step.status,
        ms: Math.round(step.ms ?? 0),
      })),
    });
  }
}
