/* ============================================================================
   js/core/config.js — Configuración central de la app
   ----------------------------------------------------------------------------
   Un solo lugar para: claves de almacenamiento y límites de historial.
   Cargado antes que cualquier módulo (app y dashboard).
   ========================================================================== */

const APP_CONFIG = {
  nombre: 'Control de Pedidos',
  version: '0.3.0',
  moneda: { locale: 'es-CO', currency: 'COP' }
};

/* --- CLAVES DE ALMACENAMIENTO ---
   Nombres históricos (para no perder datos guardados por versiones previas).
   Un negocio = un juego de estos bloques; el Worker los aísla por `org_id`. */
const CLAVES = {
  plano:       'plano-restaurante-estado-v3',      // pisos + mesas + geometría + comandas abiertas
  inventario:  'plano-restaurante-inventario-v1',  // stock por producto
  productos:   'plano-restaurante-productos-v1',   // catálogo completo (nombre/precio/costo/categoría)
  ventas:      'plano-restaurante-ventas-v1',      // cuentas liquidadas
  movimientos: 'plano-restaurante-movimientos-v1', // entradas/salidas de inventario
  categorias:  'cdp-categorias-v1',                // categorías del catálogo (orden incluido)
  clientes:    'cdp-clientes-v1',
  fiados:      'cdp-fiados-v1',                    // cuentas por cobrar (movimientos por cliente)
  proveedores: 'cdp-proveedores-v1',
  cxp:         'cdp-cuentas-por-pagar-v1',         // cuentas por pagar (movimientos por proveedor)
  caja:        'cdp-caja-v1',                      // turno de caja abierto (o null)
  cajaHist:    'cdp-caja-hist-v1'                  // cierres de caja archivados
};

/* Alias planos (compatibilidad con el código existente; se irán quitando). */
const STORAGE_KEY = CLAVES.plano;
const STORAGE_KEY_INVENTARIO = CLAVES.inventario;
const STORAGE_KEY_PRODUCTOS = CLAVES.productos;
const STORAGE_KEY_VENTAS = CLAVES.ventas;
const STORAGE_KEY_MOVIMIENTOS = CLAVES.movimientos;
const STORAGE_KEY_CATEGORIAS = CLAVES.categorias;
const STORAGE_KEY_CLIENTES = CLAVES.clientes;
const STORAGE_KEY_FIADOS = CLAVES.fiados;
const STORAGE_KEY_PROVEEDORES = CLAVES.proveedores;
const STORAGE_KEY_CXP = CLAVES.cxp;
const STORAGE_KEY_CAJA = CLAVES.caja;
const STORAGE_KEY_CAJA_HIST = CLAVES.cajaHist;

/* --- LÍMITES DE HISTORIAL (para no llenar el almacenamiento) --- */
const MAX_VENTAS_GUARDADAS = 300;
const MAX_MOVIMIENTOS_GUARDADOS = 300;
const MAX_MOV_FIADOS_GUARDADOS = 500;
const MAX_MOV_CXP_GUARDADOS = 500;
const MAX_CIERRES_CAJA_GUARDADOS = 200;
