/* ============================================================================
   js/core/repo.js — Repositorio genérico sobre window.storage
   ----------------------------------------------------------------------------
   Antes había ~22 pares casi idénticos `guardarX / cargarXGuardado` en
   js/data/repositories.js. Esto los reduce a una fábrica:

     const r = crearRepo(CLAVES.ventas);          // shared:true, debounce:350ms
     await r.cargar();        -> valor (JSON.parse) | null
     r.guardar(ventasData);   -> escritura "debounced" (agrupa ráfagas)

   Opciones: { shared = true, debounce = 350 }  (debounce:0 = escribir ya).
   ========================================================================== */
function crearRepo(clave, opts) {
  opts = opts || {};
  const shared = opts.shared !== false;
  const debounce = opts.debounce == null ? 350 : opts.debounce;
  let timer = null;

  return {
    clave,

    async cargar() {
      try {
        const r = await window.storage.get(clave, shared);
        if (r && r.value != null) return JSON.parse(r.value);
      } catch (e) {
        // primera vez, o valor no parseable: se sigue con los datos por defecto
      }
      return null;
    },

    guardar(valor) {
      const payload = JSON.stringify(valor);
      const escribir = () => window.storage.set(clave, payload, shared)
        .catch(e => console.error('No se pudo guardar "' + clave + '":', e));
      if (debounce > 0) { clearTimeout(timer); timer = setTimeout(escribir, debounce); return; }
      return escribir();   // debounce:0 -> promesa "esperable"
    },

    borrar() {
      return window.storage.remove(clave, shared)
        .catch(e => console.error('No se pudo borrar "' + clave + '":', e));
    }
  };
}

/* Helpers genéricos "un bloque cualquiera" (los usa el Dashboard, que lee/escribe
   muchas claves distintas de forma dinámica). Escritura inmediata y esperable. */
function leerBloque(clave)         { return crearRepo(clave, { debounce: 0 }).cargar(); }
function escribirBloque(clave, valor) { return crearRepo(clave, { debounce: 0 }).guardar(valor); }
