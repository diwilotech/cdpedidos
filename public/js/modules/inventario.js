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

// Unidades de un producto que están en comandas ABIERTAS (todavía no
// liquidadas): reservan stock pero aún no lo descontaron.
function unidadesReservadas(productId) {
  let n = 0;
  Object.values(mesasData).forEach(cuentas => {
    (cuentas || []).forEach(c => (c.productos || []).forEach(p => {
      if (p.productId === productId) n += p.cant;
    }));
  });
  return n;
}

// Lo que realmente se puede seguir agregando a una comanda:
// stock físico − lo ya reservado en comandas abiertas.
function disponibleParaAgregar(productId) {
  return obtenerStock(productId) - unidadesReservadas(productId);
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

  // Solo los movimientos hechos por el usuario en sesión (el panorama
  // completo de todo el personal está en el Dashboard).
  const mio = obtenerNombreUsuarioActivo();
  const mios = movimientosInventario.filter(m => (m.usuarioNombre || 'Sin asignar') === mio);

  if (mios.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no registraste movimientos de inventario.</div>`;
    return;
  }

  const ordenados = [...mios].reverse(); // más recientes primero

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
        <i class="bi ${esEntrada ? 'bi-arrow-down-circle' : 'bi-arrow-up-circle'} me-1"></i>${m.cantidad ? (esEntrada ? '+' : '-') + m.cantidad : '—'}
      </span>
    `;
    cont.appendChild(row);
  });
}

/* --- MODAL DE INVENTARIO ---
   Acá el personal SOLO ajusta stock (contar / cargar mercadería / registrar
   pérdida con "Guardar total") y ve sus movimientos. El catálogo (crear
   productos, costo, precio de venta, % de ganancia) vive en el Dashboard. */
function abrirModalInventario() {
  renderCategoriasInventarioTabs();
  renderListaInventario();
  renderRepoProveedor();
  modalInventarioBS.show();
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

  // Motivo del movimiento:
  //  · dif < 0  -> ajuste de pérdida / merma
  //  · dif > 0  -> reposición. Si hay una "reposición por proveedor" activa,
  //    queda atribuida a ese proveedor y suma a sus unidades ingresadas.
  let motivo;
  if (dif < 0) {
    motivo = 'Ajuste de pérdida';
  } else if (reposicionActiva) {
    motivo = 'Reposición · ' + reposicionActiva.proveedorNombre;
  } else {
    motivo = 'Reposición / ajuste';
  }
  registrarMovimientoInventario(productId, dif, motivo);

  if (dif > 0 && reposicionActiva) {
    reposicionActiva.unidades += dif;
    actualizarRepoActivoUnds();
  }

  const prod = dbJSON.products.find(p => p.id === productId);
  mostrarNotificacion(
    `${prod ? prod.name : 'Producto'}: ${dif > 0 ? '+' : ''}${dif} und. · total ${nuevoTotal}`,
    'success', 'bi-check-circle-fill'
  );
  renderListaInventario();
  refrescarVistasInventarioSiEstanAbiertas();
}

/* ============================================================================
   REPOSICIÓN POR PROVEEDOR
   ----------------------------------------------------------------------------
   Antes de subir stock se declara de qué proveedor llegó la mercadería y
   cuánto valió: eso crea una cuenta por pagar (factura). Mientras la
   reposición está "activa", cada "Guardar total" que SUBE stock se registra
   como entrada atribuida a ese proveedor. Gestionar proveedores a fondo
   (pagos, extractos) sigue siendo cosa del Dashboard.
   ========================================================================== */
function toggleRepoPanel() {
  const body = document.getElementById('repoProveedorBody');
  const chev = document.getElementById('repoChevron');
  if (!body) return;
  body.classList.toggle('d-none');
  if (chev) chev.className = body.classList.contains('d-none') ? 'bi bi-chevron-down' : 'bi bi-chevron-up';
}

function renderRepoProveedor() {
  const sel = document.getElementById('repoProvSel');
  const inactivo = document.getElementById('repoInactivo');
  const activo = document.getElementById('repoActivo');
  if (!sel || !inactivo || !activo) return;

  if (reposicionActiva) {
    inactivo.classList.add('d-none');
    activo.classList.remove('d-none');
    const p = document.getElementById('repoActivoProv');
    const v = document.getElementById('repoActivoValor');
    if (p) p.textContent = reposicionActiva.proveedorNombre;
    if (v) v.textContent = formatMoney(reposicionActiva.valor);
    actualizarRepoActivoUnds();
    // dejar el panel abierto para que se vea el estado activo
    const body = document.getElementById('repoProveedorBody');
    if (body && body.classList.contains('d-none')) toggleRepoPanel();
    return;
  }

  inactivo.classList.remove('d-none');
  activo.classList.add('d-none');
  sel.innerHTML = proveedoresData.length
    ? proveedoresData.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')
    : `<option value="">— sin proveedores —</option>`;
}

function actualizarRepoActivoUnds() {
  const u = document.getElementById('repoActivoUnds');
  if (u && reposicionActiva) u.textContent = reposicionActiva.unidades;
}

function agregarProveedorReposicion() {
  const inp = document.getElementById('repoNuevoProv');
  const nombre = (inp.value || '').trim();
  if (!nombre) {
    mostrarNotificacion('Escribí el nombre del proveedor.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  contadorProveedores++;
  const nuevo = { id: contadorProveedores, nombre, telefono: '' };
  proveedoresData.push(nuevo);
  guardarProveedores();
  inp.value = '';
  renderRepoProveedor();
  const sel = document.getElementById('repoProvSel');
  if (sel) sel.value = String(nuevo.id);
  mostrarNotificacion(`Proveedor "${nombre}" agregado`, 'success', 'bi-truck');
}

function iniciarReposicion() {
  const sel = document.getElementById('repoProvSel');
  const provId = parseInt(sel.value, 10);
  const prov = proveedoresData.find(p => p.id === provId);
  if (!prov) {
    mostrarNotificacion('Elegí un proveedor (o agregá uno).', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  const valor = Math.max(0, parseFloat(document.getElementById('repoValor').value) || 0);
  if (valor <= 0) {
    mostrarNotificacion('Indicá cuánto valió la mercancía.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  const desc = (document.getElementById('repoDesc').value || '').trim();

  // 1) Cuenta por pagar: le debemos esa plata al proveedor.
  const cxpId = 'cxp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  movimientosCxp.push({
    id: cxpId,
    fecha: new Date().toISOString(),
    proveedorId: provId,
    tipo: 'factura',
    monto: valor,
    concepto: desc || 'Compra de mercancía',
    usuarioNombre: obtenerNombreUsuarioActivo()
  });
  if (movimientosCxp.length > MAX_MOV_CXP_GUARDADOS) {
    movimientosCxp.splice(0, movimientosCxp.length - MAX_MOV_CXP_GUARDADOS);
  }
  guardarCxp();

  // 2) Turno de reposición activo.
  reposicionActiva = {
    proveedorId: provId,
    proveedorNombre: prov.nombre,
    valor,
    descripcion: desc || 'Compra de mercancía',
    fecha: new Date().toISOString(),
    cxpId,
    unidades: 0
  };
  document.getElementById('repoValor').value = '';
  document.getElementById('repoDesc').value = '';
  renderRepoProveedor();
  mostrarNotificacion(
    `Reposición de ${prov.nombre} iniciada · ${formatMoney(valor)} a cuentas por pagar`,
    'success', 'bi-truck'
  );
}

function finalizarReposicion() {
  if (!reposicionActiva) return;
  const r = reposicionActiva;
  reposicionActiva = null;
  renderRepoProveedor();
  mostrarNotificacion(
    `Reposición de ${r.proveedorNombre}: ${r.unidades} und. ingresadas · ${formatMoney(r.valor)}`,
    'success', 'bi-check-circle-fill'
  );
}
