/**
 * Ready-made agents shown on the home screen. All names and documents are invented.
 * To add one, follow the same shape: blocks with positions, then their connections.
 */
import { conditionData, codeData, imageData, knowledgeData, llmData, memoryData, newId } from "./catalog";
import { makeNode } from "./sanitize";
import { HANDLES, type BlockData, type Flow, type FlowEdge } from "./types";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  suggestions: string[];
  build: () => Flow;
}

function buildFlow(
  blocks: Record<string, { data: BlockData; x: number; y: number }>,
  links: [from: string, to: string, sourceHandle?: string][],
): Flow {
  const ids = Object.fromEntries(Object.keys(blocks).map((key) => [key, newId()]));
  const nodes = Object.entries(blocks).map(([key, block]) => makeNode(ids[key], block.data, block.x, block.y));
  const edges: FlowEdge[] = links.map(([from, to, sourceHandle]) => {
    const isContext = blocks[from].data.kind === "knowledge" || blocks[from].data.kind === "memory";
    return {
      id: newId(),
      source: ids[from],
      target: ids[to],
      sourceHandle: isContext ? HANDLES.ctx : (sourceHandle ?? HANDLES.out),
      targetHandle: isContext ? HANDLES.context : HANDLES.in,
    };
  });
  return { nodes, edges };
}

/** Centers the 76px Input and Output pills over 240px blocks placed at x = 60. */
export const PILL_X = 142;

const input = (y = 0) => ({ data: { kind: "input", title: "Input" } as BlockData, x: PILL_X, y });
const output = (y: number, x = PILL_X) => ({ data: { kind: "output", title: "Output" } as BlockData, x, y });

const SAMPLE_CONTRACT = `Employment agreement: Northwind Studio and Dana Rivers

1. Position. Dana Rivers joins as Senior Designer, starting March 3, 2026, reporting to the Head of Design.

2. Compensation. The annual salary is USD 84,000, paid monthly. A yearly bonus of up to 10% depends on company results.

3. Probation. The first 90 days are a probation period. During probation, either party may end the agreement with 7 days of written notice.

4. Termination. After probation, either party may end the agreement with 30 days of written notice.

5. Confidentiality. The employee must keep company information confidential during employment and for 2 years afterward.

6. Non-compete. For 6 months after leaving, the employee may not work for a direct competitor in the same city.

7. Intellectual property. Work created as part of the job belongs to the company.

8. Remote work. The employee may work remotely up to 3 days per week.`;

const SAMPLE_POLICY = `Northwind Studio vacation and leave policy

Vacation. Full-time employees receive 20 paid vacation days per year. Up to 5 unused days carry over to the next year.

Sick leave. Employees receive 10 paid sick days per year. A medical note is required after 3 consecutive days.

Parental leave. Primary caregivers receive 16 weeks of paid leave. Secondary caregivers receive 6 weeks.`;

const SAMPLE_RESUME = `Alex Moreno, Frontend Developer

Experience
Frontend Developer at Brightline (2023 to present). Built a React and TypeScript design system used by 4 product teams. Cut page load time by 35% through code splitting.

Junior Developer at Paper Kite (2021 to 2023). Maintained an e-commerce site in Next.js, added automated tests with Playwright, and worked with designers on accessibility fixes.

Skills
React, TypeScript, Next.js, CSS, Playwright, accessibility, REST APIs. Some experience with Node.js. No professional experience with Python or AWS.

Languages
Spanish (native), English (professional).`;

const SAMPLE_REFUNDS = `Lumen Lamps support handbook

Refunds. Customers may return any lamp within 30 days of delivery for a full refund. Refunds reach the original payment method in 5 to 7 business days.

Billing. Duplicate charges are reversed within 2 business days. Invoices are available under Account, then Orders.

Shipping. Standard delivery takes 3 to 5 business days. Express delivery takes 1 to 2 business days.

Repairs. All lamps have a 2-year warranty that covers defects but not accidental damage.`;

const doc = (name: string, text: string) => ({ id: newId(), name, text, included: true });

export const TEMPLATES: AgentTemplate[] = [
  {
    id: "contracts",
    name: "Contract analyzer",
    description: "Answers questions about contracts and policies, then adds a review reminder with code.",
    suggestions: [
      "Highlight the key clauses in the employment agreement",
      "How much notice is needed to resign after probation?",
      "How many vacation days carry over to next year?",
    ],
    build: () =>
      buildFlow(
        {
          input: input(0),
          docs: {
            data: knowledgeData({
              title: "Company contracts",
              docs: [doc("employment-agreement.txt", SAMPLE_CONTRACT), doc("vacation-policy.txt", SAMPLE_POLICY)],
            }),
            x: -270,
            y: 150,
          },
          model: {
            data: llmData({
              title: "Contract expert",
              system:
                "You are a careful contract analyst. Answer only from the documents, and name the clause you rely on. Be brief and answer in the language of the user.",
              maxTokens: 600,
            }),
            x: 60,
            y: 110,
          },
          code: {
            data: codeData({
              title: "Add review note",
              code: 'return input + "\\n\\n_Automated summary: have a lawyer review it before you rely on it._";',
            }),
            x: 60,
            y: 310,
          },
          output: output(480),
        },
        [
          ["input", "model"],
          ["docs", "model"],
          ["model", "code"],
          ["code", "output"],
        ],
      ),
  },
  {
    id: "job-fit",
    name: "Job fit reviewer",
    description: "Compares a job posting with a resume and points out matches and gaps, without inventing experience.",
    suggestions: [
      "Frontend engineer role: React, TypeScript, testing with Playwright, and some AWS.",
      "Backend role requiring Python, Django and five years of AWS.",
    ],
    build: () =>
      buildFlow(
        {
          input: input(0),
          docs: { data: knowledgeData({ title: "Resume", docs: [doc("resume-alex-moreno.txt", SAMPLE_RESUME)] }), x: -270, y: 150 },
          model: {
            data: llmData({
              title: "Fit reviewer",
              system:
                "You compare job postings with the attached resume. Reply with: a fit score from 0 to 10, matching skills, gaps, and one suggestion. Never claim experience the resume doesn't show. Answer in the language of the user.",
              prompt: "Job posting:\n{{input}}",
              maxTokens: 600,
            }),
            x: 60,
            y: 110,
          },
          output: output(320),
        },
        [
          ["input", "model"],
          ["docs", "model"],
          ["model", "output"],
        ],
      ),
  },
  {
    id: "support",
    name: "Support triage",
    description: "An AI condition sends each message down a different path: refunds and billing, or everything else.",
    suggestions: ["I was charged twice for my lamp", "Which lamp would look good in a bedroom?"],
    build: () =>
      buildFlow(
        {
          input: input(0),
          route: {
            data: conditionData({
              title: "Is it about money?",
              mode: "ai",
              value: "Is this message about a refund, a charge, a payment or an invoice?",
            }),
            x: 60,
            y: 110,
          },
          docs: { data: knowledgeData({ title: "Support handbook", docs: [doc("support-handbook.txt", SAMPLE_REFUNDS)] }), x: -420, y: 300 },
          billing: {
            data: llmData({
              title: "Billing specialist",
              system: "You handle billing for Lumen Lamps. Answer with empathy, from the handbook, in three sentences at most, in the language of the user.",
            }),
            x: -110,
            y: 280,
          },
          general: {
            data: llmData({
              title: "Product assistant",
              system: "You are a friendly assistant for Lumen Lamps, a lamp shop. Answer in three sentences at most, in the language of the user.",
            }),
            x: 240,
            y: 280,
          },
          output: output(480),
        },
        [
          ["input", "route"],
          ["route", "billing", HANDLES.yes],
          ["route", "general", HANDLES.no],
          ["docs", "billing"],
          ["billing", "output"],
          ["general", "output"],
        ],
      ),
  },
  {
    id: "research",
    name: "Assistant with tools",
    description: "An agent with memory that decides when to use a calculator, the clock or its documents.",
    suggestions: [
      "What's 15% of the salary in the agreement, per month?",
      "What's today's date, and how many days of vacation do I get?",
      "Now double that number",
    ],
    build: () =>
      buildFlow(
        {
          input: input(0),
          docs: { data: knowledgeData({ title: "Company files", docs: [doc("employment-agreement.txt", SAMPLE_CONTRACT), doc("vacation-policy.txt", SAMPLE_POLICY)] }), x: -270, y: 80 },
          memory: { data: memoryData(), x: -270, y: 240 },
          agent: {
            data: llmData({
              title: "Agent",
              label: "Agent",
              tools: ["calculator", "current_datetime", "search_documents"],
              system:
                "You are a capable assistant. For anything numeric use the calculator instead of doing the math yourself. For company questions use search_documents. Be brief and answer in the language of the user.",
            }),
            x: 60,
            y: 110,
          },
          output: output(320),
        },
        [
          ["input", "agent"],
          ["docs", "agent"],
          ["memory", "agent"],
          ["agent", "output"],
        ],
      ),
  },
  {
    id: "poster",
    name: "Poster maker",
    description: "A language model turns a rough idea into a detailed prompt, and an image model draws it.",
    suggestions: ["A jazz night in Buenos Aires", "A cat astronaut, retro travel poster"],
    build: () =>
      buildFlow(
        {
          input: input(0),
          writer: {
            data: llmData({
              title: "Prompt writer",
              system: "Turn the idea into one vivid English image prompt, under 60 words: subject, style, lighting and colors. Reply with the prompt only.",
              temperature: 0.8,
              maxTokens: 160,
            }),
            x: 60,
            y: 110,
          },
          image: { data: imageData({ title: "Poster" }), x: 60, y: 310 },
          output: output(480),
        },
        [
          ["input", "writer"],
          ["writer", "image"],
          ["image", "output"],
        ],
      ),
  },
];

export function blankFlow(): Flow {
  return buildFlow({ input: input(0), output: output(420) }, []);
}
