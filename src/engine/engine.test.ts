import { describe, expect, it } from "vitest";
import { codeData, conditionData, imageData, knowledgeData, llmData, memoryData, templateData } from "../flow/catalog";
import { makeNode, sanitizeFlow } from "../flow/sanitize";
import { TEMPLATES, blankFlow } from "../flow/templates";
import { HANDLES, type BlockData, type Flow, type FlowEdge } from "../flow/types";
import type { ChatRequest } from "../shared/api";
import { normalizeToolResponse } from "../../worker/index";
import { parseSseLine, type AiClient } from "./ai";
import { calculate } from "./calculator";
import { searchDocuments, splitIntoPassages } from "./retrieval";
import { renderTemplate, runFlow, validateFlow, wouldCreateCycle, type RunEvent } from "./run";

const input: BlockData = { kind: "input", title: "Input" };
const output: BlockData = { kind: "output", title: "Output" };

function edge(source: string, target: string, sourceHandle: string = HANDLES.out): FlowEdge {
  const context = sourceHandle === HANDLES.ctx;
  return {
    id: `${source}-${target}-${sourceHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle: context ? HANDLES.context : HANDLES.in,
  };
}

function flow(blocks: Record<string, BlockData>, edges: FlowEdge[]): Flow {
  return { nodes: Object.entries(blocks).map(([id, data]) => makeNode(id, data, 0, 0)), edges };
}

/** Answers from a script and records what it was asked. */
function fakeAi(answers: { stream?: string; tools?: { text: string; toolCalls: any[] }[] } = {}) {
  const requests: ChatRequest[] = [];
  const toolReplies = [...(answers.tools ?? [])];
  const ai: AiClient = {
    simulated: true,
    async stream(request, onChunk) {
      requests.push(structuredClone(request));
      const text = answers.stream ?? "model answer";
      onChunk(text);
      return text;
    },
    async chatWithTools(request) {
      requests.push(structuredClone(request));
      return toolReplies.shift() ?? { text: "final answer", toolCalls: [] };
    },
    async image() {
      return "data:image/png;base64,AAAA";
    },
  };
  return { ai, requests };
}

describe("calculator", () => {
  it("follows operator precedence", () => {
    expect(calculate("2 + 3 * 4")).toBe(14);
    expect(calculate("(2 + 3) * 4")).toBe(20);
    expect(calculate("2 ^ 3 ^ 2")).toBe(512);
    expect(calculate("-3 + 10 % 4")).toBe(-1);
    expect(calculate("84000 * .15")).toBeCloseTo(12600);
  });

  it("rejects anything that isn't arithmetic", () => {
    expect(() => calculate("alert(1)")).toThrow();
    expect(() => calculate("2 +")).toThrow();
    expect(() => calculate("1 / 0")).toThrow(/zero/);
    expect(() => calculate("")).toThrow();
    expect(() => calculate("(".repeat(50))).toThrow();
  });
});

describe("document search", () => {
  const docs = [
    { id: "1", name: "a.txt", included: true, text: "Vacation. Employees receive 20 days.\n\nSalary. The salary is paid monthly." },
    { id: "2", name: "b.txt", included: false, text: "Secret. Vacation is unlimited." },
  ];

  it("ranks the matching passage first and ignores excluded documents", () => {
    const found = searchDocuments(docs, "how many vacation days", 1);
    expect(found).toHaveLength(1);
    expect(found[0].docName).toBe("a.txt");
    expect(found[0].text).toContain("Vacation");
    expect(searchDocuments(docs, "unlimited secret", 5).some((item) => item.docName === "b.txt")).toBe(false);
  });

  it("ignores accents and case", () => {
    const spanish = [{ id: "1", name: "c", included: true, text: "La cláusula de vacaciones." }];
    expect(searchDocuments(spanish, "CLAUSULA", 1)[0].score).toBeGreaterThan(0);
  });

  it("falls back to the opening passages when nothing matches", () => {
    expect(searchDocuments(docs, "zzz", 1)).toHaveLength(1);
  });

  it("splits long text without losing any of it", () => {
    const passages = splitIntoPassages("x".repeat(2500));
    expect(passages.join("")).toHaveLength(2500);
    expect(Math.max(...passages.map((passage) => passage.length))).toBeLessThanOrEqual(900);
  });
});

describe("validation", () => {
  it("accepts a connected flow", () => {
    const valid = flow({ i: input, o: output }, [edge("i", "o")]);
    expect(validateFlow(valid).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("reports a disconnected agent", () => {
    const issues = validateFlow(blankFlow());
    expect(issues.some((issue) => issue.severity === "error" && /Connect/.test(issue.message))).toBe(true);
  });

  it("reports empty blocks and bad patterns", () => {
    const broken = flow(
      { i: input, c: conditionData({ mode: "regex", value: "(" }), l: llmData({ prompt: " " }), o: output },
      [edge("i", "c"), edge("c", "l", HANDLES.yes), edge("l", "o")],
    );
    const messages = validateFlow(broken).map((issue) => issue.message).join(" ");
    expect(messages).toMatch(/invalid pattern/);
    expect(messages).toMatch(/no prompt/);
  });

  it("detects cycles before they're created", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
  });

  it("stops a run when the flow has a loop", async () => {
    const looped = flow({ i: input, a: templateData(), b: templateData(), o: output }, [
      edge("i", "a"),
      edge("a", "b"),
      edge("b", "a"),
      edge("b", "o"),
    ]);
    await expect(runFlow(looped, { input: "x", ai: fakeAi().ai })).rejects.toThrow(/loop/);
  });
});

describe("running flows", () => {
  it("replaces every {{input}} and leaves other text alone", () => {
    expect(renderTemplate("{{input}} and {{ input }}, $& {{other}}", "$1")).toBe("$1 and $1, $& {{other}}");
  });

  it("passes text through templates and models to the output", async () => {
    const { ai, requests } = fakeAi({ stream: "answer" });
    const result = await runFlow(
      flow(
        { i: input, t: templateData({ template: "Q: {{input}}" }), l: llmData({ prompt: "Ask {{input}}" }), o: output },
        [edge("i", "t"), edge("t", "l"), edge("l", "o")],
      ),
      { input: "hello", ai },
    );
    expect(result.text).toBe("answer");
    expect(requests[0].messages.at(-1)?.content).toBe("Ask Q: hello");
  });

  it("takes only the branch a condition chose", async () => {
    const events: RunEvent[] = [];
    const branching = flow(
      {
        i: input,
        c: conditionData({ mode: "contains", value: "REFUND" }),
        y: templateData({ template: "yes path" }),
        n: templateData({ template: "no path" }),
        o: output,
      },
      [edge("i", "c"), edge("c", "y", HANDLES.yes), edge("c", "n", HANDLES.no), edge("y", "o"), edge("n", "o")],
    );
    const result = await runFlow(branching, { input: "I want a refund", ai: fakeAi().ai, onEvent: (event) => events.push(event) });
    expect(result.text).toBe("yes path");
    expect(events).toContainEqual({ type: "skip", nodeId: "n" });

    const other = await runFlow(branching, { input: "hi", ai: fakeAi().ai });
    expect(other.text).toBe("no path");
  });

  it("skips everything downstream of a branch not taken", async () => {
    const events: RunEvent[] = [];
    const chain = flow(
      { i: input, c: conditionData({ mode: "contains", value: "x" }), a: templateData(), b: templateData(), o: output },
      [edge("i", "c"), edge("c", "a", HANDLES.yes), edge("a", "b"), edge("c", "o", HANDLES.no), edge("b", "o")],
    );
    await runFlow(chain, { input: "no match", ai: fakeAi().ai, onEvent: (event) => events.push(event) });
    expect(events).toContainEqual({ type: "skip", nodeId: "a" });
    expect(events).toContainEqual({ type: "skip", nodeId: "b" });
  });

  it("asks the model when a condition uses AI", async () => {
    const { ai, requests } = fakeAi({ stream: "YES" });
    const result = await runFlow(
      flow(
        { i: input, c: conditionData({ mode: "ai", value: "Is it money?" }), y: templateData({ template: "money" }), o: output },
        [edge("i", "c"), edge("c", "y", HANDLES.yes), edge("y", "o")],
      ),
      { input: "refund", ai },
    );
    expect(result.text).toBe("money");
    expect(requests[0].messages[1].content).toContain("Is it money?");
  });

  it("adds the relevant passages to the model's context", async () => {
    const { ai, requests } = fakeAi();
    await runFlow(
      flow(
        {
          i: input,
          k: knowledgeData({ docs: [{ id: "1", name: "pets.txt", included: true, text: "Cats sleep all day." }] }),
          l: llmData(),
          o: output,
        },
        [edge("i", "l"), edge("k", "l", HANDLES.ctx), edge("l", "o")],
      ),
      { input: "cats", ai },
    );
    expect(requests[0].messages[0].content).toContain("Cats sleep all day.");
    expect(requests[0].messages[0].content).toContain("[pets.txt]");
  });

  it("includes earlier turns only when memory is attached, up to its limit", async () => {
    const history = [
      { user: "first", assistant: "one" },
      { user: "second", assistant: "two" },
    ];
    const withMemory = fakeAi();
    await runFlow(
      flow({ i: input, m: memoryData({ turns: 1 }), l: llmData({ system: "" }), o: output }, [
        edge("i", "l"),
        edge("m", "l", HANDLES.ctx),
        edge("l", "o"),
      ]),
      { input: "now", ai: withMemory.ai, history },
    );
    expect(withMemory.requests[0].messages.map((message) => message.content)).toEqual(["second", "two", "now"]);

    const without = fakeAi();
    await runFlow(flow({ i: input, l: llmData({ system: "" }), o: output }, [edge("i", "l"), edge("l", "o")]), {
      input: "now",
      ai: without.ai,
      history,
    });
    expect(without.requests[0].messages).toHaveLength(1);
  });

  it("runs tools and feeds the results back to the model", async () => {
    const { ai, requests } = fakeAi({
      tools: [
        { text: "", toolCalls: [{ id: "c1", name: "calculator", arguments: { expression: "6 * 7" } }] },
        { text: "It's 42", toolCalls: [] },
      ],
    });
    const events: RunEvent[] = [];
    const result = await runFlow(
      flow({ i: input, l: llmData({ tools: ["calculator"] }), o: output }, [edge("i", "l"), edge("l", "o")]),
      { input: "6 times 7?", ai, onEvent: (event) => events.push(event) },
    );
    expect(result.text).toBe("It's 42");
    expect(events).toContainEqual({ type: "tool", nodeId: "l", name: "calculator", result: "42" });
    expect(requests[1].messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c1", content: "42" });
  });

  it("reports tool errors to the model instead of failing the run", async () => {
    const { ai, requests } = fakeAi({
      tools: [{ text: "", toolCalls: [{ id: "c1", name: "calculator", arguments: { expression: "alert(1)" } }] }],
    });
    await runFlow(flow({ i: input, l: llmData({ tools: ["calculator"] }), o: output }, [edge("i", "l"), edge("l", "o")]), {
      input: "x",
      ai,
    });
    expect(requests[1].messages.at(-1)?.content).toMatch(/Tool error/);
  });

  it("forces a written answer if a model keeps calling tools", async () => {
    const loop = { text: "", toolCalls: [{ id: "c", name: "current_datetime", arguments: {} }] };
    const { ai } = fakeAi({ stream: "gave up", tools: Array.from({ length: 10 }, () => loop) });
    const result = await runFlow(
      flow({ i: input, l: llmData({ tools: ["current_datetime"] }), o: output }, [edge("i", "l"), edge("l", "o")]),
      { input: "x", ai },
    );
    expect(result.text).toBe("gave up");
  });

  it("withholds answers that contain a blocked term", async () => {
    const { ai } = fakeAi({ stream: "The Secret code is 42" });
    const result = await runFlow(
      flow({ i: input, l: llmData({ blockedTerms: ["secret"] }), o: output }, [edge("i", "l"), edge("l", "o")]),
      { input: "x", ai },
    );
    expect(result.text).toMatch(/withheld/);
    expect(result.text).not.toContain("42");
  });

  it("fails clearly when a model returns nothing", async () => {
    const { ai } = fakeAi({ stream: "" });
    const events: RunEvent[] = [];
    await expect(
      runFlow(flow({ i: input, l: llmData(), o: output }, [edge("i", "l"), edge("l", "o")]), {
        input: "x",
        ai,
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow(/no answer/);
    expect(events.some((event) => event.type === "error" && event.nodeId === "l")).toBe(true);
  });

  it("collects images and passes code results along", async () => {
    const result = await runFlow(
      flow({ i: input, c: codeData({ code: "return input" }), g: imageData(), o: output }, [
        edge("i", "c"),
        edge("c", "g"),
        edge("g", "o"),
      ]),
      { input: "cat", ai: fakeAi().ai, runCode: async (_, value) => value.toUpperCase() },
    );
    expect(result.images).toEqual(["data:image/png;base64,AAAA"]);
    expect(result.text).toBe("CAT");
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runFlow(flow({ i: input, o: output }, [edge("i", "o")]), { input: "x", ai: fakeAi().ai, signal: controller.signal }),
    ).rejects.toThrow();
  });
});

describe("parsing model responses", () => {
  it("reads both streaming formats and skips reasoning", () => {
    expect(parseSseLine('data: {"choices":[{"delta":{"content":"Hi"}}]}')).toBe("Hi");
    expect(parseSseLine('data: {"response":"Hi"}')).toBe("Hi");
    expect(parseSseLine('data: {"choices":[{"delta":{"reasoning":"hmm"}}]}')).toBe("");
    expect(parseSseLine("data: [DONE]")).toBe("");
    expect(parseSseLine("data: {broken")).toBe("");
    expect(parseSseLine(": comment")).toBe("");
  });

  it("reads both tool formats, including malformed arguments", () => {
    expect(
      normalizeToolResponse({
        choices: [{ message: { content: null, tool_calls: [{ id: "a", function: { name: "calculator", arguments: '{"expression":"1"}' } }] } }],
      }).toolCalls[0],
    ).toEqual({ id: "a", name: "calculator", arguments: { expression: "1" } });
    expect(normalizeToolResponse({ response: "ok", tool_calls: [{ name: "x", arguments: "not json" }] })).toEqual({
      text: "ok",
      toolCalls: [{ id: "call_0", name: "x", arguments: {} }],
    });
  });
});

describe("shared links and saved data", () => {
  it("removes unknown blocks, broken connections and invalid settings", () => {
    const cleaned = sanitizeFlow({
      nodes: [
        { id: "i", data: { kind: "input", title: "Input" }, position: { x: 1, y: 2 } },
        { id: "evil", data: { kind: "script", html: "<img onerror=alert(1)>" } },
        { id: "l", data: { kind: "llm", title: "M", model: "paid/model", tools: ["hack", "calculator"], maxTokens: 999999 } },
      ],
      edges: [
        { source: "i", target: "l", sourceHandle: "out", targetHandle: "in" },
        { source: "i", target: "evil", sourceHandle: "out", targetHandle: "in" },
        { source: "i", target: "l", sourceHandle: "bad", targetHandle: "in" },
      ],
    });
    expect(cleaned?.nodes.map((node) => node.id)).toEqual(["i", "l"]);
    expect(cleaned?.edges).toHaveLength(1);
    const model = cleaned?.nodes[1].data as Extract<BlockData, { kind: "llm" }>;
    expect(model.model).not.toBe("paid/model");
    expect(model.tools).toEqual(["calculator"]);
    expect(model.maxTokens).toBe(1024);
  });

  it("rejects data that isn't a flow", () => {
    expect(sanitizeFlow(null)).toBeNull();
    expect(sanitizeFlow({ nodes: "x", edges: [] })).toBeNull();
  });
});

describe("templates", () => {
  it.each(TEMPLATES.map((template) => [template.name, template] as const))("%s is valid and survives saving", async (_, template) => {
    const built = template.build();
    expect(validateFlow(built).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(sanitizeFlow(JSON.parse(JSON.stringify(built)))).toEqual(built);
    expect(template.suggestions.length).toBeGreaterThan(0);
  });

  it.each(TEMPLATES.map((template) => [template.name, template] as const))("%s runs from start to finish", async (_, template) => {
    const { ai } = fakeAi({ stream: "YES answer" });
    const result = await runFlow(template.build(), {
      input: template.suggestions[0],
      ai,
      runCode: async (_, value) => value,
    });
    expect(result.text.length).toBeGreaterThan(0);
  });
});
