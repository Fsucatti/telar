# Cómo personalizar Telar

## Cambiar colores

Están al principio de `src/styles.css`, en `:root`. `--accent` es el violeta principal.

## Agregar un modelo

1. Confirmá en la [tabla de precios](https://developers.cloudflare.com/workers-ai/platform/pricing/) que no requiera el plan pago.
2. Agregalo a `MODELS` en `src/shared/api.ts`. Poné `tools: true` solo si puede llamar herramientas.
3. Probalo con `npm run preview`. No alcanza con que responda: mirá cuánto tarda y si acierta.

## Agregar una plantilla

Sumá un objeto a `TEMPLATES` en `src/flow/templates.ts`. Usá nombres y documentos inventados. Las pruebas verifican solas que cada plantilla sea válida y se ejecute.

## Agregar una herramienta para los agentes

1. Sumá su nombre y su esquema a `TOOL_SCHEMAS` en `src/shared/api.ts`.
2. Implementala en `runTool`, dentro de `src/engine/run.ts`.
3. Poné su etiqueta en `TOOL_LABELS`, en `src/ui/ConfigPanel.tsx`.

## Agregar un bloque

Como ejemplo, un bloque que traduce:

1. **Datos:** definí `TranslateData` en `src/flow/types.ts` y sumalo a `BlockData`.
2. **Catálogo:** en `src/flow/catalog.ts`, creá `translateData()`, agregá el bloque a una sección de `CATALOG` y completá `iconFor` y `KIND_LABEL`.
3. **Limpieza:** agregá el caso en `sanitizeBlockData`, en `src/flow/sanitize.ts`. Sin esto, el bloque se pierde al recargar la página.
4. **Ejecución:** agregá el caso en el `switch` de `runFlow`, en `src/engine/run.ts`.
5. **Validación:** si puede quedar mal configurado, sumá el aviso en `validateFlow`.
6. **Tarjeta:** definí sus etiquetas en `chipsFor`, en `src/ui/BlockCard.tsx`.
7. **Configuración:** agregá su formulario en `FormFor`, en `src/ui/ConfigPanel.tsx`.
8. **Pruebas:** sumá un caso en `src/engine/engine.test.ts`.

TypeScript marca como error los `switch` que queden sin completar, así que `npm run check` te avisa si te olvidaste de alguno de los pasos 3 o 7.

## Cambiar los límites

- **Por visitante:** `ratelimits` en `wrangler.jsonc`. El período solo puede ser de 10 o 60 segundos.
- **Tamaño de los pedidos:** `LIMITS` en `src/shared/api.ts`.
