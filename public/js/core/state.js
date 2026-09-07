/* ============================================================================
   js/core/state.js — Estado en memoria + instancias de modales
   ----------------------------------------------------------------------------
   Variables vivas mientras la página está abierta. Los repositorios
   (js/data/repositories.js) las hidratan desde `window.storage` al arrancar
   y las persisten en cada cambio.
   ========================================================================== */

let contadorMesas = 20;

// --- PISOS DINÁMICOS ---
// La lista de pisos vive en JS y se puede ampliar/renombrar desde el modo
// edición (ver crearPisoDOM, agregarPiso, renombrarPiso, eliminarPiso).
let pisosData = [
  { id: 1, nombre: 'Piso 1' },
  { id: 2, nombre: 'Piso 2' }
];
let contadorPisos = 2; // último id de piso usado, para no repetir ids

let pisoActual = 1;
const grids = {};
const mesasData = {};   // idMesa -> array de cuentas (comandas) de esa mesa

// idMesa -> { x, y, w, h }  ·  posición/tamaño "de confianza" de cada mesa.
// Se siembra al cargar y SOLO se actualiza cuando el usuario mueve/redimensiona
// una mesa en modo edición. Así, si GridStack re-acomoda visualmente al
// renderizar en una pantalla distinta (PC vs. celular), esa deriva NO se
// guarda y el plano se ve igual en todos los dispositivos.
const mesasLayout = {};

// --- INVENTARIO ---
// Mapa productId -> unidades disponibles. Se inicializa con el stock
// de ejemplo de dbJSON.products y luego se sobreescribe con lo que
// haya guardado (ver cargarInventarioGuardado).
let inventario = {};
dbJSON.products.forEach(p => { inventario[p.id] = p.stock; });
let categoriaInventarioSeleccionada = "cat-all";

// Productos agregados por el usuario desde el modal de Inventario
// (además de los de ejemplo). Se guardan aparte para persistirlos.
let productosPersonalizados = [];

// --- USUARIO EN SESIÓN ---
// No hay lista local de usuarios: el operador es quien inició sesión
// (window.__CDP_USER__, lo fija js/core/auth-gate.js). Ver js/modules/usuarios.js.

// --- VENTAS (historial de cuentas liquidadas) ---
let ventasData = [];

// --- MOVIMIENTOS DE INVENTARIO (entradas y salidas) ---
let movimientosInventario = [];

// --- CLIENTES + FIADOS (cuentas por cobrar) ---
let clientesData = [];
let contadorClientes = 0;
let movimientosFiado = [];   // { id, fecha, clienteId, tipo:'cargo'|'abono', monto, concepto, usuarioNombre }

// --- PROVEEDORES + CUENTAS POR PAGAR ---
let proveedoresData = [];
let contadorProveedores = 0;
let movimientosCxp = [];     // { id, fecha, proveedorId, tipo:'factura'|'pago', monto, concepto, usuarioNombre }

// --- SELECCIÓN / EDICIÓN DEL PLANO ---
let mesaActivaId = null;
let cuentaActivaIndex = 0;
let categoriaSeleccionada = "cat-all";

let elementosSeleccionados = new Set();
let itemMenuContextual = null;
let modoEdicion = false;

// --- INSTANCIAS DE MODALES BOOTSTRAP ---
// Este script se carga al final del <body>, así que los elementos existen.
const modalCuentasBS = new bootstrap.Modal(document.getElementById('modalCuentas'));
const modalCatalogoBS = new bootstrap.Modal(document.getElementById('modalCatalogoProductos'));
const modalInventarioBS = new bootstrap.Modal(document.getElementById('modalInventario'));
const modalVentasBS = new bootstrap.Modal(document.getElementById('modalVentas'));
const modalMovimientosBS = new bootstrap.Modal(document.getElementById('modalMovimientos'));
const toastNotificacionBS = new bootstrap.Toast(document.getElementById('toastNotificacion'), { delay: 2000 });
const modalPromptBS = new bootstrap.Modal(document.getElementById('modalPromptTexto'));
const modalConfirmarBS = new bootstrap.Modal(document.getElementById('modalConfirmarAccion'));
