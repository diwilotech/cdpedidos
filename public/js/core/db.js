/* ============================================================================
   js/core/db.js — Cliente REST fino de las tablas relacionales del Worker
   ----------------------------------------------------------------------------
   Los dominios "consultables" (clientes, fiados, proveedores, cxp, productos,
   ventas, caja…) viven en tablas de D1. Este módulo habla con:
       GET    /api/db/:tabla        -> { rows: [...] }   (filtros por querystring)
       POST   /api/db/:tabla        -> { row }           (id/org_id/creado_en los pone el server)
       PATCH  /api/db/:tabla/:id    -> 204
       DELETE /api/db/:tabla/:id    -> 204
   El `org_id` NUNCA se manda: el Worker lo saca de la sesión.
   Uso:
       await db.list('clientes')
       await db.list('mov_fiado', { cliente_id: id })
       const c = await db.crear('clientes', { nombre, telefono })
       await db.editar('clientes', id, { nombre })
       await db.borrar('clientes', id)
   ========================================================================== */
(function () {
  'use strict';

  async function pedir(metodo, ruta, body) {
    const r = await fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (r.status === 401) {
      if (!window.__CDP_RELOAD_LOCK__) { window.__CDP_RELOAD_LOCK__ = true; location.reload(); }
      throw new Error('sesión caída');
    }
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* 204 */ }
    if (!r.ok) throw new Error((data && data.error) || (metodo + ' ' + ruta + ' → ' + r.status));
    return data;
  }

  function qs(filtros) {
    if (!filtros) return '';
    const p = new URLSearchParams();
    Object.keys(filtros).forEach(k => { if (filtros[k] != null) p.set(k, filtros[k]); });
    const s = p.toString();
    return s ? '?' + s : '';
  }

  window.db = {
    list:   (tabla, filtros)   => pedir('GET', '/api/db/' + tabla + qs(filtros)).then(d => (d && d.rows) || []),
    crear:  (tabla, fila)      => pedir('POST', '/api/db/' + tabla, fila).then(d => d && d.row),
    editar: (tabla, id, fila)  => pedir('PATCH', '/api/db/' + tabla + '/' + id, fila),
    borrar: (tabla, id)        => pedir('DELETE', '/api/db/' + tabla + '/' + id),
    // Endpoints transaccionales (venta, reposición, caja) — dominios posteriores.
    tx:     (ruta, payload)    => pedir('POST', ruta, payload)
  };
})();
