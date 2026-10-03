/* ============================================================================
   src/worker.js — Cloudflare Worker de "cdpedidos"  ·  multi-restaurante
   ----------------------------------------------------------------------------
   Hace 4 cosas:
     1. Autenticación multi-negocio (correo + contraseña):
        · /api/login /logout /me
        · /api/registro -> la persona invitada crea su contraseña con el link
        · /api/personal -> el admin invita personal a SU negocio
     2. Plataforma: /api/platform/* -> Diwilo Web crea negocios, invita dueños
        y fija hasta cuándo está paga la suscripción (Bearer PLATFORM_KEY).
     3. Datos: GET/POST/DELETE /api/bloque  -> tabla `bloques` de D1 (JSON por
        negocio). Requiere sesión; el `org_id` sale de la sesión, nunca del
        cliente. (Fase 3: se suman /api/db/:tabla y endpoints transaccionales.)
     4. Todo lo demás -> archivos estáticos de public/ (env.ASSETS).

   Bindings (wrangler.jsonc):  env.ASSETS -> public/ ,  env.DB -> D1 "cdpedidos-db"
   Secreto: PLATFORM_KEY (el mismo valor en Diwilo Web).

   Seguridad:
     · Contraseña con PBKDF2-SHA256 (100k) + salt por usuario. Nunca en claro.
       Va en las columnas pin_hash/pin_salt (antes eran PIN; los PIN viejos
       siguen entrando hasta que la persona cree su contraseña).
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
const claveValida = (c) => typeof c === "string" && c.length >= 8 && c.length <= 200;
const ERROR_CLAVE = "La contraseña debe tener al menos 8 caracteres";
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

/* ---------- suscripciones ----------
   La fecha la fija Diwilo Web (organizations.pagado_hasta, 'YYYY-MM-DD',
   inclusive). NULL = sin límite. Vencida -> la app queda en solo lectura. */
const hoyCO = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); // Colombia, UTC-5
const vencida = (pagadoHasta) => !!pagadoHasta && pagadoHasta < hoyCO();

async function estadoSuscripcion(env, orgId) {
  const o = await env.DB.prepare("SELECT pagado_hasta FROM organizations WHERE id = ?").bind(orgId).first();
  const pagadoHasta = (o && o.pagado_hasta) || null;
  return { estado: vencida(pagadoHasta) ? "solo_lectura" : "ok", pagadoHasta };
}
// Corta escrituras cuando la suscripción está vencida (solo lectura).
async function bloqueoEscritura(env, orgId) {
  const s = await estadoSuscripcion(env, orgId);
  return s.estado === "solo_lectura"
    ? json({ error: "suscripcion-vencida" }, { status: 402 })
    : null;
}

/* ---------- CRUD genérico /api/db/:tabla ----------
   Lista blanca: cada tabla declara sus columnas editables por el cliente y el
   orden por defecto. `id`, `org_id` y `creado_en` los pone el servidor. */
const TABLAS = {
  clientes:  { cols: ["nombre", "telefono", "descripcion"], orden: "nombre COLLATE NOCASE" },
  mov_fiado: { cols: ["cliente_id", "fecha", "tipo", "monto", "concepto", "venta_id", "usuario_id", "usuario_nombre"], orden: "fecha" },
  // Solo el admin crea/edita/borra códigos; cualquiera con sesión los puede
  // leer (hace falta para validarlos al cobrar una cuenta).
  codigos_descuento: { cols: ["codigo", "tipo", "valor", "activo", "descripcion"], orden: "creado_en DESC", soloAdminEscribe: true },
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

  if (m !== "GET") {
    const cortar = await bloqueoEscritura(env, org);
    if (cortar) return cortar;
    if (def.soloAdminEscribe && u.rol !== "admin") {
      return json({ error: "Solo el administrador puede hacer eso" }, { status: 403 });
    }
  }

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

/* ---------- plataforma (Diwilo Web) ----------
   Diwilo Web es el único panel que crea negocios, invita dueños y maneja
   suscripciones. Llama a estas rutas con "Authorization: Bearer PLATFORM_KEY".
   Contrato común a las apps de Diwilo (pedidos, nutrición, citas):
     GET    /api/platform/businesses
     POST   /api/platform/businesses                 { name, owner_email, owner_name?, paid_until }
     GET    /api/platform/businesses/:id
     PATCH  /api/platform/businesses/:id             { name?, paid_until? }
     POST   /api/platform/businesses/:id/users       { email, name?, role: owner|staff } -> invite_path
     DELETE /api/platform/businesses/:id/users/:uid
   Los roles se traducen: admin <-> owner, personal <-> staff. */
const ROL_PLATAFORMA = { admin: "owner", personal: "staff" };
const ESTADO_PLATAFORMA = { activo: "active", pendiente: "invited", inactivo: "inactive" };
const fechaValida = (v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(Date.parse(v)));
const linkRegistro = (token) => `/?registro=${token}`;

async function negociosPlataforma(env, orgId) {
  const filtro = orgId ? " WHERE id = ?" : "";
  const orgs = env.DB.prepare(`SELECT id, nombre, creado_en, pagado_hasta FROM organizations${filtro} ORDER BY creado_en`);
  const users = env.DB.prepare(
    `SELECT id, org_id, email, nombre, rol, estado, invite_token FROM users${orgId ? " WHERE org_id = ?" : ""} ORDER BY rol, nombre`
  );
  const [o, u] = await env.DB.batch(orgId ? [orgs.bind(orgId), users.bind(orgId)] : [orgs, users]);
  return o.results.map((org) => ({
    id: org.id,
    name: org.nombre,
    slug: null,
    created_at: new Date(org.creado_en).toISOString(),
    paid_until: org.pagado_hasta || null,
    read_only: vencida(org.pagado_hasta),
    users: u.results.filter((x) => x.org_id === org.id).map((x) => ({
      id: x.id, email: x.email, name: x.nombre,
      role: ROL_PLATAFORMA[x.rol] || x.rol,
      status: ESTADO_PLATAFORMA[x.estado] || x.estado,
      invite_path: x.invite_token ? linkRegistro(x.invite_token) : null,
    })),
  }));
}

async function manejarPlataforma(path, request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.PLATFORM_KEY || !iguales(auth, `Bearer ${env.PLATFORM_KEY}`)) {
    return json({ error: "no autorizado" }, { status: 401 });
  }
  const m = request.method;
  const [, , recurso, orgId, sub, userId] = path.split("/").filter(Boolean); // api/platform/businesses/:id/users/:uid
  if (recurso !== "businesses") return json({ error: "ruta no encontrada" }, { status: 404 });

  if (!orgId && m === "GET") return json({ businesses: await negociosPlataforma(env) });

  if (!orgId && m === "POST") {
    const b = await leerBody(request);
    const nombre = String(b.name || "").trim();
    if (!nombre) return json({ error: "Falta el nombre del negocio" }, { status: 400 });
    if (!emailValido(b.owner_email)) return json({ error: "Correo del dueño inválido" }, { status: 400 });
    if (!fechaValida(b.paid_until ?? null)) return json({ error: "Fecha de pago inválida" }, { status: 400 });
    if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(norm(b.owner_email)).first())
      return json({ error: "Ese correo ya tiene cuenta en Pedidos" }, { status: 409 });
    const id = crypto.randomUUID();
    const invite = randHex(16);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO organizations (id, nombre, creado_en, pagado_hasta) VALUES (?, ?, ?, ?)")
        .bind(id, nombre, now, b.paid_until ?? null),
      env.DB.prepare(
        `INSERT INTO users (id, org_id, email, nombre, rol, estado, invite_token, creado_en)
         VALUES (?, ?, ?, ?, 'admin', 'pendiente', ?, ?)`
      ).bind(crypto.randomUUID(), id, norm(b.owner_email), String(b.owner_name || "").trim() || nombre, invite, now),
    ]);
    return json({ id, invite_path: linkRegistro(invite) }, { status: 201 });
  }

  const org = orgId && await env.DB.prepare("SELECT id FROM organizations WHERE id = ?").bind(orgId).first();
  if (!org) return json({ error: "Negocio no encontrado" }, { status: 404 });

  if (!sub && m === "GET") return json((await negociosPlataforma(env, orgId))[0]);

  if (!sub && m === "PATCH") {
    const b = await leerBody(request);
    if (b.name !== undefined && !String(b.name).trim()) return json({ error: "Nombre vacío" }, { status: 400 });
    if (b.paid_until !== undefined && !fechaValida(b.paid_until)) return json({ error: "Fecha de pago inválida" }, { status: 400 });
    const stmts = [];
    if (b.name !== undefined) stmts.push(env.DB.prepare("UPDATE organizations SET nombre = ? WHERE id = ?").bind(String(b.name).trim(), orgId));
    if (b.paid_until !== undefined) stmts.push(env.DB.prepare("UPDATE organizations SET pagado_hasta = ? WHERE id = ?").bind(b.paid_until, orgId));
    if (stmts.length) await env.DB.batch(stmts);
    return noContent();
  }

  if (sub === "users" && !userId && m === "POST") {
    const b = await leerBody(request);
    if (!emailValido(b.email)) return json({ error: "Correo inválido" }, { status: 400 });
    const rol = b.role === "owner" ? "admin" : "personal";
    const invite = randHex(16);
    const existe = await env.DB.prepare("SELECT id, org_id FROM users WHERE email = ?").bind(norm(b.email)).first();
    if (existe && existe.org_id !== orgId) return json({ error: "Ese correo ya tiene cuenta en otro negocio de Pedidos" }, { status: 409 });
    if (existe) {
      // Ya existe en este negocio: nuevo link para crear/restablecer su contraseña.
      await env.DB.prepare("UPDATE users SET invite_token = ?, rol = ? WHERE id = ?").bind(invite, rol, existe.id).run();
      return json({ id: existe.id, invite_path: linkRegistro(invite) });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO users (id, org_id, email, nombre, rol, estado, invite_token, creado_en)
       VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)`
    ).bind(id, orgId, norm(b.email), String(b.name || "").trim() || norm(b.email).split("@")[0], rol, invite, Date.now()).run();
    return json({ id, invite_path: linkRegistro(invite) }, { status: 201 });
  }

  if (sub === "users" && userId && m === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE id = ? AND org_id = ?)").bind(userId, orgId),
      env.DB.prepare("DELETE FROM users WHERE id = ? AND org_id = ?").bind(userId, orgId),
    ]);
    return noContent();
  }

  return json({ error: "ruta no encontrada" }, { status: 404 });
}

/* ---------- API ---------- */
async function manejarApi(path, request, env, url) {
  const m = request.method;

  /* ---- login ---- */
  if (path === "/api/login" && m === "POST") {
    const { email, password, pin } = await leerBody(request);
    const clave = String(password ?? pin ?? "");
    const generico = json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
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
    const hash = await derivarPin(clave, u.pin_salt);
    if (!iguales(hash, u.pin_hash)) {
      const fallos = (u.fallos || 0) + 1;
      const bloq = fallos >= 5 ? ahora + 15 * 60 * 1000 : null;
      await env.DB.prepare("UPDATE users SET fallos=?, bloqueado_hasta=? WHERE id=?").bind(fallos, bloq, u.id).run();
      return generico;
    }
    await env.DB.prepare("UPDATE users SET fallos=0, bloqueado_hasta=NULL WHERE id=?").bind(u.id).run();
    // Entró con el PIN de antes: se acepta una vez y pide crear la contraseña.
    if (!claveValida(clave)) {
      const invite = randHex(16);
      await env.DB.prepare("UPDATE users SET invite_token = ? WHERE id = ?").bind(invite, u.id).run();
      return json({ crearClave: true, token: invite });
    }
    const tok = await crearSesion(env, u.id);
    return json(
      { user: publico(u), suscripcion: await estadoSuscripcion(env, u.org_id) },
      { headers: { "Set-Cookie": setCookie(tok) } }
    );
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
    if (!u) return json({ error: "no-auth" }, { status: 401 });
    return json({ user: publico(u), suscripcion: await estadoSuscripcion(env, u.org_id) });
  }

  /* ---- registro por invitación: crear (o restablecer) la contraseña ----
     El link lo genera el admin del negocio o Diwilo Web. Sirve tanto para
     el primer ingreso como para recuperar una contraseña olvidada. */
  if (path === "/api/registro") {
    if (m === "GET") {
      const u = await env.DB.prepare(
        `SELECT u.email, u.nombre, o.nombre AS negocio, (u.pin_hash IS NOT NULL) AS restablecer
           FROM users u JOIN organizations o ON o.id = u.org_id
          WHERE u.invite_token = ? AND u.estado <> 'inactivo'`
      ).bind(url.searchParams.get("token") || "").first();
      return u ? json({ ...u, restablecer: !!u.restablecer }) : json({ error: "Invitación inválida o ya usada" }, { status: 404 });
    }
    if (m === "POST") {
      const { token, password, nombre } = await leerBody(request);
      if (!claveValida(password)) return json({ error: ERROR_CLAVE }, { status: 400 });
      const u = await env.DB.prepare(
        "SELECT id, nombre FROM users WHERE invite_token = ? AND estado <> 'inactivo'"
      ).bind(String(token || "")).first();
      if (!u) return json({ error: "Invitación inválida o ya usada" }, { status: 400 });
      const salt = randHex(16);
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE users SET nombre=?, pin_hash=?, pin_salt=?, estado='activo', fallos=0, bloqueado_hasta=NULL,
                            invite_token=NULL, registrado_en=COALESCE(registrado_en, ?) WHERE id=?`
        ).bind(String(nombre || "").trim() || u.nombre, await derivarPin(password, salt), salt, Date.now(), u.id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
      ]);
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

  /* ---- plataforma: Diwilo Web ---- */
  if (path.startsWith("/api/platform/")) {
    return manejarPlataforma(path, request, env);
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

    if (m !== "GET") {
      const cortar = await bloqueoEscritura(env, org);
      if (cortar) return cortar;
    }

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
