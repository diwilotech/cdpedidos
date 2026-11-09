// Capa común de las apps Diwilo dentro de Pedidos: /api/me, módulos centrales (Finanzas, Marketing, Mensajes, Nómina, Marca, IA, Inicio),
// módulos por negocio asignados por Diwilo, MCP y las páginas del panel (/staff/*). Pedidos conserva sus rutas y su sesión (cdp_sesion);
// esta capa solo las envuelve. Ver CLAUDE.md.
import { Router } from './router.js';
import { HttpError, errorResponse, json } from './lib/http.js';
import { authenticate, loadSession } from './lib/auth.js';
import { CENTRALES } from './lib/modules.js';
import { isCentralApi, centralModuleOf, centralApi, centralPage, centralAsset, centralPublic } from './lib/central.js';
import * as platformModulesApi from './api/platform-modules.js';
import * as meApi from './api/me.js';
import * as settingsApi from './api/settings.js';
import * as mcpApi from './api/mcp.js';

const router = new Router();
for (const mod of [platformModulesApi, meApi, settingsApi, mcpApi]) mod.routes(router);

const SECURITY_HEADERS = { 'x-frame-options': 'SAMEORIGIN', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };
const withHeaders = (res, headers) => { const out = new Response(res.body, res); for (const [k, v] of Object.entries(headers)) out.headers.set(k, v); return out; };

const COMUN = (p) => p === '/api/me' || p.startsWith('/api/settings/') || p.startsWith('/api/ia/') || p === '/api/platform/modules' || p === '/api/platform/modules/sync'
  || /^\/api\/platform\/businesses\/[^/]+\/modules$/.test(p) || /^\/api\/auth\/(logout|password)$/.test(p);

async function handleApi(req, env, ctx, url, legacy) {
  // Salir y cambiar la contraseña desde el panel común: se apoyan en las rutas de siempre de Pedidos
  const mapa = { '/api/auth/logout': '/api/logout', '/api/auth/password': '/api/password' };
  if (mapa[url.pathname]) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido');
    if (req.headers.get('x-app') !== '1') throw new HttpError(403, 'Solicitud no permitida');
    return legacy(mapa[url.pathname], new Request(new URL(mapa[url.pathname], url.origin), req), url);
  }
  const { route, params } = router.match(req.method, url.pathname);
  if (req.method !== 'GET' && route.auth !== 'platform' && req.headers.get('x-app') !== '1') throw new HttpError(403, 'Solicitud no permitida');
  const c = { req, env, ctx, url, params };
  await authenticate(c, route.auth);
  return route.handler(c);
}

// Módulos centrales: la app verifica sesión, negocio, rol, módulo activo y CSRF; Diwilo Modulos hace el resto.
async function handleCentral(req, env, ctx, url) {
  if (req.method !== 'GET' && req.headers.get('x-app') !== '1') throw new HttpError(403, 'Solicitud no permitida');
  const c = { req, env, ctx, url, params: {} };
  await authenticate(c, `tenant:${centralModuleOf(url.pathname)}`);
  if (req.method === 'GET' && /^\/api\/[a-z]+\/mcp$/.test(url.pathname)) return json(await mcpApi.guiaDeModulo(c, centralModuleOf(url.pathname), url.origin));
  return centralApi(c);
}

const aPanel = (url, go) => Response.redirect(`${url.origin}/panel${go ? `?go=${encodeURIComponent(go)}` : ''}`, 302);

// Las pantallas de Pedidos (el punto de venta y el tablero) dentro del panel: los mismos HTML de siempre, con rutas relativas a la raíz.
async function embedPagina(env, req, archivo) {
  const u = new URL(req.url); u.pathname = archivo; u.search = '';
  const res = await env.ASSETS.fetch(new Request(u, { headers: req.headers }));
  return new HTMLRewriter().on('head', { element(e) { e.prepend('<base href="/"><script>window.CDP_EMBED=1;</script>', { html: true }); } }).transform(
    new Response(res.body, { status: res.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }));
}

// Devuelve la respuesta si la ruta es de la capa común; null si es de Citas.
export async function shellFetch(req, env, ctx, legacy) {
  const url = new URL(req.url), p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      if (isCentralApi(p)) return withHeaders(await handleCentral(req, env, ctx, url), SECURITY_HEADERS);
      if (COMUN(p)) return withHeaders(await handleApi(req, env, ctx, url, legacy), SECURITY_HEADERS);
      return null;
    }
    if (p === '/mcp') return withHeaders(await mcpApi.mcpFetch(req, env, ctx), SECURITY_HEADERS);
    if (p.startsWith('/chat/') || p.startsWith('/v1/') || p.startsWith('/wa/')) return withHeaders(await centralPublic(env, url, req), { 'x-content-type-options': 'nosniff' });
    if (p.startsWith('/l/') || p.startsWith('/validar/') || p.startsWith('/c/')) return withHeaders(await centralPublic(env, url, req), SECURITY_HEADERS);
    if (p.startsWith('/m/')) return withHeaders(await centralAsset(env, p), SECURITY_HEADERS);
    // Panel común: /panel (menú + marco). Sin sesión lleva al ingreso de siempre.
    if (p === '/panel' || p === '/panel/') {
      const s = await loadSession(req, env);
      if (!s) return Response.redirect(`${url.origin}/`, 302);
      return withHeaders(await env.ASSETS.fetch(new Request(new URL('/staff/panel', url.origin), req)), { ...SECURITY_HEADERS, 'cache-control': 'no-store' });
    }
    // El propietario entra directo al panel común; el personal sigue en el punto de venta.
    if (p === '/' && req.method === 'GET' && !url.search) {
      const s = await loadSession(req, env);
      if (s && s.rol === 'admin') return Response.redirect(`${url.origin}/panel`, 302);
      return null;
    }
    if (p === '/staff' || p.startsWith('/staff/')) {
      const s = await loadSession(req, env);
      if (!s) return Response.redirect(`${url.origin}/`, 302);
      const page = p.replace(/^\/staff\/?/, '').replace(/\.html$/, '').replace(/\/$/, '');
      if (req.method === 'GET' && req.headers.get('sec-fetch-dest') === 'document' && !p.startsWith('/staff/panel') && (page === '' || p.endsWith('.html'))) return aPanel(url, p + url.search);
      if (page === 'ventas') return withHeaders(await embedPagina(env, req, '/index.html'), SECURITY_HEADERS);
      if (page === 'tablero') {
        if (s.role !== 'owner') return Response.redirect(`${url.origin}/staff/`, 302);
        return withHeaders(await embedPagina(env, req, '/dashboard.html'), SECURITY_HEADERS);
      }
      const central = CENTRALES.find((id) => page === id);
      if (central) return withHeaders(await centralPage(env, req, central), SECURITY_HEADERS);
      return withHeaders(await env.ASSETS.fetch(req), { ...SECURITY_HEADERS, 'cache-control': 'no-store' });
    }
    return null;
  } catch (err) {
    if (p.startsWith('/api/')) return errorResponse(err);
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    return new Response(`<!doctype html><meta charset="utf-8"><title>Acceso</title><body style="font-family:system-ui;padding:2rem"><h1 style="font-size:1.25rem">${status === 404 ? 'Página no encontrada' : 'No se pudo abrir la página'}</h1></body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
}
