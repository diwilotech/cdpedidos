/* ============================================================================
   js/admin/admin-gate.js — Portón del panel /admin (solo super-admin)
   ----------------------------------------------------------------------------
   Se carga ÚLTIMO. Pide /api/me:
     · user.esSuper === true  -> window.admIniciar(user)
     · cualquier otro / 401   -> redirige a "/"
   El super-admin se define en D1:  UPDATE users SET es_super = 1 WHERE email = '…';
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
    if (!user || !user.esSuper) { location.replace('/'); return; }

    window.__CDP_USER__ = user;
    if (typeof window.admIniciar === 'function') window.admIniciar(user);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
