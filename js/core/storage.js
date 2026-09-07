/* ============================================================================
   js/core/storage.js — Capa de persistencia (BaaS-ready)
   ----------------------------------------------------------------------------
   Arquitectura objetivo: Full-Stack Jamstack / Serverless desacoplada.
   El frontend NUNCA habla directo con una base de datos: siempre pasa por
   este adaptador `window.storage`, con una API asíncrona idéntica a la de
   un BaaS (get / set / remove).

   >>> POR AHORA (modo "cons"/local de muestra):
       Todo se guarda en el navegador con localStorage. No hay servidor.
       Es suficiente para probar el flujo completo (ventas, inventario,
       fiados, cuentas por pagar) en un solo dispositivo.

   >>> MÁS ADELANTE (producción):
       Se cambia SOLO este archivo por un cliente de Supabase / Firebase /
       Cloudflare KV / una función serverless en /api. El resto de la app
       (repositorios y módulos) no se toca, porque la firma es la misma.

   Firma:
     await window.storage.get(key, shared)   -> { value: string } | null
     await window.storage.set(key, value, shared) -> void
     await window.storage.remove(key, shared) -> void

   `shared`:
     true  -> dato de negocio COMPARTIDO por todo el local/restaurante
              (plano, inventario, ventas, clientes, proveedores...).
              En producción irá a una tabla del BaaS.
     false -> preferencia LOCAL de este dispositivo/navegador
              (ej. qué usuario está operando esta caja).
              En producción se queda igualmente en localStorage.
   ========================================================================== */
(function () {
  'use strict';

  var PREFIJO = 'cdp'; // "Control De Pedidos"
  var SEP = ':';

  function clave(key, shared) {
    return PREFIJO + SEP + (shared ? 'shared' : 'local') + SEP + key;
  }

  // Backend local (localStorage). Se aísla en un objeto para poder
  // sustituirlo entero por un backend remoto sin tocar la API pública.
  var backendLocal = {
    get: function (k) {
      try {
        var raw = window.localStorage.getItem(k);
        return raw === null ? null : { value: raw };
      } catch (e) {
        console.warn('[storage] no se pudo leer', k, e);
        return null;
      }
    },
    set: function (k, value) {
      try {
        window.localStorage.setItem(k, String(value));
      } catch (e) {
        console.error('[storage] no se pudo guardar', k, e);
      }
    },
    remove: function (k) {
      try {
        window.localStorage.removeItem(k);
      } catch (e) {
        console.warn('[storage] no se pudo borrar', k, e);
      }
    }
  };

  // API pública asíncrona (aunque el backend actual sea síncrono, se
  // devuelve siempre una promesa para que migrar a un BaaS real no
  // obligue a cambiar ni una línea en el resto del proyecto).
  window.storage = {
    modo: 'local', // 'local' | 'remote' (informativo)

    get: function (key, shared) {
      return Promise.resolve(backendLocal.get(clave(key, shared)));
    },

    set: function (key, value, shared) {
      backendLocal.set(clave(key, shared), value);
      return Promise.resolve();
    },

    remove: function (key, shared) {
      backendLocal.remove(clave(key, shared));
      return Promise.resolve();
    },

    // Utilidad para depurar / exportar: devuelve todas las claves de la app.
    _dump: function () {
      var out = {};
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIJO + SEP) === 0) out[k] = window.localStorage.getItem(k);
      }
      return out;
    }
  };

  console.info('%c[Control de Pedidos] storage: modo LOCAL (localStorage). Cambiar js/core/storage.js para conectar un BaaS.', 'color:#0d6efd');
})();
