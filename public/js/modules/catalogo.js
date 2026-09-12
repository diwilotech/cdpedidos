/* ============================================================================
   js/modules/catalogo.js — Catálogo de productos (para agregar a una cuenta)
   ----------------------------------------------------------------------------
   Modal que abre por encima del de cuentas: filtro por categorías, grilla
   de productos con stock en vivo y alta de consumos a la cuenta activa.
   ========================================================================== */

// `destino` opcional:
//   omitido / null            -> la cuenta activa de la mesa (comportamiento normal).
//   { tipo:'venta', ventaId } -> una venta ya registrada (editar desde Caja).
function abrirCatalogoProductos(destino) {
  catalogoDestino = destino || null;

  const obj = catalogoObjetivo();
  const titulo = document.getElementById('catalogoModalTitulo');
  const btnVolver = document.getElementById('catalogoVolverBtn');
  if (titulo) titulo.innerHTML = `<i class="bi bi-journal-album me-2"></i> Seleccionar Producto para ${obj && obj.esVenta ? 'la Venta' : 'la Cuenta'}`;
  if (btnVolver) btnVolver.textContent = obj && obj.esVenta ? 'Volver a la venta' : 'Volver a la Cuenta';

  const buscar = document.getElementById('catalogoBuscar');
  if (buscar) buscar.value = '';

  renderCategoriasTabs();
  renderGridProductos();
  actualizarEncabezadoCatalogo();
  modalCatalogoBS.show();
}

// Minúsculas + sin tildes/acentos, para que "cafe" encuentre "Café".
function normalizarBusqueda(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function limpiarBuscadorCatalogo() {
  const inp = document.getElementById('catalogoBuscar');
  if (inp) { inp.value = ''; inp.focus(); }
  renderGridProductos();
}

// Objetivo actual del catálogo: la venta apuntada o la cuenta activa.
function catalogoObjetivo() {
  if (catalogoDestino && catalogoDestino.tipo === 'venta') {
    const v = (typeof ventasData !== 'undefined' ? ventasData : []).find(x => x.id === catalogoDestino.ventaId);
    if (!v) return null;
    return {
      esVenta: true, venta: v, productos: v.productos,
      nombre: `${v.mesaNombre} · ${v.cuentaNombre}`,
      total: v.productos.reduce((s, p) => s + p.cant * p.precio, 0)
    };
  }
  const cuenta = (mesaActivaId && mesasData[mesaActivaId]) ? mesasData[mesaActivaId][cuentaActivaIndex] : null;
  if (!cuenta) return null;
  return {
    esVenta: false, cuenta, productos: cuenta.productos,
    nombre: cuenta.nombreCuenta,
    total: cuenta.productos.reduce((s, p) => s + p.cant * p.precio, 0)
  };
}

function actualizarEncabezadoCatalogo() {
  const obj = catalogoObjetivo();
  if (!obj) return;
  document.getElementById('catalogoCuentaNombre').innerHTML = `<i class="bi bi-receipt me-1"></i> ${obj.nombre}`;
  document.getElementById('catalogoSaldoTexto').innerText = formatMoney(obj.total);
}

function renderCategoriasTabs() {
  const container = document.getElementById('categoriasTabs');
  container.innerHTML = '';

  dbJSON.categories.forEach(cat => {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const btn = document.createElement('button');
    btn.className = `nav-link btn-sm text-nowrap ${categoriaSeleccionada === cat.id ? 'active' : 'bg-light text-dark'}`;
    btn.innerHTML = `<i class="bi ${cat.icon} me-1"></i> ${cat.name}`;
    btn.onclick = () => {
      categoriaSeleccionada = cat.id;
      renderCategoriasTabs();
      renderGridProductos();
    };

    li.appendChild(btn);
    container.appendChild(li);
  });
}

function renderGridProductos() {
  const grid = document.getElementById('gridCatalogoProductos');
  grid.innerHTML = '';

  const inp = document.getElementById('catalogoBuscar');
  const tokens = normalizarBusqueda(inp ? inp.value : '').split(/\s+/).filter(Boolean);

  let filtrados;
  if (tokens.length) {
    // Con búsqueda: en TODO el catálogo. Cada palabra escrita debe aparecer
    // en algún lugar del texto del producto (nombre + código + categoría),
    // sin importar el orden ni que sea el comienzo de una palabra.
    filtrados = dbJSON.products.filter(prod => {
      const cat = dbJSON.categories.find(c => c.id === prod.categoryId);
      const texto = normalizarBusqueda(`${prod.name} ${prod.code} ${cat ? cat.name : ''}`);
      return tokens.every(t => texto.includes(t));
    });
  } else {
    filtrados = categoriaSeleccionada === 'cat-all'
      ? dbJSON.products
      : dbJSON.products.filter(p => p.categoryId === categoriaSeleccionada);
  }

  if (filtrados.length === 0) {
    grid.innerHTML = `<div class="col-12 text-center text-muted small py-4">${
      tokens.length ? 'Ningún producto coincide con la búsqueda.' : 'No hay productos en esta categoría.'
    }</div>`;
    return;
  }

  const obj = catalogoObjetivo();
  const lineas = obj ? obj.productos : [];

  filtrados.forEach(prod => {
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4';

    const enCuenta = lineas.find(p => p.productId === prod.id);
    const badgeCantidad = enCuenta
      ? `<span class="badge bg-success position-absolute top-0 end-0 m-1 shadow-sm">${obj && obj.esVenta ? 'En venta' : 'En cuenta'}: x${enCuenta.cant}</span>`
      : '';

    // En una venta el stock ya se descontó al liquidar: la disponibilidad es
    // el stock físico. En una cuenta abierta se descuenta lo reservado.
    const disp = (obj && obj.esVenta) ? obtenerStock(prod.id) : disponibleParaAgregar(prod.id);
    const agotado = disp <= 0;
    const stockBadgeClase = agotado ? 'bg-danger' : disp <= 5 ? 'bg-warning text-dark' : 'bg-light text-secondary border';

    col.innerHTML = `
      <div onclick="${agotado ? '' : `agregarProductoDesdeCatalogo('${prod.id}')`}" class="card h-100 p-2 border product-card bg-light position-relative ${enCuenta ? 'border-success' : ''} ${agotado ? 'opacity-50' : ''}" style="${agotado ? 'cursor:not-allowed;' : ''}">
        ${badgeCantidad}
        <small class="text-muted font-monospace" style="font-size: 0.75rem;">${prod.code}</small>
        <div class="fw-bold text-truncate text-dark" style="font-size: 0.9rem;">${prod.name}</div>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span class="text-primary fw-bold">${formatMoney(prod.price)}</span>
          <span class="badge ${stockBadgeClase}">${agotado ? 'Sin disponible' : 'Disp: ' + disp}</span>
        </div>
        ${agotado ? '' : '<div class="text-end mt-1"><span class="btn btn-sm btn-outline-primary py-0 px-2 fw-bold">+ Añadir</span></div>'}
      </div>
    `;
    grid.appendChild(col);
  });
}

function agregarProductoDesdeCatalogo(productId) {
  const prodObj = dbJSON.products.find(p => p.id === productId);
  if (!prodObj) return;

  // --- Destino = una VENTA ya registrada (editar desde Caja) ---
  if (catalogoDestino && catalogoDestino.tipo === 'venta') {
    const v = ventasData.find(x => x.id === catalogoDestino.ventaId);
    if (!v) return;
    if (obtenerStock(productId) <= 0) { notificarSinStock(prodObj.name); return; }

    const linea = v.productos.find(p => p.productId === productId);
    let cant;
    if (linea) { linea.cant += 1; cant = linea.cant; }
    else {
      v.productos.push({ productId, categoryId: prodObj.categoryId, nombre: prodObj.name, cant: 1, precio: prodObj.price });
      cant = 1;
    }
    ajustarStock(productId, -1, 'Venta (agregado a venta)');
    if (typeof recalcularTotalVenta === 'function') recalcularTotalVenta(v);
    else v.total = v.productos.reduce((s, p) => s + p.cant * p.precio, 0);
    guardarVentas();
    if (typeof sincronizarCargoFiado === 'function') sincronizarCargoFiado(v);

    notificarProductoAgregado(prodObj.name, cant);
    refrescarVistasInventarioSiEstanAbiertas();
    if (typeof renderCajaEnVentas === 'function') renderCajaEnVentas();
    if (typeof renderListaVentas === 'function') renderListaVentas();
    renderGridProductos();
    actualizarEncabezadoCatalogo();
    return;
  }

  // --- Destino = la cuenta activa de la mesa (comportamiento normal) ---
  if (!mesaActivaId || cuentaActivaIndex === null) return;

  // El stock NO se descuenta acá: se reserva en la comanda y se descuenta
  // TODO junto al liquidar (ver registrarVenta). Solo se controla que no se
  // reserve más de lo que hay físicamente.
  if (disponibleParaAgregar(productId) <= 0) {
    notificarSinStock(prodObj.name);
    return;
  }

  const cuenta = mesasData[mesaActivaId][cuentaActivaIndex];
  const prodExistente = cuenta.productos.find(p => p.productId === productId);

  let cantidadActual;
  if (prodExistente) {
    prodExistente.cant += 1;
    cantidadActual = prodExistente.cant;
  } else {
    cuenta.productos.push({
      productId: prodObj.id,
      nombre: prodObj.name,
      cant: 1,
      precio: prodObj.price
    });
    cantidadActual = 1;
  }

  notificarProductoAgregado(prodObj.name, cantidadActual);

  actualizarBadgeMesa(mesaActivaId);
  actualizarSidebar();
  renderModalTabs();
  renderModalContenidoCuenta();
  renderGridProductos();
  actualizarEncabezadoCatalogo();
  if (document.getElementById('modalInventario').classList.contains('show')) {
    renderListaInventario();
  }
}
