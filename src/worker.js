/* ============================================================================
   src/worker.js — El Cloudflare Worker de "cdpedidos"
   ----------------------------------------------------------------------------
   Un Worker es una función que corre en el edge de Cloudflare en CADA
   petición HTTP. No hay servidor que mantener: subís este archivo y ya.

   El objeto que exportás por `default` tiene "handlers". El más común es
   `fetch`, que recibe la petición y devuelve una `Response`.

     fetch(request, env, ctx)
       · request : la petición entrante (Web API estándar: Request)
       · env     : los "bindings" configurados en wrangler.jsonc
                   (aquí: env.ASSETS = los archivos estáticos del sitio;
                    más adelante podrías agregar KV, D1, R2, secrets…)
       · ctx     : utilidades del ciclo de vida (ctx.waitUntil, ctx.passThroughOnException)

   Recordá: gracias a "assets" en wrangler.jsonc, si la URL coincide con un
   archivo real (index.html, /js/app.js, /assets/css/styles.css…) Cloudflare
   lo sirve solo y este código NI se ejecuta. Acá abajo solo llegan las
   rutas que NO son archivos.
   ========================================================================== */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── Ejemplo de ruta dinámica (una mini API) ──────────────────────────
    // Probá: https://cdpedidos.<tu-subdominio>.workers.dev/api/health
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        app: "cdpedidos",
        method: request.method,
        pais: request.cf?.country ?? null, // Cloudflare mete metadatos en request.cf
        hora: new Date().toISOString(),
      });
    }

    // ── Todo lo demás: dejar que respondan los archivos estáticos ─────────
    // (incluye el 404.html si la ruta no existe, por not_found_handling)
    return env.ASSETS.fetch(request);
  },
};
