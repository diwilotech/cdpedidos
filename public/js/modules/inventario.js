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
   Pregunta proveedor -> cuánto se pagó/pagará -> ¿ya se pagó?
     · pagado   -> factura + pago en cuentas por pagar + SALIDA de la caja.
     · crédito  -> factura en cuentas por pagar + línea informativa en la caja. */
function resolverProveedor(nombre) {
  const n = (nombre || '').trim();
  let p = proveedoresData.find(x => (x.nombre || '').toLowerCase() === n.toLowerCase());
  if (!p) {
    contadorProveedores++;
    p = { id: contadorProveedores, nombre: n || 'Proveedor', telefono: '' };
    proveedoresData.push(p);
    guardarProveedores();
  }
  return p;
}

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

  const provDefault = (proveedoresData[0] && proveedoresData[0].nombre) || 'Proveedor';
  pedirTexto('Proveedor de la mercadería:', provDefault, (nombreProv) => {
    const prov = resolverProveedor(nombreProv);
    setTimeout(() => {
      pedirTexto('¿Cuánto se pagó o se pagará por esta mercadería? (COP):', '', (valorStr) => {
        const monto = parseFloat(String(valorStr).replace(/[^\d.-]/g, ''));
        if (isNaN(monto) || monto <= 0) {
          mostrarNotificacion('Ingresá un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
          return;
        }
        setTimeout(() => {
          pedirSiNo(
            `Reposición de ${prov.nombre}\n${unidades} und · ${formatMoney(monto)}\n\n¿Ya se pagó en efectivo (sale de la caja)?\nAceptar = pagado  ·  Cancelar = a crédito`,
            () => finalizarReposicionInv(cambios, prov, monto, unidades, true),
            () => finalizarReposicionInv(cambios, prov, monto, unidades, false)
          );
        }, 350);
      });
    }, 350);
  });
}

function finalizarReposicionInv(cambios, prov, monto, unidades, pagado) {
  // 1) Stock (ingresos atribuidos al proveedor).
  aplicarCambiosInv(cambios, 'Reposición · ' + prov.nombre);

  // 2) Cuentas por pagar: factura de compra (+ pago si ya se pagó).
  const rid = Math.random().toString(36).slice(2, 6);
  const base = { fecha: new Date().toISOString(), proveedorId: prov.id, usuarioNombre: obtenerNombreUsuarioActivo() };
  movimientosCxp.push({ ...base, id: 'cxp-' + Date.now() + '-f' + rid, tipo: 'factura', monto: Math.abs(monto), concepto: `Reposición · ${unidades} und` });
  if (pagado) {
    movimientosCxp.push({ ...base, id: 'cxp-' + Date.now() + '-p' + rid, tipo: 'pago', monto: Math.abs(monto), concepto: 'Pago desde caja' });
  }
  if (movimientosCxp.length > MAX_MOV_CXP_GUARDADOS) {
    movimientosCxp.splice(0, movimientosCxp.length - MAX_MOV_CXP_GUARDADOS);
  }
  guardarCxp();

  // 3) Caja: si se pagó -> SALIDA real; si es a crédito -> línea informativa
  //    (no descuenta la caja, se muestra en rojo en el flujo del turno).
  if (typeof cajaActual !== 'undefined' && cajaActual) {
    cajaActual.movimientos.push({
      id: 'cm-' + Date.now() + rid,
      fecha: new Date().toISOString(),
      tipo: pagado ? 'salida' : 'compra_credito',
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

  mostrarNotificacion(
    `Reposición de ${prov.nombre}: +${unidades} und · ${formatMoney(monto)} ${pagado ? '(pagado · sale de caja)' : '(a crédito)'}`,
    'success', 'bi-truck'
  );
  cerrarModalInventarioTrasGuardar();
}
