/* ============================================================================
   src/worker.js — Cloudflare Worker de "cdpedidos"  ·  multi-restaurante
   ----------------------------------------------------------------------------
   Hace 3 cosas:
     1. Autenticación multi-negocio:
        · /api/signup   -> crea un restaurante (organization) + su admin + sesión
        · /api/login /logout /me
        · /api/personal -> el admin invita personal a SU negocio (auto-registro)
     2. Datos: GET/POST/DELETE /api/bloque  -> tabla `bloques` de D1 (JSON por
        negocio). Requiere sesión; el `org_id` sale de la sesión, nunca del
        cliente. (Fase 3: se suman /api/db/:tabla y endpoints transaccionales.)
     3. Todo lo demás -> archivos estáticos de public/ (env.ASSETS).

   Bindings (wrangler.jsonc):  env.ASSETS -> public/ ,  env.DB -> D1 "cdpedidos-db"

   Seguridad:
     · PIN con PBKDF2-SHA256 (100k) + salt por usuario. Nunca en claro.
     · Sesión = token opaco en `sessions`, cookie HttpOnly.
     · Bloqueo temporal tras 5 intentos fallidos.
     · Aislamiento: toda query filtra por el org_id de la sesión.
   ========================================================================== */

const COOKIE = "cdp_sesion";
const SESION_MS = 30 * 24 * 3600 * 1000; // 30 días
const PBKDF2_ITER = 100000;

/* ---------- helpers HTTP ---------- */
const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
const noContent = (headers) => new Response(null, { status: 204, headers });

async function leerBody(request) {
  try { return await request.json(); } catch { return {}; }
}
function cookies(request) {
  const out = {};
  (request.headers.get("Cookie") || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
const setCookie = (tok) =>
  `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESION_MS / 1000}`;
const delCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* ---------- helpers cripto ---------- */
function randHex(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function hexToBuf(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}
function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function iguales(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function derivarPin(pin, saltHex) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBuf(saltHex), iterations: PBKDF2_ITER, hash: "SHA-256" },
    key, 256
  );
  return bufToHex(bits);
}
const pinValido = (pin) => /^\d{4,8}$/.test(String(pin || ""));
const emailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ""));
const norm = (e) => String(e || "").toLowerCase().trim();

/* ---------- sesión ---------- */
async function crearSesion(env, userId) {
  const token = randHex(32);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, creado_en, expira_en) VALUES (?, ?, ?, ?)"
  ).bind(token, userId, now, now + SESION_MS).run();
  return token;
}
async function usuarioActual(request, env) {
  const tok = cookies(request)[COOKIE];
  if (!tok) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.org_id, u.email, u.nombre, u.rol, u.estado, s.expira_en, o.nombre AS negocio
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = u.org_id
      WHERE s.token = ?`
  ).bind(tok).first();
  if (!row) return null;
  if (row.expira_en < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(tok).run();
    return null;
  }
  if (row.estado !== "activo") return null;
  return row;
}
const publico = (u) => ({ email: u.email, nombre: u.nombre, rol: u.rol, negocio: u.negocio, orgId: u.org_id });

/* ---------- CRUD genérico /api/db/:tabla ----------
   Lista blanca: cada tabla declara sus columnas editables por el cliente y el
   orden por defecto. `id`, `org_id` y `creado_en` los pone el servidor. */
const TABLAS = {
  clientes:  { cols: ["nombre", "telefono", "descripcion"], orden: "nombre COLLATE NOCASE" },
  mov_fiado: { cols: ["cliente_id", "fecha", "tipo", "monto", "concepto", "venta_id", "usuario_id", "usuario_nombre"], orden: "fecha" },
};

async function manejarDb(path, request, env, url) {
  const u = await usuarioActual(request, env);
  if (!u) return json({ error: "no-auth" }, { status: 401 });
  const org = u.org_id;
  const partes = path.split("/").filter(Boolean); // ["api","db","<tabla>", "<id>?"]
  const tabla = partes[2];
  const id = partes[3] || null;
  const def = TABLAS[tabla];
  if (!def) return json({ error: "tabla no permitida" }, { status: 404 });
  const m = request.method;

  if (m === "GET" && !id) {
    const where = ["org_id = ?"];
    const vals = [org];
    for (const c of def.cols) {
      const v = url.searchParams.get(c);
      if (v != null) { where.push(`${c} = ?`); vals.push(v); }
    }
    const { results } = await env.DB.prepare(
      `SELECT * FROM ${tabla} WHERE ${where.join(" AND ")} ORDER BY ${def.orden}`
    ).bind(...vals).all();
    return json({ rows: results });
  }

  if (m === "POST" && !id) {
    const body = await leerBody(request);
    const usa = def.cols.filter((c) => body[c] !== undefined);
    const nid = crypto.randomUUID();
    const campos = ["id", "org_id", ...usa, "creado_en"];
    const marks = campos.map(() => "?").join(", ");
    const vals = [nid, org, ...usa.map((c) => body[c]), Date.now()];
    await env.DB.prepare(`INSERT INTO ${tabla} (${campos.join(", ")}) VALUES (${marks})`).bind(...vals).run();
    const row = await env.DB.prepare(`SELECT * FROM ${tabla} WHERE id = ? AND org_id = ?`).bind(nid, org).first();
    return json({ row });
  }

  if (m === "PATCH" && id) {
    const body = await leerBody(request);
    const usa = def.cols.filter((c) => body[c] !== undefined);
    if (!usa.length) return json({ error: "nada que actualizar" }, { status: 400 });
    const set = usa.map((c) => `${c} = ?`).join(", ");
    const vals = [...usa.map((c) => body[c]), id, org];
    const r = await env.DB.prepare(`UPDATE ${tabla} SET ${set} WHERE id = ? AND org_id = ?`).bind(...vals).run();
    if (!r.meta.changes) return json({ error: "no existe" }, { status: 404 });
    return noContent();
  }

  if (m === "DELETE" && id) {
    await env.DB.prepare(`DELETE FROM ${tabla} WHERE id = ? AND org_id = ?`).bind(id, org).run();
    return noContent();
  }

  return json({ error: "método no soportado" }, { status: 405 });
}

/* ---------- API ---------- */
async function manejarApi(path, request, env, url) {
  const m = request.method;

  /* ---- signup: crea restaurante + su admin + sesión ---- */
  if (path === "/api/signup" && m === "POST") {
    const { email, pin, negocio } = await leerBody(request);
    if (!emailValido(email)) return json({ error: "Correo inválido" }, { status: 400 });
    if (!pinValido(pin)) return json({ error: "PIN inválido (4 a 8 dígitos)" }, { status: 400 });
    if (!String(negocio || "").trim()) return json({ error: "Falta el nombre del restaurante" }, { status: 400 });
    if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(norm(email)).first())
      return json({ error: "Ese correo ya tiene una cuenta. Iniciá sesión." }, { status: 409 });

    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const salt = randHex(16);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO organizations (id, nombre, creado_en) VALUES (?, ?, ?)")
        .bind(orgId, String(negocio).trim(), now),
      env.DB.prepare(
        `INSERT INTO users (id, org_id, email, nombre, rol, pin_hash, pin_salt, estado, creado_en, registrado_en)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, 'activo', ?, ?)`
      ).bind(userId, orgId, norm(email), String(negocio).trim(), await derivarPin(pin, salt), salt, now, now),
    ]);
    const tok = await crearSesion(env, userId);
    return json(
      { user: { email: norm(email), nombre: String(negocio).trim(), rol: "admin", negocio: String(negocio).trim(), orgId } },
      { headers: { "Set-Cookie": setCookie(tok) } }
    );
  }

  /* ---- login ---- */
  if (path === "/api/login" && m === "POST") {
    const { email, pin } = await leerBody(request);
    const generico = json({ error: "Correo o PIN incorrecto" }, { status: 401 });
    const u = await env.DB.prepare(
      `SELECT u.*, o.nombre AS negocio FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = ?`
    ).bind(norm(email)).first();
    if (!u || !u.pin_hash) return generico;
    if (u.estado !== "activo") return json({ error: "Usuario inactivo. Contactá al administrador." }, { status: 403 });
    const ahora = Date.now();
    if (u.bloqueado_hasta && u.bloqueado_hasta > ahora) {
      const min = Math.ceil((u.bloqueado_hasta - ahora) / 60000);
      return json({ error: `Demasiados intentos. Probá en ${min} min.` }, { status: 429 });
    }
    const hash = await derivarPin(pin, u.pin_salt);
    if (!iguales(hash, u.pin_hash)) {
      const fallos = (u.fallos || 0) + 1;
      const bloq = fallos >= 5 ? ahora + 15 * 60 * 1000 : null;
      await env.DB.prepare("UPDATE users SET fallos=?, bloqueado_hasta=? WHERE id=?").bind(fallos, bloq, u.id).run();
      return generico;
    }
    await env.DB.prepare("UPDATE users SET fallos=0, bloqueado_hasta=NULL WHERE id=?").bind(u.id).run();
    const tok = await crearSesion(env, u.id);
    return json({ user: publico(u) }, { headers: { "Set-Cookie": setCookie(tok) } });
  }

  /* ---- logout ---- */
  if (path === "/api/logout" && m === "POST") {
    const tok = cookies(request)[COOKIE];
    if (tok) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(tok).run();
    return json({ ok: true }, { headers: { "Set-Cookie": delCookie } });
  }

  /* ---- me ---- */
  if (path === "/api/me" && m === "GET") {
    const u = await usuarioActual(request, env);
    return u ? json({ user: publico(u) }) : json({ error: "no-auth" }, { status: 401 });
  }

  /* ---- registro por invitación (auto-registro del personal) ---- */
  if (path === "/api/registro") {
    if (m === "GET") {
      const u = await env.DB.prepare(
        `SELECT u.email, u.nombre, o.nombre AS negocio
           FROM users u JOIN organizations o ON o.id = u.org_id
          WHERE u.invite_token = ? AND u.estado = 'pendiente'`
      ).bind(url.searchParams.get("token") || "").first();
      return u ? json(u) : json({ error: "Invitación inválida o ya usada" }, { status: 404 });
    }
    if (m === "POST") {
      const { token, pin, nombre } = await leerBody(request);
      if (!pinValido(pin)) return json({ error: "PIN inválido (4 a 8 dígitos)" }, { status: 400 });
      const u = await env.DB.prepare(
        "SELECT id, nombre FROM users WHERE invite_token = ? AND estado = 'pendiente'"
      ).bind(String(token || "")).first();
      if (!u) return json({ error: "Invitación inválida o ya usada" }, { status: 400 });
      const salt = randHex(16);
      await env.DB.prepare(
        `UPDATE users SET nombre=?, pin_hash=?, pin_salt=?, estado='activo',
                          invite_token=NULL, registrado_en=? WHERE id=?`
      ).bind(String(nombre || "").trim() || u.nombre, await derivarPin(pin, salt), salt, Date.now(), u.id).run();
      const tok = await crearSesion(env, u.id);
      return json({ ok: true }, { headers: { "Set-Cookie": setCookie(tok) } });
    }
  }

  /* ---- gestión de personal (solo admin, y solo de SU negocio) ---- */
  if (path === "/api/personal" || path.startsWith("/api/personal/")) {
    const admin = await usuarioActual(request, env);
    if (!admin) return json({ error: "no-auth" }, { status: 401 });
    if (admin.rol !== "admin") return json({ error: "Solo el administrador" }, { status: 403 });
    const org = admin.org_id;

    if (path === "/api/personal" && m === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, email, nombre, rol, estado, invite_token FROM users WHERE org_id = ? ORDER BY rol DESC, nombre"
      ).bind(org).all();
      return json({
        personal: results.map((r) => ({
          id: r.id, email: r.email, nombre: r.nombre, rol: r.rol, estado: r.estado,
          invite_url: r.invite_token ? `${url.origin}/?registro=${r.invite_token}` : null,
        })),
      });
    }

    if (path === "/api/personal" && m === "POST") {
      const { email, nombre } = await leerBody(request);
      if (!emailValido(email)) return json({ error: "Correo inválido" }, { status: 400 });
      if (!String(nombre || "").trim()) return json({ error: "Falta el nombre" }, { status: 400 });
      if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(norm(email)).first())
        return json({ error: "Ese correo ya está registrado" }, { status: 409 });
      const id = crypto.randomUUID();
      const invite = randHex(16);
      await env.DB.prepare(
        `INSERT INTO users (id, org_id, email, nombre, rol, estado, invite_token, creado_en)
         VALUES (?, ?, ?, ?, 'personal', 'pendiente', ?, ?)`
      ).bind(id, org, norm(email), String(nombre).trim(), invite, Date.now()).run();
      return json({ id, invite_url: `${url.origin}/?registro=${invite}` });
    }

    if (path === "/api/personal/reenviar" && m === "POST") {
      const { id } = await leerBody(request);
      const u = await env.DB.prepare("SELECT id, estado FROM users WHERE id = ? AND org_id = ?").bind(String(id || ""), org).first();
      if (!u) return json({ error: "No existe" }, { status: 404 });
      if (u.estado !== "pendiente") return json({ error: "Ese usuario ya se registró" }, { status: 409 });
      const invite = randHex(16);
      await env.DB.prepare("UPDATE users SET invite_token = ? WHERE id = ?").bind(invite, u.id).run();
      return json({ invite_url: `${url.origin}/?registro=${invite}` });
    }

    if (path === "/api/personal/eliminar" && m === "POST") {
      const { id } = await leerBody(request);
      const u = await env.DB.prepare("SELECT id, rol FROM users WHERE id = ? AND org_id = ?").bind(String(id || ""), org).first();
      if (!u) return json({ error: "No existe" }, { status: 404 });
      if (u.rol === "admin") return json({ error: "No se puede eliminar a un administrador" }, { status: 403 });
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id).run();
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id).run();
      return json({ ok: true });
    }
  }

  /* ---- CRUD relacional genérico ---- */
  if (path.startsWith("/api/db/")) {
    return manejarDb(path, request, env, url);
  }

  /* ---- bloques JSON del negocio (requiere sesión; org_id de la sesión) ---- */
  if (path === "/api/bloque") {
    const u = await usuarioActual(request, env);
    if (!u) return json({ error: "no-auth" }, { status: 401 });
    const org = u.org_id;

    if (m === "GET") {
      const k = url.searchParams.get("key");
      if (!k) return json({ error: "falta key" }, { status: 400 });
      const row = await env.DB.prepare("SELECT valor FROM bloques WHERE org_id = ? AND clave = ?").bind(org, k).first();
      return json({ value: row ? row.valor : null });
    }
    if (m === "POST") {
      const { key, value } = await leerBody(request);
      if (!key) return json({ error: "falta key" }, { status: 400 });
      await env.DB.prepare(
        `INSERT INTO bloques (org_id, clave, valor, ts) VALUES (?, ?, ?, ?)
         ON CONFLICT(org_id, clave) DO UPDATE SET valor = excluded.valor, ts = excluded.ts`
      ).bind(org, key, String(value ?? ""), Date.now()).run();
      return noContent();
    }
    if (m === "DELETE") {
      const k = url.searchParams.get("key");
      if (k) await env.DB.prepare("DELETE FROM bloques WHERE org_id = ? AND clave = ?").bind(org, k).run();
      return noContent();
    }
  }

  return json({ error: "ruta no encontrada" }, { status: 404 });
}

/* ---------- entrypoint ---------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") {
      return json({ ok: true, app: "cdpedidos", hora: new Date().toISOString() });
    }
    if (path.startsWith("/api/")) {
      try {
        return await manejarApi(path, request, env, url);
      } catch (e) {
        return json({ error: "server", detalle: String((e && e.message) || e) }, { status: 500 });
      }
    }
    // "/?registro=..." también cae acá y sirve index.html; el front lee el
    // parámetro y muestra la pantalla de registro.
    return env.ASSETS.fetch(request);
  },
};
