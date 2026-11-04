# Telar

Constructor visual de agentes de IA. Arrastrás bloques a un lienzo, los conectás y ejecutás el agente con modelos reales, sin registrarte. Funciona entero en el plan gratuito de Cloudflare.

**Diseño:** Julian Sucatti. **Desarrollo:** Francisco Sucatti.

## Qué hace

| Bloque | Función | Dónde corre |
|---|---|---|
| Language | Responde con un modelo de texto | Workers AI |
| Agent | Modelo que decide cuándo usar herramientas: calculadora, fecha y búsqueda en documentos | Workers AI y navegador |
| Image generation | Genera imágenes con FLUX Schnell | Workers AI |
| Documents | Busca los pasajes relevantes de tus archivos de texto y se los pasa al modelo | Navegador |
| Conversation | Le da memoria de los turnos anteriores a un modelo | Navegador |
| Condition | Divide el flujo en dos caminos por texto, patrón o decisión de la IA | Navegador, o Workers AI si decide la IA |
| Text template | Combina texto con `{{input}}` | Navegador |
| JavaScript | Ejecuta código propio en un entorno aislado | Navegador |

También tiene versiones, deshacer y rehacer, enlaces para compartir, historial de ejecuciones y un modo simulado que no gasta cuota. Los agentes se guardan en el navegador de cada persona: no hay cuentas ni base de datos.

## Requisitos

- Node.js 22 o superior.
- Sesión de Cloudflare iniciada con `npx wrangler login`, para usar los modelos en local.
- Microsoft Edge, solo para las pruebas de punta a punta en Windows.

## Puesta en marcha

```bash
npm install
```

```bash
npm run preview
```

Abre <http://localhost:8787>. Es lo más parecido a producción, y las llamadas a la IA son reales y descuentan de la cuota gratuita de tu cuenta.

Para editar la interfaz con recarga automática, dejá corriendo la API en una terminal y la interfaz en otra. La interfaz queda en <http://localhost:5173>. Si la API todavía no se compiló nunca, corré `npm run build` antes.

```bash
npm run dev:api
```

```bash
npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Interfaz con recarga automática |
| `npm run dev:api` | API local en el puerto 8787 |
| `npm run check` | Revisa los tipos de TypeScript |
| `npm test` | Pruebas del motor. No usan red ni cuota |
| `npm run test:e2e` | Compila y prueba en el navegador. La IA va simulada o interceptada, sin gastar cuota |
| `npm run build` | Revisa los tipos y genera el sitio en `dist/` |
| `npm run preview` | Compila y sirve todo como en Cloudflare |
| `npm run deploy` | Compila y publica en Cloudflare |

## Dónde está cada cosa

```text
worker/index.ts       API: valida pedidos, aplica límites y llama a los modelos
src/
  shared/api.ts       Modelos disponibles, herramientas y límites
  engine/run.ts       Motor: ordena y ejecuta los bloques, sin React
  engine/ai.ts        Cliente real y cliente simulado
  engine/retrieval.ts Búsqueda en documentos con BM25
  engine/sandbox.ts   Entorno aislado para el bloque de código
  engine/calculator.ts Calculadora sin eval
  flow/types.ts       Modelo de datos de un agente
  flow/catalog.ts     Bloques del panel izquierdo y sus valores iniciales
  flow/templates.ts   Plantillas de la pantalla inicial
  flow/sanitize.ts    Limpia datos que vienen de enlaces o del navegador
  state/store.ts      Estado de la app y guardado
  state/runner.ts     Conecta el motor con la interfaz
  ui/                 Componentes de la interfaz
  styles.css          Colores y estilos. Los colores están al principio
tests/smoke.spec.ts   Pruebas de escritorio y móvil
wrangler.jsonc        Configuración de Cloudflare
```

## Cómo se mantiene gratis

- **Cuota:** el plan gratuito incluye [10.000 neuronas por día](https://developers.cloudflare.com/workers-ai/platform/pricing/). Al superarlas, las llamadas fallan con un error y no se cobra nada. El contador vuelve a cero a las 00:00 UTC.
- **Consumo medido:** una respuesta de tres oraciones con GLM 4.7 Flash gastó alrededor de 2 neuronas.
- **Sin razonamiento:** la API lo desactiva, porque GLM gastaba 400 tokens en razonar y no llegaba a contestar un saludo.
- **Límites por visitante:** 20 pedidos de texto y 4 imágenes por minuto. Están en `wrangler.jsonc`.
- **Al agotarse la cuota:** la app lo explica y ofrece seguir con respuestas simuladas, marcadas como tales.

Esto supone una cuenta en el plan Workers Free. En el plan pago, lo que supere la cuota gratuita sí se cobra.

## Seguridad

- **Datos:** los documentos quedan en el navegador. Al modelo solo le llegan los pasajes relevantes y, si compartís un enlace, el enlace incluye los documentos completos.
- **Código de terceros:** un enlace compartido puede traer código. Solo se ejecuta al correr el agente, dentro de un Web Worker sin acceso a la página ni a la red, y se corta a los 3 segundos.
- **Respuestas de los modelos:** se muestran como texto, sin interpretar HTML.
- **Enlaces:** al abrirlos se descarta todo lo que no sea un bloque o una conexión válidos.
- **API:** solo acepta los modelos y herramientas de la lista, rechaza pedidos de otros sitios y limita el tamaño.

## Diferencias con el diseño original

- **Sin construir:** los bloques Vision, Image edit y Video aparecen en gris, y falta la pestaña Compare del panel de pruebas.
- **Cambios:** el bloque de código usa JavaScript en lugar de Python, y "Set to active" pasó a ser "Share".
- **Solo texto:** Documents acepta archivos de texto, no PDF.

## Más documentación

- [Cómo agregar un bloque, un modelo o una plantilla](docs/PERSONALIZAR.md)
- [Cómo publicarlo](docs/PUBLICAR.md)
