/* ============================================================================
   js/app.js — Arranque de la aplicación
   ----------------------------------------------------------------------------
   Hidrata el estado en memoria desde window.storage (repositorios), monta el
   plano (pisos + mesas) y deja todo listo. Último script en cargar.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  // 1) Inventario: se combina lo guardado con los valores de ejemplo.
  const inventarioGuardado = await cargarInventarioGuardado();
  if (inventarioGuardado) {
    inventario = { ...inventario, ...inventarioGuardado };
  }

  // 1.b) Productos personalizados: se agregan a dbJSON.products para que
  // catálogo e inventario los traten igual que a los de ejemplo.
  const productosGuardados = await cargarProductosPersonalizadosGuardados();
  if (Array.isArray(productosGuardados) && productosGuardados.length > 0) {
    productosPersonalizados = productosGuardados;
    productosPersonalizados.forEach(p => {
      if (!dbJSON.products.find(existing => existing.id === p.id)) {
        dbJSON.products.push(p);
      }
      if (inventario[p.id] === undefined) {
        inventario[p.id] = p.stock || 0;
      }
    });
  }

  // 1.c) Usuarios (personal), usuario activo de este dispositivo, ventas y
  // movimientos de inventario.
  const usuariosGuardados = await cargarUsuariosGuardados();
  if (usuariosGuardados && Array.isArray(usuariosGuardados.usuarios)) {
    usuariosData = usuariosGuardados.usuarios;
    if (typeof usuariosGuardados.contadorUsuarios === 'number') {
      contadorUsuarios = usuariosGuardados.contadorUsuarios;
    }
  }

  const usuarioActivoGuardado = await cargarUsuarioActivoGuardado();
  if (usuarioActivoGuardado && usuariosData.find(u => u.id === usuarioActivoGuardado)) {
    usuarioActivoId = usuarioActivoGuardado;
  }
  actualizarIndicadorUsuarioActivo();

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

  // 1.e) Proveedores + cuentas por pagar.
  const proveedoresGuardados = await cargarProveedoresGuardados();
  if (proveedoresGuardados && Array.isArray(proveedoresGuardados.proveedores)) {
    proveedoresData = proveedoresGuardados.proveedores;
    if (typeof proveedoresGuardados.contadorProveedores === 'number') {
      contadorProveedores = proveedoresGuardados.contadorProveedores;
    }
  }
  const cxpGuardadas = await cargarCxpGuardadas();
  if (Array.isArray(cxpGuardadas)) {
    movimientosCxp = cxpGuardadas;
  }

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
});
