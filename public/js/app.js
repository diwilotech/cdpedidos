/* ============================================================================
   js/app.js — Arranque de la aplicación
   ----------------------------------------------------------------------------
   Hidrata el estado en memoria desde window.storage (repositorios), monta el
   plano (pisos + mesas) y deja todo listo.

   NO arranca solo: lo dispara js/core/auth-gate.js cuando hay sesión válida
   (modo remoto / D1) o cuando no hay backend (modo local / localStorage,
   p. ej. al abrir el index.html directo). Así la app nunca se muestra sin
   antes pasar por el login.
   ========================================================================== */

let __cdpArrancado = false;
window.__cdpArrancar = async function arrancarApp() {
  if (__cdpArrancado) return;
  __cdpArrancado = true;
  // 1.0) Categorías del catálogo (si el admin las editó/ordenó en el Dashboard).
  // "cat-all" (Todos) siempre va primero y no se guarda.
  const categoriasGuardadas = await cargarCategoriasGuardadas();
  if (Array.isArray(categoriasGuardadas) && categoriasGuardadas.length) {
    dbJSON.categories = [{ id: 'cat-all', name: 'Todos', icon: 'bi-grid-fill' }, ...categoriasGuardadas];
  }

  // 1) Inventario: se combina lo guardado con los valores de ejemplo.
  const inventarioGuardado = await cargarInventarioGuardado();
  if (inventarioGuardado) {
    inventario = { ...inventario, ...inventarioGuardado };
  }

  // 1.b) Catálogo: si el admin lo editó desde el Dashboard, lo guardado es
  // la lista COMPLETA de productos (precio/categoría/nombre incluidos) y
  // reemplaza al catálogo de ejemplo. Si no hay nada guardado, quedan los
  // productos semilla de dbJSON.
  const productosGuardados = await cargarProductosPersonalizadosGuardados();
  if (Array.isArray(productosGuardados) && productosGuardados.length > 0) {
    dbJSON.products = productosGuardados.map(p => ({ ...p }));
  }
  dbJSON.products.forEach(p => {
    if (inventario[p.id] === undefined) inventario[p.id] = p.stock || 0;
  });
  productosPersonalizados = dbJSON.products; // misma referencia: guardar = guardar el catálogo entero

  // 1.c) Ventas y movimientos de inventario.
  // (El operador ya no se carga acá: es quien inició sesión, ver auth-gate.js.)
  const ventasGuardadas = await cargarVentasGuardadas();
  if (Array.isArray(ventasGuardadas)) {
    ventasData = ventasGuardadas;
  }

  const movimientosGuardados = await cargarMovimientosGuardados();
  if (Array.isArray(movimientosGuardados)) {
    movimientosInventario = movimientosGuardados;
  }

  // 1.d) Clientes + fiados (cuentas por cobrar).
  const clientesGuardados = await cargarClientesGuardados();
  if (clientesGuardados && Array.isArray(clientesGuardados.clientes)) {
    clientesData = clientesGuardados.clientes;
    if (typeof clientesGuardados.contadorClientes === 'number') {
      contadorClientes = clientesGuardados.contadorClientes;
    }
  }
  const fiadosGuardados = await cargarFiadosGuardados();
  if (Array.isArray(fiadosGuardados)) {
    movimientosFiado = fiadosGuardados;
  }

  // 1.e) Flujo de caja (turno abierto + cierres).
  cajaActual = await cargarCajaGuardada();
  const cajaHistGuardado = await cargarCajaHistGuardado();
  if (Array.isArray(cajaHistGuardado)) cajaHist = cajaHistGuardado;
  if (typeof actualizarBadgeCaja === 'function') actualizarBadgeCaja();

  // 1.f) Proveedores + cuentas por pagar: se cargan para el flujo
  // "Reposición por proveedor" del modal de Inventario (declarar la compra
  // y subir stock). La gestión a fondo (pagos, extractos, descripciones)
  // sigue estando en el Dashboard.
  const proveedoresGuardados = await cargarProveedoresGuardados();
  if (proveedoresGuardados && Array.isArray(proveedoresGuardados.proveedores)) {
    proveedoresData = proveedoresGuardados.proveedores;
    if (typeof proveedoresGuardados.contadorProveedores === 'number') {
      contadorProveedores = proveedoresGuardados.contadorProveedores;
    }
  }
  const cxpGuardadas = await cargarCxpGuardadas();
  if (Array.isArray(cxpGuardadas)) movimientosCxp = cxpGuardadas;

  // 2) Plano: pisos + mesas.
  const estadoGuardado = await cargarEstadoGuardado();

  if (estadoGuardado && Array.isArray(estadoGuardado.pisos) && estadoGuardado.pisos.length > 0) {
    pisosData = estadoGuardado.pisos;
    if (typeof estadoGuardado.contadorPisos === 'number') {
      contadorPisos = estadoGuardado.contadorPisos;
    }
  }

  // El DOM de cada piso se crea ANTES que las mesas, porque crearElemento()
  // necesita que el grid del piso correspondiente ya exista.
  pisosData.forEach(piso => crearPisoDOM(piso));
  cambiarPiso(pisosData[0].id);

  if (estadoGuardado && Array.isArray(estadoGuardado.mesas) && estadoGuardado.mesas.length > 0) {
    if (typeof estadoGuardado.contadorMesas === 'number') {
      contadorMesas = estadoGuardado.contadorMesas;
    }
    estadoGuardado.mesas.forEach(mesa => {
      crearElemento({
        id: mesa.id,
        nombre: mesa.nombre,
        cuentas: mesa.cuentas,
        colorHex: mesa.colorHex,
        w: mesa.w,
        h: mesa.h,
        x: mesa.x,
        y: mesa.y,
        piso: mesa.piso
      });
    });
  } else {
    // Primera vez: se carga el plano de EJEMPLO.
    dbJSON.initialMesas.forEach(mesa => {
      crearElemento({
        id: mesa.id,
        nombre: mesa.nombre,
        cuentas: mesa.cuentas,
        colorHex: mesa.colorHex,
        w: mesa.w,
        h: mesa.h,
        x: mesa.x,
        y: mesa.y,
        piso: mesa.piso
      });
    });
    guardarEstado();
  }

  // Ajuste automático de zoom para ver el plano COMPLETO al cargar.
  requestAnimationFrame(() => requestAnimationFrame(autoAjustarZoomSiCorresponde));
};
