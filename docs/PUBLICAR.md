# Cómo publicar Telar

## Publicar en Cloudflare

Hace falta tener la sesión iniciada con `npx wrangler login`.

```bash
npm run deploy
```

La dirección queda como `https://telar.<tu-subdominio>.workers.dev`. No hay secretos ni variables que configurar: Cloudflare conecta los modelos a través del binding `AI` de `wrangler.jsonc`.

## Antes de publicar

```bash
npm test
```

```bash
npm run test:e2e
```

## Después de publicar

1. Abrí la dirección y ejecutá la plantilla **Contract analyzer** sin el modo simulado.
2. Probá **Poster maker** para confirmar que también funcionan las imágenes.

## Controlar el consumo

El consumo de neuronas se ve en el panel de Cloudflare, en la sección de Workers AI. Si se agota, la app sigue funcionando en modo simulado hasta las 00:00 UTC.

## Quitar el sitio

```bash
npx wrangler delete telar
```
