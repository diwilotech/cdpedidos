/* ============================================================================
   api/estado.js — Función serverless de ejemplo (PLANTILLA, no conectada)
   ----------------------------------------------------------------------------
   Handler genérico key/value para los datos COMPARTIDOS del negocio.
   Estilo compatible con Vercel / Netlify / Cloudflare Pages Functions.

   Hoy NO se invoca: la app usa localStorage (js/core/storage.js).
   Cuando exista backend, `js/core/storage.js` llamará a:
     GET  /api/estado?key=<clave>
     POST /api/estado   body: { key, value }
   ============================================================================ */

// Sustituir por el cliente real del BaaS (p.ej. @supabase/supabase-js).
const db = {
  async read(_key) { throw new Error('BaaS no configurado. Ver api/README.md'); },
  async write(_key, _value) { throw new Error('BaaS no configurado. Ver api/README.md'); }
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const key = (req.query && req.query.key) || '';
      if (!key) return res.status(400).json({ error: 'Falta "key"' });
      const value = await db.read(key);
      return res.status(200).json({ value });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ error: 'Falta "key"' });
      await db.write(key, value);
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
