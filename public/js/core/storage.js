/* ============================================================================
   js/core/storage.js — Capa de persistencia (localStorage | Worker + D1)
   ----------------------------------------------------------------------------
   El frontend NUNCA habla directo con la base: siempre pasa por este
   adaptador `window.storage`, con API asíncrona (get / set / remove).

   Dos backends, elegidos por `window.__CDP_BACKEND__` (lo fija auth-gate.js):

     'remote'  -> datos COMPARTIDOS (shared:true) van al Worker: /api/estado,
                  que guarda en la base D1 `cdpedidos-db`. Todos los
                  dispositivos con sesión ven lo mismo.
     'local' / (sin definir)
               -> todo va a localStorage de este navegador (modo sin backend:
                  al abrir el index.html directo, o si el Worker no responde).

   Las preferencias por dispositivo (shared:false, p. ej. qué usuario opera
   esta caja) SIEMPRE van a localStorage, en los dos modos.

   Firma:
     await window.storage.get(key, shared)        -> { value: string } | null
     await window.storage.set(key, value, shared)  -> void
     await window.storage.remove(key, shared)      -> void
   ========================================================================== */
(function () {
  'use strict';

  var PREFIJO = 'cdp';
  var SEP = ':';

  function clave(key, shared) {
    return PREFIJO + SEP + (shared ? 'shared' : 'local') + SEP + key;
  }

  function esRemoto(shared) {
    return shared === true && window.__CDP_BACKEND__ === 'remote';
  }

  // ── Backend LOCAL (localStorage) ────────────────────────────────────────
  var local = {
    get: function (k) {
      try {
        var raw = window.localStorage.getItem(k);
        return raw === null ? null : { value: raw };
      } catch (e) { console.warn('[storage] leer', k, e); return null; }
    },
    set: function (k, value) {
      try { window.localStorage.setItem(k, String(value)); }
      catch (e) { console.error('[storage] guardar', k, e); }
    },
    remove: function (k) {
      try { window.localStorage.removeItem(k); }
      catch (e) { console.warn('[storage] borrar', k, e); }
    }
  };

  // ── Backend REMOTO (Worker + D1 vía /api/estado) ────────────────────────
  function sesionCaida() {
    // El token venció o se cerró en otra pestaña: recargar para mostrar login.
    if (!window.__CDP_RELOAD_LOCK__) {
      window.__CDP_RELOAD_LOCK__ = true;
      location.reload();
    }
  }

  var remote = {
    get: async function (k) {
      var r = await fetch('/api/estado?key=' + encodeURIComponent(k), { credentials: 'same-origin' });
      if (r.status === 401) { sesionCaida(); return null; }
      if (!r.ok) throw new Error('GET /api/estado ' + r.status);
      var j = await r.json();
      return (j && j.value != null) ? { value: j.value } : null;
    },
    set: async function (k, value) {
      var r = await fetch('/api/estado', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: k, value: String(value) })
      });
      if (r.status === 401) { sesionCaida(); return; }
      if (!r.ok) throw new Error('POST /api/estado ' + r.status);
    },
    remove: async function (k) {
      var r = await fetch('/api/estado?key=' + encodeURIComponent(k), {
        method: 'DELETE', credentials: 'same-origin'
      });
      if (r.status === 401) { sesionCaida(); return; }
      if (!r.ok) throw new Error('DELETE /api/estado ' + r.status);
    }
  };

  // ── API pública ────────────────────────────────────────────────────────
  window.storage = {
    get modo() { return window.__CDP_BACKEND__ === 'remote' ? 'remote' : 'local'; },

    get: function (key, shared) {
      var k = clave(key, shared);
      return esRemoto(shared) ? remote.get(k) : Promise.resolve(local.get(k));
    },

    set: function (key, value, shared) {
      var k = clave(key, shared);
      return esRemoto(shared) ? remote.set(k, value) : (local.set(k, value), Promise.resolve());
    },

    remove: function (key, shared) {
      var k = clave(key, shared);
      return esRemoto(shared) ? remote.remove(k) : (local.remove(k), Promise.resolve());
    },

    // Depuración: vuelca las claves guardadas en localStorage de este equipo.
    _dump: function () {
      var out = {};
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIJO + SEP) === 0) out[k] = window.localStorage.getItem(k);
      }
      return out;
    }
  };
})();
