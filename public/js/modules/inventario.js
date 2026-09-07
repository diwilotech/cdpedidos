/* ============================================================================
   js/modules/inventario.js — Inventario y movimientos de stock
   ----------------------------------------------------------------------------
   Helpers de stock (obtener/ajustar/establecer), registro de entradas y
   salidas, modal de inventario (alta de productos, reposición, ajustes) y
   modal de historial de movimientos.
   ========================================================================== */

/* --- HELPERS DE STOCK --- */
function obtenerStock(productId) {
  return inventario[productId] !== undefined ? inventario[productId] : 0;
}

function ajustarStock(productId, delta, motivo = 'Ajuste manual') {
  const anterior = obtenerStock(productId);
  const nuevo = Math.max(0, anterior + delta);
  inventario[productId] = nuevo;
  guardarInventario();

  const deltaReal = nuevo - anterior; // puede diferir de delta si topó con el piso de 0
  if (deltaReal !== 0) {
    registrarMovimientoInventario(productId, deltaReal, motivo);
  }
}

function establecerStock(productId, cantidad) {
  inventario[productId] = Math.max(0, cantidad);
  guardarInventario();
}

// Refresca catálogo y/o modal de inventario si están abiertos, para que
// el stock se vea actualizado en tiempo real.
function refrescarVistasInventarioSiEstanAbiertas() {
  if (document.getElementById('modalCatalogoProductos').classList.contains('show')) {
    renderGridProductos();
  }
  if (document.getElementById('modalInventario').classList.contains('show')) {
    renderListaInventario();
  }
}

/* --- MOVIMIENTOS DE INVENTARIO (entradas y salidas) --- */
function registrarMovimientoInventario(productId, delta, motivo) {
  const prod = dbJSON.products.find(p => p.id === productId);
  const movimiento = {
    id: 'mov-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    fecha: new Date().toISOString(),
    productId,
    productName: prod ? prod.name : productId,
    tipo: delta > 0 ? 'entrada' : 'salida',
    cantidad: Math.abs(delta),
    motivo,
    usuarioNombre: obtenerNombreUsuarioActivo()
  };
  movimientosInventario.push(movimiento);
  if (movimientosInventario.length > MAX_MOVIMIENTOS_GUARDADOS) {
    movimientosInventario.splice(0, movimientosInventario.length - MAX_MOVIMIENTOS_GUARDADOS);
  }
  guardarMovimientos();
  if (document.getElementById('modalMovimientos').classList.contains('show')) {
    renderListaMovimientos();
  }
}

function abrirModalMovimientos() {
  renderListaMovimientos();
  modalMovimientosBS.show();
}

function renderListaMovimientos() {
  const cont = document.getElementById('listaMovimientos');
  cont.innerHTML = '';

  if (movimientosInventario.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no hay movimientos registrados.</div>`;
    return;
  }

  const ordenados = [...movimientosInventario].reverse(); // más recientes primero

  ordenados.forEach(m => {
    const esEntrada = m.tipo === 'entrada';
    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between align-items-center border rounded-3 p-2 mb-2';
    row.innerHTML = `
      <div>
        <div class="fw-bold">${m.productName}</div>
        <div class="small text-muted">${m.motivo} · ${formatFecha(m.fecha)} · <i class="bi bi-person-fill"></i> ${m.usuarioNombre}</div>
      </div>
      <span class="badge ${esEntrada ? 'bg-success' : 'bg-danger'} fs-6">
        <i class="bi ${esEntrada ? 'bi-arrow-down-circle' : 'bi-arrow-up-circle'} me-1"></i>${esEntrada ? '+' : '-'}${m.cantidad}
      </span>
    `;
    cont.appendChild(row);
  });
}

/* --- MODAL DE INVENTARIO --- */
function abrirModalInventario() {
  toggleFormNuevoProducto(false);
  renderCategoriasInventarioTabs();
  renderListaInventario();
  modalInventarioBS.show();
}

function toggleFormNuevoProducto(forceShow) {
  const form = document.getElementById('formNuevoProducto');
  const mostrar = forceShow !== undefined ? forceShow : form.style.display === 'none';
  form.style.display = mostrar ? 'block' : 'none';
  if (mostrar) {
    document.getElementById('nuevoProductoNombre').value = '';
    document.getElementById('nuevoProductoCodigo').value = '';
    document.getElementById('nuevoProductoPrecio').value = '';
    document.getElementById('nuevoProductoStock').value = '';
    poblarSelectCategoriasNuevoProducto();
    setTimeout(() => document.getElementById('nuevoProductoNombre').focus(), 100);
  }
}

function poblarSelectCategoriasNuevoProducto() {
  const sel = document.getElementById('nuevoProductoCategoria');
  sel.innerHTML = dbJSON.categories
    .filter(c => c.id !== 'cat-all')
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join('');
}

// Prefijos de código sugeridos por categoría, solo para autogenerar un
// código cuando el usuario deja ese campo vacío al crear un producto.
const PREFIJOS_CODIGO_POR_CATEGORIA = {
  'cat-bebidas': 'BEB', 'cat-entradas': 'ENT', 'cat-fuertes': 'PF', 'cat-postres': 'POS'
};

function guardarNuevoProducto() {
  const nombre = document.getElementById('nuevoProductoNombre').value.trim();
  const categoryId = document.getElementById('nuevoProductoCategoria').value;
  let codigo = document.getElementById('nuevoProductoCodigo').value.trim();
  const precio = parseFloat(document.getElementById('nuevoProductoPrecio').value);
  const stockInicial = parseInt(document.getElementById('nuevoProductoStock').value, 10);

  if (!nombre) {
    mostrarNotificacion('Ponle un nombre al producto.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  if (isNaN(precio) || precio <= 0) {
    mostrarNotificacion('Ingresa un precio válido.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }

  if (!codigo) {
    const prefijo = PREFIJOS_CODIGO_POR_CATEGORIA[categoryId] || 'PRD';
    const numExistentes = dbJSON.products.filter(p => p.categoryId === categoryId).length + 1;
    codigo = `${prefijo}-${String(numExistentes).padStart(2, '0')}`;
  }

  const nuevoProducto = {
    id: 'custom-' + Date.now(),
    categoryId,
    name: nombre,
    price: precio,
    code: codigo,
    stock: (!isNaN(stockInicial) && stockInicial > 0) ? stockInicial : 0
  };

  dbJSON.products.push(nuevoProducto);
  productosPersonalizados.push(nuevoProducto);
  inventario[nuevoProducto.id] = nuevoProducto.stock;
  if (nuevoProducto.stock > 0) {
    registrarMovimientoInventario(nuevoProducto.id, nuevoProducto.stock, 'Alta de producto');
  }

  guardarProductosPersonalizados();
  guardarInventario();

  toggleFormNuevoProducto(false);
  categoriaInventarioSeleccionada = categoryId; // salta a la categoría del producto recién creado
  renderCategoriasInventarioTabs();
  renderListaInventario();
  refrescarVistasInventarioSiEstanAbiertas();

  mostrarNotificacion(`"${nombre}" se agregó al inventario`, 'success', 'bi-check-circle-fill');
}

function renderCategoriasInventarioTabs() {
  const container = document.getElementById('categoriasInventarioTabs');
  container.innerHTML = '';

  dbJSON.categories.forEach(cat => {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const btn = document.createElement('button');
    btn.className = `nav-link btn-sm text-nowrap ${categoriaInventarioSeleccionada === cat.id ? 'active' : 'bg-light text-dark'}`;
    btn.innerHTML = `<i class="bi ${cat.icon} me-1"></i> ${cat.name}`;
    btn.onclick = () => {
      categoriaInventarioSeleccionada = cat.id;
      renderCategoriasInventarioTabs();
      renderListaInventario();
    };

    li.appendChild(btn);
    container.appendChild(li);
  });
}

function renderListaInventario() {
  const cont = document.getElementById('listaInventario');
  cont.innerHTML = '';

  const filtrados = categoriaInventarioSeleccionada === 'cat-all'
    ? dbJSON.products
    : dbJSON.products.filter(p => p.categoryId === categoriaInventarioSeleccionada);

  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">No hay productos en esta categoría todavía.</div>`;
    return;
  }

  filtrados.forEach(prod => {
    const stock = obtenerStock(prod.id);
    const badgeClase = stock === 0 ? 'bg-danger' : stock <= 5 ? 'bg-warning text-dark' : 'bg-success';
    const esPersonalizado = prod.id.startsWith('custom-');

    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between align-items-center flex-wrap gap-2 border rounded-3 p-2 mb-2';
    row.innerHTML = `
      <div>
        <div class="fw-bold">${prod.name} ${esPersonalizado ? '<span class="badge bg-info-subtle text-info border border-info-subtle" style="font-size:.65rem;">Nuevo</span>' : ''}</div>
        <div class="small text-muted font-monospace">${prod.code} · ${formatMoney(prod.price)}</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="badge ${badgeClase} fs-6" id="stock-badge-${prod.id}">${stock} und.</span>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" onclick="ajustarStockDesdeModal('${prod.id}', -1)" title="Quitar 1 unidad">-</button>
          <button class="btn btn-outline-secondary" onclick="ajustarStockDesdeModal('${prod.id}', 1)" title="Agregar 1 unidad">+</button>
        </div>
        <button class="btn btn-sm btn-outline-success fw-bold" onclick="reponerStock('${prod.id}')" title="Registrar una reposición de stock">
          <i class="bi bi-box-arrow-in-down me-1"></i>Reponer
        </button>
      </div>
    `;
    cont.appendChild(row);
  });
}

function ajustarStockDesdeModal(productId, delta) {
  ajustarStock(productId, delta, 'Ajuste manual');
  renderListaInventario();
  refrescarVistasInventarioSiEstanAbiertas();
}

function reponerStock(productId) {
  const prod = dbJSON.products.find(p => p.id === productId);
  if (!prod) return;
  pedirTexto(`¿Cuántas unidades de "${prod.name}" quieres agregar al inventario?`, '', (valor) => {
    const cantidad = parseInt(valor, 10);
    if (!isNaN(cantidad) && cantidad > 0) {
      ajustarStock(productId, cantidad, 'Reposición');
      renderListaInventario();
      refrescarVistasInventarioSiEstanAbiertas();
      mostrarNotificacion(`Se agregaron ${cantidad} und. de "${prod.name}" al inventario`, 'success', 'bi-box-arrow-in-down');
    }
  });
}
