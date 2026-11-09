// Sesión y permisos de la capa común (módulos centrales, IA/MCP, Inicio) sobre el modelo de Pedidos: un usuario pertenece a UN negocio
// (users.org_id; rol admin = propietario, personal = equipo) y la sesión es la cookie cdp_sesion (tabla sessions, expira_en en ms).
import { HttpError, getCookie } from './http.js';
import { db } from './db.js';
import { parseModulos, requireModule } from './modules.js';
import { isPlatformCall } from '../../platform-rpc.js';

export const SESSION_COOKIE = 'cdp_sesion';
export const todayBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
export const isExpired = (paidUntil) => !!paidUntil && paidUntil < todayBogota();

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// La dirección corta del negocio (la usan los chats, tarjetas y links públicos de Marketing). Se crea la primera vez que hace falta.
export async function asegurarSlug(env, orgId, nombre) {
  const o = await db(env).first('SELECT slug FROM organizations WHERE id = ?', orgId);
  if (o?.slug) return o.slug;
  const base = String(nombre || 'negocio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'negocio';
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${randomHex(2)}`;
    try { await db(env).run('UPDATE organizations SET slug = ? WHERE id = ? AND slug IS NULL', slug, orgId); } catch { continue; }
    const r = await db(env).first('SELECT slug FROM organizations WHERE id = ?', orgId);
    if (r?.slug) return r.slug;
  }
  return null;
}

export async function loadSession(req, env) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const s = await db(env).first(
    `SELECT s.token AS session_id, u.id AS user_id, u.org_id AS business_id, u.email, u.nombre AS name, u.rol, u.modulos, u.estado, s.expira_en,
            o.nombre AS business_name, o.slug AS business_slug, o.pagado_hasta AS paid_until
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN organizations o ON o.id = u.org_id AND o.archivado_en IS NULL
      WHERE s.token = ?`, token);
  if (!s || s.expira_en < Date.now() || s.estado !== 'activo') return null;
  s.role = s.rol === 'admin' ? 'owner' : 'staff';
  if (!s.business_slug) s.business_slug = await asegurarSlug(env, s.business_id, s.business_name);
  return s;
}

// 'tenant:<modulo>' | 'manager:<modulo>' | 'session' | 'platform' | 'public'. Igual que en las demás apps de Diwilo.
export async function authenticate(c, spec) {
  const [level, moduleId] = String(spec).split(':');
  if (level === 'public') return;
  if (level === 'platform') { if (!isPlatformCall(c.req)) throw new HttpError(401, 'No autorizado'); return; }
  const s = await loadSession(c.req, c.env);
  if (!s) throw new HttpError(401, 'Inicia sesión', 'NO_SESSION');
  c.session = s;
  c.user = { id: s.user_id, email: s.email, name: s.name };
  if (level === 'session') return;
  c.businessId = s.business_id;
  c.role = s.role;
  c.modulos = parseModulos(s.modulos);
  c.readOnly = isExpired(s.paid_until);
  c.timezone = 'America/Bogota';
  if (c.readOnly && c.req.method !== 'GET' && c.req.method !== 'HEAD') throw new HttpError(402, 'La suscripción del negocio está vencida: solo lectura.');
  if (level === 'manager' && c.role !== 'owner') throw new HttpError(403, 'Solo el propietario');
  if (moduleId) await requireModule(c, moduleId);
}
