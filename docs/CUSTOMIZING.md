# How to customize Telar

## Change the colors

They're at the top of `src/styles.css`, under `:root`. `--accent` is the main purple.

## Add a model

1. Pick a text model from the [Workers AI catalog](https://developers.cloudflare.com/workers-ai/models/).
2. Add it to `MODELS` in `src/shared/api.ts`. Set `tools: true` only if it can call tools.
3. Try it with `npm run preview`. Getting an answer isn't enough: check how long it takes and whether it's right.

## Add a template

Add an object to `TEMPLATES` in `src/flow/templates.ts`, with made-up names and documents. The tests automatically check that every template is valid and runs.

## Add a tool for agents

1. Add its name and schema to `TOOL_SCHEMAS` in `src/shared/api.ts`.
2. Implement it in `runTool`, in `src/engine/run.ts`.
3. Add its label to `TOOL_LABELS`, in `src/ui/ConfigPanel.tsx`.

## Add a block

Using a translation block as an example:

1. **Data:** define `TranslateData` in `src/flow/types.ts` and add it to `BlockData`.
2. **Catalog:** in `src/flow/catalog.ts`, create `translateData()`, add the block to a section of `CATALOG`, and fill in `iconFor` and `KIND_LABEL`.
3. **Cleanup:** add its case to `sanitizeBlockData`, in `src/flow/sanitize.ts`. Without this, the block disappears when the page reloads.
4. **Execution:** add its case to the `switch` in `runFlow`, in `src/engine/run.ts`.
5. **Validation:** if it can be misconfigured, add the warning to `validateFlow`.
6. **Card:** define its labels in `chipsFor`, in `src/ui/BlockCard.tsx`.
7. **Settings:** add its form to `FormFor`, in `src/ui/ConfigPanel.tsx`.
8. **Tests:** add a case to `src/engine/engine.test.ts`.
