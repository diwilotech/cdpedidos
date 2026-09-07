/* ============================================================================
   js/data/repositories.js — Repositorios (lectura/escritura vía window.storage)
   ----------------------------------------------------------------------------
   Única capa que toca `window.storage`. Cada dominio tiene su par
   "guardar" / "cargar". Los guardados son "debounced" para agrupar ráfagas
   de cambios (p.ej. mientras se arrastra una mesa) en una sola escritura.
   Las claves y límites viven en js/core/config.js.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   PLANO (pisos, posiciones, colores, mesas y cuentas) — dato COMPARTIDO
   --------------------------------------------------------------------------- */
let guardarEstadoTimeout = null;

function construirListaMesasParaGuardar() {
  const lista = [];
  pisosData.forEach(piso => {
    const grid = grids[piso.id];
    if (!grid) return;
    grid.engine.nodes.forEach(node => {
      const content = node.el ? node.el.querySelector('[data-mesaid]') : null;
      if (!content) return;
      const mesaId = content.dataset.mesaid;
      const labelEl = node.el.querySelector('.nombre-label');
      // Posición: la "de confianza" (mesasLayout), NO la que GridStack tenga
      // ahora mismo en pantalla (que puede haber derivado en otro dispositivo).
      const L = mesasLayout[mesaId] || { x: node.x, y: node.y, w: node.w, h: node.h };
      lista.push({
        id: mesaId,
        nombre: labelEl ? labelEl.innerText : 'Mesa',
        colorHex: content.dataset.colorhex || '#0d6efd',
        w: L.w, h: L.h, x: L.x, y: L.y,
        piso: piso.id,
        cuentas: mesasData[mesaId] || []
      });
    });
  });
  return lista;
}

function guardarEstado() {
  clearTimeout(guardarEstadoTimeout);
  guardarEstadoTimeout = setTimeout(async () => {
    try {
      const payload = {
        mesas: construirListaMesasParaGuardar(),
        contadorMesas,
        pisos: pisosData,
        contadorPisos
      };
      await window.storage.set(STORAGE_KEY, JSON.stringify(payload), true);
    } catch (e) {
      console.error('No se pudo guardar el plano:', e);
    }
  }, 350);
}

async function cargarEstadoGuardado() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY, true);
    if (resultado && resultado.value) {
      return JSON.parse(resultado.value);
    }
  } catch (e) {
    // Primera vez o error de lectura: se sigue con los datos de ejemplo.
  }
  return null;
}

/* ---------------------------------------------------------------------------
   INVENTARIO (stock por producto) — dato COMPARTIDO
   --------------------------------------------------------------------------- */
let guardarInventarioTimeout = null;

function guardarInventario() {
  clearTimeout(guardarInventarioTimeout);
  guardarInventarioTimeout = setTimeout(async () => {
    try {
      await window.storage.set(STORAGE_KEY_INVENTARIO, JSON.stringify(inventario), true);
    } catch (e) {
      console.error('No se pudo guardar el inventario:', e);
    }
  }, 350);
}

async function cargarInventarioGuardado() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_INVENTARIO, true);
    if (resultado && resultado.value) {
      return JSON.parse(resultado.value);
    }
  } catch (e) {
    // Primera vez o error de lectura.
  }
  return null;
}

/* ---------------------------------------------------------------------------
   PRODUCTOS PERSONALIZADOS (creados desde Inventario) — dato COMPARTIDO
   --------------------------------------------------------------------------- */
let guardarProductosTimeout = null;

function guardarProductosPersonalizados() {
  clearTimeout(guardarProductosTimeout);
  guardarProductosTimeout = setTimeout(async () => {
    try {
      await window.storage.set(STORAGE_KEY_PRODUCTOS, JSON.stringify(productosPersonalizados), true);
    } catch (e) {
      console.error('No se pudo guardar los productos nuevos:', e);
    }
  }, 350);
}

async function cargarProductosPersonalizadosGuardados() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_PRODUCTOS, true);
    if (resultado && resultado.value) {
      return JSON.parse(resultado.value);
    }
  } catch (e) {
    // Primera vez o error de lectura.
  }
  return null;
}

/* Los "usuarios" ya no son un dato de la app: el acceso lo maneja el Worker
   (tablas users/sessions en D1) y el operador es quien inició sesión. */

/* ---------------------------------------------------------------------------
   VENTAS (cuentas liquidadas) — dato COMPARTIDO
   --------------------------------------------------------------------------- */
let guardarVentasTimeout = null;

function guardarVentas() {
  clearTimeout(guardarVentasTimeout);
  guardarVentasTimeout = setTimeout(async () => {
    try {
      await window.storage.set(STORAGE_KEY_VENTAS, JSON.stringify(ventasData), true);
    } catch (e) {
      console.error('No se pudo guardar las ventas:', e);
    }
  }, 350);
}

async function cargarVentasGuardadas() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_VENTAS, true);
    if (resultado && resultado.value) {
      return JSON.parse(resultado.value);
    }
  } catch (e) {
    // Primera vez o error de lectura.
  }
  return null;
}

/* ---------------------------------------------------------------------------
   MOVIMIENTOS DE INVENTARIO — dato COMPARTIDO
   --------------------------------------------------------------------------- */
let guardarMovimientosTimeout = null;

function guardarMovimientos() {
  clearTimeout(guardarMovimientosTimeout);
  guardarMovimientosTimeout = setTimeout(async () => {
    try {
      await window.storage.set(STORAGE_KEY_MOVIMIENTOS, JSON.stringify(movimientosInventario), true);
    } catch (e) {
      console.error('No se pudo guardar los movimientos de inventario:', e);
    }
  }, 350);
}

async function cargarMovimientosGuardados() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_MOVIMIENTOS, true);
    if (resultado && resultado.value) {
      return JSON.parse(resultado.value);
    }
  } catch (e) {
    // Primera vez o error de lectura.
  }
  return null;
}

/* ---------------------------------------------------------------------------
   CLIENTES + FIADOS (cuentas por cobrar) — dato COMPARTIDO
   --------------------------------------------------------------------------- */
let guardarClientesTimeout = null;

function guardarClientes() {
  clearTimeout(guardarClientesTimeout);
  guardarClientesTimeout = setTimeout(async () => {
    try {
      const payload = { clientes: clientesData, contadorClientes };
      await window.storage.set(STORAGE_KEY_CLIENTES, JSON.stringify(payload), true);
    } catch (e) {
      console.error('No se pudo guardar los clientes:', e);
    }
  }, 350);
}

async function cargarClientesGuardados() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_CLIENTES, true);
    if (resultado && resultado.value) return JSON.parse(resultado.value);
  } catch (e) { /* primera vez */ }
  return null;
}

let guardarFiadosTimeout = null;

function guardarFiados() {
  clearTimeout(guardarFiadosTimeout);
  guardarFiadosTimeout = setTimeout(async () => {
    try {
      await window.storage.set(STORAGE_KEY_FIADOS, JSON.stringify(movimientosFiado), true);
    } catch (e) {
      console.error('No se pudo guardar los fiados:', e);
    }
  }, 350);
}

async function cargarFiadosGuardados() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_FIADOS, true);
    if (resultado && resultado.value) return JSON.parse(resultado.value);
  } catch (e) { /* primera vez */ }
  return null;
}

/* ---------------------------------------------------------------------------
   PROVEEDORES + CUENTAS POR PAGAR — dato COMPARTIDO
   --------------------------------------------------------------------------- */
let guardarProveedoresTimeout = null;

function guardarProveedores() {
  clearTimeout(guardarProveedoresTimeout);
  guardarProveedoresTimeout = setTimeout(async () => {
    try {
      const payload = { proveedores: proveedoresData, contadorProveedores };
      await window.storage.set(STORAGE_KEY_PROVEEDORES, JSON.stringify(payload), true);
    } catch (e) {
      console.error('No se pudo guardar los proveedores:', e);
    }
  }, 350);
}

async function cargarProveedoresGuardados() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_PROVEEDORES, true);
    if (resultado && resultado.value) return JSON.parse(resultado.value);
  } catch (e) { /* primera vez */ }
  return null;
}

let guardarCxpTimeout = null;

function guardarCxp() {
  clearTimeout(guardarCxpTimeout);
  guardarCxpTimeout = setTimeout(async () => {
    try {
      await window.storage.set(STORAGE_KEY_CXP, JSON.stringify(movimientosCxp), true);
    } catch (e) {
      console.error('No se pudo guardar las cuentas por pagar:', e);
    }
  }, 350);
}

async function cargarCxpGuardadas() {
  try {
    const resultado = await window.storage.get(STORAGE_KEY_CXP, true);
    if (resultado && resultado.value) return JSON.parse(resultado.value);
  } catch (e) { /* primera vez */ }
  return null;
}
