/* ============================================================================
   js/dashboard/gate.js — Portón del Dashboard (solo admin)
   ----------------------------------------------------------------------------
   Se carga ÚLTIMO. Pide /api/me:
     · admin           -> modo remoto (D1) + window.__dashInit(user)
     · personal / 401  -> redirige a "/" (el personal ve sus movimientos en
                          el modal de la app, no acá)
   ========================================================================== */
(function () {
  'use strict';

  async function iniciar() {
    let user;
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      if (!r.ok) { location.replace('/'); return; }
      user = (await r.json()).user;
    } catch (e) {
      location.replace('/');
      return;
    }
    if (!user || user.rol !== 'admin') { location.replace('/'); return; }

    window.__CDP_USER__ = user;
    window.__CDP_BACKEND__ = 'remote';
    document.body.dataset.rol = user.rol || 'personal';

    const nom = document.getElementById('dashUsuario');
    if (nom) nom.textContent = user.nombre;

    if (typeof window.__dashInit === 'function') window.__dashInit(user);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
