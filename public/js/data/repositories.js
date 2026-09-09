/* ============================================================================
   js/data/repositories.js — Repositorios por dominio
   ----------------------------------------------------------------------------
   Cada dominio del negocio es un `crearRepo(CLAVES.x)` (ver js/core/repo.js).
   Se conservan los nombres `guardarX() / cargarXGuardado()` que usa el resto
   del código; internamente ya no hay boilerplate repetido.
   Todos los datos son COMPARTIDOS (shared:true): mismos para cualquier
   dispositivo con sesión del mismo negocio.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   PLANO (pisos, geometría, colores, mesas y comandas abiertas)
   Caso especial: el payload NO es una variable estática sino que se arma
   desde GridStack en el momento de guardar.
   --------------------------------------------------------------------------- */
const _repoPlano = crearRepo(CLAVES.plano, { debounce: 0 });
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
      // Posición "de confianza" (mesasLayout), no la que GridStack tenga ahora
      // en pantalla (que puede haber derivado en otro dispositivo).
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
  guardarEstadoTimeout = setTimeout(() => {
    _repoPlano.guardar({
      mesas: construirListaMesasParaGuardar(),
      contadorMesas,
      pisos: pisosData,
      contadorPisos
    });
  }, 350);
}
function cargarEstadoGuardado() { return _repoPlano.cargar(); }

/* ---------------------------------------------------------------------------
   Dominios "simples": un repo + un par guardar/cargar sobre una variable.
   --------------------------------------------------------------------------- */
const _repoInventario  = crearRepo(CLAVES.inventario);
const _repoProductos   = crearRepo(CLAVES.productos);
const _repoCategorias  = crearRepo(CLAVES.categorias);
const _repoVentas      = crearRepo(CLAVES.ventas);
const _repoMovimientos = crearRepo(CLAVES.movimientos);
const _repoClientes    = crearRepo(CLAVES.clientes);
const _repoFiados      = crearRepo(CLAVES.fiados);
const _repoProveedores = crearRepo(CLAVES.proveedores);
const _repoCxp         = crearRepo(CLAVES.cxp);
const _repoCaja        = crearRepo(CLAVES.caja, { debounce: 0 });      // cambios puntuales -> persistir ya
const _repoCajaHist    = crearRepo(CLAVES.cajaHist, { debounce: 0 });

function guardarInventario()  { _repoInventario.guardar(inventario); }
function cargarInventarioGuardado() { return _repoInventario.cargar(); }

function guardarProductosPersonalizados() { _repoProductos.guardar(productosPersonalizados); }
function cargarProductosPersonalizadosGuardados() { return _repoProductos.cargar(); }

// Las categorías se editan desde el Dashboard; la app solo las lee.
function cargarCategoriasGuardadas() { return _repoCategorias.cargar(); }

function guardarVentas() { _repoVentas.guardar(ventasData); }
function cargarVentasGuardadas() { return _repoVentas.cargar(); }

function guardarMovimientos() { _repoMovimientos.guardar(movimientosInventario); }
function cargarMovimientosGuardados() { return _repoMovimientos.cargar(); }

function guardarClientes() { _repoClientes.guardar({ clientes: clientesData, contadorClientes }); }
function cargarClientesGuardados() { return _repoClientes.cargar(); }

function guardarFiados() { _repoFiados.guardar(movimientosFiado); }
function cargarFiadosGuardados() { return _repoFiados.cargar(); }

function guardarProveedores() { _repoProveedores.guardar({ proveedores: proveedoresData, contadorProveedores }); }
function cargarProveedoresGuardados() { return _repoProveedores.cargar(); }

function guardarCxp() { _repoCxp.guardar(movimientosCxp); }
function cargarCxpGuardadas() { return _repoCxp.cargar(); }

function guardarCaja() { _repoCaja.guardar(cajaActual); }
function cargarCajaGuardada() { return _repoCaja.cargar(); }

function guardarCajaHist() { _repoCajaHist.guardar(cajaHist); }
function cargarCajaHistGuardado() { return _repoCajaHist.cargar(); }
