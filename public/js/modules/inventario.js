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

  // productosPersonalizados y dbJSON.products son la MISMA lista (ver app.js):
  // basta con agregar el producto una vez.
  dbJSON.products.push(nuevoProducto);
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
    row.dataset.prodrow = '';
    row.dataset.stockactual = stock;
    // Se escribe el TOTAL que debe quedar (los botones - / + solo mueven ese
    // número, no guardan). "dif" muestra el cambio contra el stock actual.
    // "Guardar total" fija ese número y registra el movimiento por la diferencia.
    row.innerHTML = `
      <div>
        <div class="fw-bold">${prod.name} ${esPersonalizado ? '<span class="badge bg-info-subtle text-info border border-info-subtle" style="font-size:.65rem;">Nuevo</span>' : ''}</div>
        <div class="small text-muted font-monospace">${prod.code} · ${formatMoney(prod.price)}</div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <span class="badge ${badgeClase}" title="Stock actual">${stock} und.</span>
        <div class="input-group input-group-sm" style="width:132px;">
          <button class="btn btn-outline-secondary" type="button" onclick="ajustarCampoStock(this,-1)">−</button>
          <input type="number" min="0" class="form-control text-center stock-input" value="${stock}" oninput="actualizarDifStock(this)">
          <button class="btn btn-outline-secondary" type="button" onclick="ajustarCampoStock(this,1)">+</button>
        </div>
        <span class="stock-dif fw-bold text-muted" style="min-width:34px;text-align:center;">0</span>
        <button class="btn btn-sm btn-success fw-bold" onclick="guardarStockTotalDesdeFila(this,'${prod.id}')" title="Fijar el total y registrar la diferencia">
          <i class="bi bi-check-lg me-1"></i>Guardar total
        </button>
      </div>
    `;
    cont.appendChild(row);
  });
}

// Los botones - / + solo cambian el número del campo (no guardan).
function ajustarCampoStock(btn, delta) {
  const row = btn.closest('[data-prodrow]');
  const input = row.querySelector('.stock-input');
  input.value = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
  actualizarDifStock(input);
}

// Muestra la diferencia (nuevo total − stock actual) al lado del campo.
function actualizarDifStock(input) {
  const row = input.closest('[data-prodrow]');
  const actual = parseInt(row.dataset.stockactual, 10) || 0;
  const dif = (parseInt(input.value, 10) || 0) - actual;
  const el = row.querySelector('.stock-dif');
  el.textContent = (dif > 0 ? '+' : '') + dif;
  el.className = 'stock-dif fw-bold ' + (dif > 0 ? 'text-success' : dif < 0 ? 'text-danger' : 'text-muted');
}

function guardarStockTotalDesdeFila(btn, productId) {
  const row = btn.closest('[data-prodrow]');
  guardarStockTotal(productId, row.querySelector('.stock-input').value);
}

// Fija el stock al total indicado y registra UN movimiento por la diferencia.
function guardarStockTotal(productId, nuevoTotal) {
  nuevoTotal = Math.max(0, parseInt(nuevoTotal, 10) || 0);
  const actual = obtenerStock(productId);
  const dif = nuevoTotal - actual;
  if (dif === 0) {
    mostrarNotificacion('Sin cambios: el total es igual al stock actual.', 'warning', 'bi-info-circle');
    return;
  }
  inventario[productId] = nuevoTotal;
  guardarInventario();
  registrarMovimientoInventario(productId, dif, dif > 0 ? 'Reposición / ajuste' : 'Ajuste de inventario');

  const prod = dbJSON.products.find(p => p.id === productId);
  mostrarNotificacion(
    `${prod ? prod.name : 'Producto'}: ${dif > 0 ? '+' : ''}${dif} und. · total ${nuevoTotal}`,
    'success', 'bi-check-circle-fill'
  );
  renderListaInventario();
  refrescarVistasInventarioSiEstanAbiertas();
}
