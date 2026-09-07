/* ============================================================================
   js/modules/catalogo.js — Catálogo de productos (para agregar a una cuenta)
   ----------------------------------------------------------------------------
   Modal que abre por encima del de cuentas: filtro por categorías, grilla
   de productos con stock en vivo y alta de consumos a la cuenta activa.
   ========================================================================== */

function abrirCatalogoProductos() {
  renderCategoriasTabs();
  renderGridProductos();
  actualizarEncabezadoCatalogo();
  modalCatalogoBS.show();
}

function actualizarEncabezadoCatalogo() {
  const cuenta = (mesaActivaId && mesasData[mesaActivaId]) ? mesasData[mesaActivaId][cuentaActivaIndex] : null;
  if (!cuenta) return;
  const total = cuenta.productos.reduce((acc, p) => acc + (p.cant * p.precio), 0);
  document.getElementById('catalogoCuentaNombre').innerHTML = `<i class="bi bi-receipt me-1"></i> ${cuenta.nombreCuenta}`;
  document.getElementById('catalogoSaldoTexto').innerText = formatMoney(total);
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

  const filtrados = categoriaSeleccionada === 'cat-all'
    ? dbJSON.products
    : dbJSON.products.filter(p => p.categoryId === categoriaSeleccionada);

  const cuenta = (mesaActivaId && mesasData[mesaActivaId]) ? mesasData[mesaActivaId][cuentaActivaIndex] : null;

  filtrados.forEach(prod => {
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4';

    const enCuenta = cuenta ? cuenta.productos.find(p => p.productId === prod.id) : null;
    const badgeCantidad = enCuenta
      ? `<span class="badge bg-success position-absolute top-0 end-0 m-1 shadow-sm">En cuenta: x${enCuenta.cant}</span>`
      : '';

    const disp = disponibleParaAgregar(prod.id);   // stock físico − lo reservado en comandas abiertas
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
  if (!mesaActivaId || cuentaActivaIndex === null) return;

  const prodObj = dbJSON.products.find(p => p.id === productId);
  if (!prodObj) return;

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
