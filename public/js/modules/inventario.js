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
   El personal escribe el TOTAL que debe quedar de cada producto y al final
   guarda TODO junto desde el footer:
     · "Guardar ajuste"       -> correcciones / merma.
     · "Guardar reposición…"  -> mercadería de un proveedor: pregunta proveedor,
       cuánto se pagó/pagará y si ya se pagó (sale de la caja) o es a crédito.
   El catálogo (crear productos, costo, precio) vive en el Dashboard. */
function abrirModalInventario(motivo) {
  cambiosStockPend = {};                       // arrancar sin ediciones colgadas
  renderCategoriasInventarioTabs();
  renderListaInventario();
  actualizarResumenInv();
  const banner = document.getElementById('invPagoBanner');
  if (banner) banner.classList.toggle('d-none', motivo !== 'pago');
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
    const nuevo = (prod.id in cambiosStockPend) ? cambiosStockPend[prod.id] : stock;
    const dif = nuevo - stock;
    const badgeClase = stock === 0 ? 'bg-danger' : stock <= 5 ? 'bg-warning text-dark' : 'bg-success';
    const esPersonalizado = prod.id.startsWith('custom-');

    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between align-items-center flex-wrap gap-2 border rounded-3 p-2 mb-2';
    row.dataset.prodrow = '';
    row.dataset.prodid = prod.id;
    row.dataset.stockactual = stock;
    // Se escribe el TOTAL que debe quedar (los − / + solo mueven ese número).
    // El cambio se acumula en cambiosStockPend y se guarda todo junto desde el
    // footer. "dif" muestra el cambio contra el stock actual.
    row.innerHTML = `
      <div>
        <div class="fw-bold">${prod.name} ${esPersonalizado ? '<span class="badge bg-info-subtle text-info border border-info-subtle" style="font-size:.65rem;">Nuevo</span>' : ''}</div>
        <div class="small text-muted font-monospace">${prod.code} · ${formatMoney(prod.price)}</div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <span class="badge ${badgeClase}" title="Stock actual">${stock} und.</span>
        <div class="input-group input-group-sm" style="width:132px;">
          <button class="btn btn-outline-secondary" type="button" onclick="ajustarCampoStock(this,-1)">−</button>
          <input type="number" min="0" class="form-control text-center stock-input" value="${nuevo}" oninput="registrarCambioStock(this)">
          <button class="btn btn-outline-secondary" type="button" onclick="ajustarCampoStock(this,1)">+</button>
        </div>
        <span class="stock-dif fw-bold ${dif > 0 ? 'text-success' : dif < 0 ? 'text-danger' : 'text-muted'}" style="min-width:34px;text-align:center;">${dif > 0 ? '+' : ''}${dif}</span>
      </div>
    `;
    cont.appendChild(row);
  });
}

// Los − / + solo cambian el número del campo (no guardan).
function ajustarCampoStock(btn, delta) {
  const input = btn.closest('[data-prodrow]').querySelector('.stock-input');
  input.value = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
  registrarCambioStock(input);
}

// Anota la edición pendiente del producto y refresca "dif" + el resumen del footer.
function registrarCambioStock(input) {
  const row = input.closest('[data-prodrow]');
  const pid = row.dataset.prodid;
  const actual = parseInt(row.dataset.stockactual, 10) || 0;
  const nuevo = Math.max(0, parseInt(input.value, 10) || 0);

  if (nuevo === actual) delete cambiosStockPend[pid];
  else cambiosStockPend[pid] = nuevo;

  const dif = nuevo - actual;
  const el = row.querySelector('.stock-dif');
  el.textContent = (dif > 0 ? '+' : '') + dif;
  el.className = 'stock-dif fw-bold ' + (dif > 0 ? 'text-success' : dif < 0 ? 'text-danger' : 'text-muted');
  actualizarResumenInv();
}

// Alias histórico (por si algún onclick viejo llama a esto).
function actualizarDifStock(input) { registrarCambioStock(input); }

// Lista de cambios pendientes -> [{ productId, actual, nuevo, dif }] (dif !== 0).
function recolectarCambiosInv() {
  return Object.keys(cambiosStockPend).map(pid => {
    const actual = obtenerStock(pid);
    const nuevo = Math.max(0, parseInt(cambiosStockPend[pid], 10) || 0);
    return { productId: pid, actual, nuevo, dif: nuevo - actual };
  }).filter(c => c.dif !== 0);
}

function actualizarResumenInv() {
  const el = document.getElementById('invCambiosResumen');
  if (!el) return;
  const c = recolectarCambiosInv();
  if (!c.length) { el.textContent = 'Sin cambios'; return; }
  const mas = c.filter(x => x.dif > 0).reduce((s, x) => s + x.dif, 0);
  const menos = c.filter(x => x.dif < 0).reduce((s, x) => s + x.dif, 0);
  const partes = [];
  if (mas) partes.push('+' + mas);
  if (menos) partes.push(String(menos));
  el.textContent = `${c.length} ${c.length === 1 ? 'producto' : 'productos'} · ${partes.join(' / ')} und.`;
}

// Aplica los cambios de stock y registra un movimiento por cada uno.
function aplicarCambiosInv(cambios, motivoIngreso) {
  cambios.forEach(c => {
    inventario[c.productId] = c.nuevo;
    registrarMovimientoInventario(c.productId, c.dif, c.dif > 0 ? motivoIngreso : 'Ajuste de pérdida');
  });
  guardarInventario();
}

function cerrarModalInventarioTrasGuardar() {
  cambiosStockPend = {};
  renderListaInventario();
  actualizarResumenInv();
  modalInventarioBS.hide();
  refrescarVistasInventarioSiEstanAbiertas();
  if (typeof refrescarVentasYCaja === 'function') refrescarVentasYCaja();
  if (typeof actualizarBadgeCaja === 'function') actualizarBadgeCaja();
}

/* --- FOOTER: "Guardar ajuste" (correcciones / merma, sin proveedor) --- */
function guardarInventarioAjuste() {
  const cambios = recolectarCambiosInv();
  if (!cambios.length) {
    mostrarNotificacion('No hay cambios que guardar.', 'warning', 'bi-info-circle');
    return;
  }
  aplicarCambiosInv(cambios, 'Reposición / ajuste');
  const mas = cambios.filter(x => x.dif > 0).reduce((s, x) => s + x.dif, 0);
  const menos = -cambios.filter(x => x.dif < 0).reduce((s, x) => s + x.dif, 0);
  mostrarNotificacion(
    `Stock actualizado · ${cambios.length} prod. (+${mas} / −${menos})`,
    'success', 'bi-check-circle-fill'
  );
  cerrarModalInventarioTrasGuardar();
}

/* --- FOOTER: "Guardar reposición…" (mercadería de un proveedor) ---
   Abre el modal #modalReposicion: listado de proveedores + alta de proveedor
   nuevo (NIT, celular) + monto + forma de pago (ya pagado / a crédito).
     · pagado   -> factura + pago en cuentas por pagar + SALIDA de la caja.
     · crédito  -> factura en cuentas por pagar + línea informativa en la caja. */
function guardarInventarioReposicion() {
  const cambios = recolectarCambiosInv();
  if (!cambios.length) {
    mostrarNotificacion('No hay cambios que guardar.', 'warning', 'bi-info-circle');
    return;
  }
  const unidades = cambios.filter(x => x.dif > 0).reduce((s, x) => s + x.dif, 0);
  if (unidades <= 0) {
    mostrarNotificacion('Una reposición necesita al menos un ingreso de stock. Usá "Guardar ajuste".', 'warning', 'bi-info-circle');
    return;
  }
  repoPendiente = { cambios, unidades };
  abrirModalReposicion();
}

function abrirModalReposicion() {
  if (!repoPendiente) return;

  document.getElementById('repoUndsTxt').textContent = repoPendiente.unidades + ' und.';

  const sel = document.getElementById('repoProvSelect');
  const opciones = proveedoresData
    .map(p => `<option value="${p.id}">${p.nombre}${p.nit ? ' · NIT ' + p.nit : ''}</option>`)
    .join('');
  sel.innerHTML = opciones + `<option value="__nuevo__">➕ Registrar proveedor nuevo…</option>`;
  // Si no hay proveedores, arrancar en "nuevo".
  sel.value = proveedoresData.length ? String(proveedoresData[0].id) : '__nuevo__';

  document.getElementById('repoValorInput').value = '';
  document.getElementById('repoNvNombre').value = '';
  document.getElementById('repoNvNit').value = '';
  document.getElementById('repoNvCel').value = '';
  const rp = document.getElementById('repoPagoEfectivo');
  if (rp) rp.checked = true;
  repoProvSelectChange();

  modalReposicionBS.show();
}

function repoProvSelectChange() {
  const esNuevo = document.getElementById('repoProvSelect').value === '__nuevo__';
  document.getElementById('repoProvNuevo').classList.toggle('d-none', !esNuevo);
}

function confirmarReposicionModal() {
  if (!repoPendiente) { modalReposicionBS.hide(); return; }

  const sel = document.getElementById('repoProvSelect');
  let prov;

  if (sel.value === '__nuevo__') {
    const nombre = (document.getElementById('repoNvNombre').value || '').trim();
    if (!nombre) {
      mostrarNotificacion('Ponle nombre al proveedor nuevo.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    contadorProveedores++;
    prov = {
      id: contadorProveedores,
      nombre,
      nit: (document.getElementById('repoNvNit').value || '').trim(),
      telefono: (document.getElementById('repoNvCel').value || '').trim()
    };
    proveedoresData.push(prov);
    guardarProveedores();
  } else {
    prov = proveedoresData.find(p => String(p.id) === sel.value);
    if (!prov) {
      mostrarNotificacion('Elegí un proveedor de la lista.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
  }

  const monto = parseFloat(String(document.getElementById('repoValorInput').value).replace(/[^\d.-]/g, ''));
  if (isNaN(monto) || monto <= 0) {
    mostrarNotificacion('Indicá cuánto se pagó o se pagará.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }

  const pagoSel = document.querySelector('input[name="repoPago"]:checked');
  const formaPago = pagoSel ? pagoSel.value : 'efectivo';   // 'efectivo' | 'otro' | 'credito'

  const { cambios, unidades } = repoPendiente;
  repoPendiente = null;
  modalReposicionBS.hide();
  finalizarReposicionInv(cambios, prov, monto, unidades, formaPago);
}

// formaPago: 'efectivo' -> sale de la caja · 'otro' -> pagado sin tocar la
// caja · 'credito' -> queda por pagar.
function finalizarReposicionInv(cambios, prov, monto, unidades, formaPago) {
  const pagado = formaPago !== 'credito';

  // 1) Stock (ingresos atribuidos al proveedor).
  aplicarCambiosInv(cambios, 'Reposición · ' + prov.nombre);

  // 2) Cuentas por pagar: factura de compra (+ pago si ya se pagó).
  const rid = Math.random().toString(36).slice(2, 6);
  const base = { fecha: new Date().toISOString(), proveedorId: prov.id, usuarioNombre: obtenerNombreUsuarioActivo() };
  movimientosCxp.push({ ...base, id: 'cxp-' + Date.now() + '-f' + rid, tipo: 'factura', monto: Math.abs(monto), concepto: `Reposición · ${unidades} und` });
  if (pagado) {
    movimientosCxp.push({ ...base, id: 'cxp-' + Date.now() + '-p' + rid, tipo: 'pago', monto: Math.abs(monto), concepto: formaPago === 'efectivo' ? 'Pago desde caja' : 'Pago (otro medio)' });
  }
  if (movimientosCxp.length > MAX_MOV_CXP_GUARDADOS) {
    movimientosCxp.splice(0, movimientosCxp.length - MAX_MOV_CXP_GUARDADOS);
  }
  guardarCxp();

  // 3) Caja (si hay turno abierto):
  //    efectivo -> SALIDA real (descuenta la caja).
  //    otro     -> compra pagada por fuera: solo informativa, NO descuenta.
  //    credito  -> compra a crédito: informativa "por pagar", NO descuenta.
  if (typeof cajaActual !== 'undefined' && cajaActual) {
    const tipo = formaPago === 'efectivo' ? 'salida'
      : formaPago === 'otro' ? 'compra_externa'
      : 'compra_credito';
    cajaActual.movimientos.push({
      id: 'cm-' + Date.now() + rid,
      fecha: new Date().toISOString(),
      tipo,
      categoria: 'pago_inventario',
      monto: Math.abs(monto),
      concepto: 'Reposición · ' + prov.nombre,
      proveedorId: prov.id,
      unidades,
      usuarioNombre: obtenerNombreUsuarioActivo()
    });
    guardarCaja();
  } else if (pagado) {
    mostrarNotificacion('Sin caja abierta: se registró como pagado en cuentas por pagar.', 'warning', 'bi-info-circle');
  }

  const nota = formaPago === 'efectivo' ? '(pagado · sale de caja)'
    : formaPago === 'otro' ? '(pagado · no sale de caja)'
    : '(a crédito)';
  mostrarNotificacion(
    `Reposición de ${prov.nombre}: +${unidades} und · ${formatMoney(monto)} ${nota}`,
    'success', 'bi-truck'
  );
  cerrarModalInventarioTrasGuardar();
}
