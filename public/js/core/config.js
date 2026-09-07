/* ============================================================================
   js/core/config.js — Configuración central de la app
   ----------------------------------------------------------------------------
   Un solo lugar para: claves de almacenamiento, límites de historial y
   (a futuro) credenciales del BaaS. Cargado antes que cualquier módulo.
   ========================================================================== */

/* Config general. En producción, `baas` se rellena con los datos del
   proyecto Supabase/Firebase y `storage.js` los usa para conectarse. */
const APP_CONFIG = {
  nombre: 'Control de Pedidos',
  version: '0.2.0',
  moneda: { locale: 'es-CO', currency: 'COP' },
  storageMode: 'local', // 'local' (localStorage) | 'remote' (BaaS)
  baas: {
    // url: 'https://<proyecto>.supabase.co',
    // anonKey: '<clave-anon-publica>'
  }
};

/* --- CLAVES DE ALMACENAMIENTO ---
   Se conservan los mismos nombres históricos para no perder los datos ya
   guardados por versiones anteriores de la app. */
const STORAGE_KEY = 'plano-restaurante-estado-v3';
const STORAGE_KEY_INVENTARIO = 'plano-restaurante-inventario-v1';
const STORAGE_KEY_PRODUCTOS = 'plano-restaurante-productos-v1';
const STORAGE_KEY_VENTAS = 'plano-restaurante-ventas-v1';
const STORAGE_KEY_MOVIMIENTOS = 'plano-restaurante-movimientos-v1';
/* Nuevos dominios */
const STORAGE_KEY_CLIENTES = 'cdp-clientes-v1';
const STORAGE_KEY_FIADOS = 'cdp-fiados-v1';           // cuentas por cobrar (fiados a clientes)
const STORAGE_KEY_PROVEEDORES = 'cdp-proveedores-v1';
const STORAGE_KEY_CXP = 'cdp-cuentas-por-pagar-v1';   // cuentas por pagar a proveedores

/* --- LÍMITES DE HISTORIAL (para no llenar el almacenamiento) --- */
const MAX_VENTAS_GUARDADAS = 300;
const MAX_MOVIMIENTOS_GUARDADOS = 300;
const MAX_MOV_FIADOS_GUARDADOS = 500;
const MAX_MOV_CXP_GUARDADOS = 500;
