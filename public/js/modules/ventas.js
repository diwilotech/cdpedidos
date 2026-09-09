/* ============================================================================
   js/modules/ventas.js — "Mis ventas" + Caja del día (módulo unificado)
   ----------------------------------------------------------------------------
   `registrarVenta()` se llama al liquidar una cuenta. El modal muestra SOLO
   las ventas del usuario que tiene la sesión: su resumen y su lista, donde
   cada venta se puede desplegar para ver qué vendió y editarla (agregar
   productos, cambiar cantidades) — el stock se ajusta en consecuencia.
   El panorama completo (todos los usuarios) está en el Dashboard.

   La CAJA DEL DÍA vive en la 2ª mitad de este archivo (antes estaba en
   js/modules/caja.js). Se opera desde este mismo modal y sigue esta lógica:
     1. Valor inicial de caja
     2. Ventas cobradas del turno            (+ entran a la caja)
     3. Salida de dinero SIN justificación   (−)
     4. Salida de dinero por PAGO DE INVENTARIO (−, opc. a un proveedor)
     5. Cuentas por cobrar a clientes        (informativo, NO entra)
     6. Cuentas abiertas                     (informativo, NO entra)
   Esperado en caja = 1 + 2 − 3 − 4
   ========================================================================== */

const ventasExpandidas = new Set();

function esMismoDiaVenta(iso) {
  const d = new Date(iso), h = new Date();
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}

function registrarVenta(mesaId, cuenta) {
  if (!cuenta) return;
  const total = cuenta.productos.reduce((s, p) => s + (p.cant * p.precio), 0);
  if (total <= 0) return; // no tiene sentido registrar una cuenta vacía

  const el = document.querySelector(`[data-mesaid="${mesaId}"]`);
  const mesaNombre = el ? el.querySelector('.nombre-label').innerText : 'Mesa';

  const venta = {
    id: 'venta-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    fecha: new Date().toISOString(),
    mesaId, mesaNombre,
    cuentaNombre: cuenta.nombreCuenta,
    usuarioNombre: cuenta.usuarioNombre || obtenerNombreUsuarioActivo(),
    total,
    productos: cuenta.productos.map(p => {
      const prod = dbJSON.products.find(x => x.id === p.productId);
      return {
        productId: p.productId || null,
        categoryId: prod ? prod.categoryId : null,
        nombre: p.nombre, cant: p.cant, precio: p.precio
      };
    })
  };

  // Recién ACÁ se descuenta el inventario: un movimiento por producto con
  // su cantidad total (no uno por unidad al agregarlo a la comanda).
  venta.productos.forEach(p => {
    if (p.productId) ajustarStock(p.productId, -p.cant, 'Venta · ' + mesaNombre);
  });
  refrescarVistasInventarioSiEstanAbiertas();

  ventasData.push(venta);
  if (ventasData.length > MAX_VENTAS_GUARDADAS) {
    ventasData.splice(0, ventasData.length - MAX_VENTAS_GUARDADAS);
  }
  guardarVentas();
  return venta;
}

// Si esta venta está asociada a la cuenta por cobrar de un cliente, mantiene
// el cargo del cliente igual al total de la venta (cuando se edita la venta).
function sincronizarCargoFiado(v) {
  if (!v || !v.clienteId || typeof movimientosFiado === 'undefined') return;
  const cargo = movimientosFiado.find(m => m.ventaId === v.id && m.tipo === 'cargo');
  if (!cargo) return;
  cargo.monto = v.total;
  guardarFiados();
  const modalFi = document.getElementById('modalFiados');
  if (modalFi && modalFi.classList.contains('show') && typeof renderListaClientes === 'function') {
    renderListaClientes();
  }
}

function abrirModalVentas() {
  renderCajaEnVentas();
  renderResumenVentasPorUsuario();
  renderListaVentas();
  modalVentasBS.show();
}

// Solo MIS números: 3 tarjetas — vendido hoy (efectivo), cuentas por
// cobrar (ventas a crédito) y mesas/comandas mías todavía abiertas.
function renderResumenVentasPorUsuario() {
  const cont = document.getElementById('resumenVentasPorUsuario');
  const mio = obtenerNombreUsuarioActivo();
  const mias = ventasData.filter(v => (v.usuarioNombre || 'Sin asignar') === mio);

  // 1) Vendido hoy = ventas de hoy cobradas (sin cliente asociado)
  const hoyCobrado = mias.filter(v => esMismoDiaVenta(v.fecha) && !v.clienteId);
  const totalHoy = hoyCobrado.reduce((s, v) => s + v.total, 0);

  // 2) Cuentas por cobrar = mis ventas asociadas a un cliente
  const aCredito = mias.filter(v => v.clienteId);
  const totalCredito = aCredito.reduce((s, v) => s + v.total, 0);

  // 3) Abiertos = mis comandas sin liquidar y su total pendiente
  let comandasAbiertas = 0, pendiente = 0;
  Object.values(mesasData).forEach(cuentas => {
    (cuentas || []).forEach(c => {
      if ((c.usuarioNombre || 'Sin asignar') === mio && (c.productos || []).length) {
        comandasAbiertas++;
        pendiente += c.productos.reduce((s, p) => s + p.cant * p.precio, 0);
      }
    });
  });

  cont.innerHTML = `
    <div class="border rounded-3 p-2 px-3 bg-light">
      <div class="small text-muted"><i class="bi bi-cash-stack me-1"></i>Vendido hoy</div>
      <div class="fw-bold text-success fs-5">${formatMoney(totalHoy)}</div>
      <div class="small text-muted">${hoyCobrado.length} ${hoyCobrado.length === 1 ? 'venta' : 'ventas'}</div>
    </div>
    <div class="border rounded-3 p-2 px-3 bg-light">
      <div class="small text-muted"><i class="bi bi-hourglass-split me-1"></i>Cuentas por cobrar</div>
      <div class="fw-bold fs-6" style="color:#fd7e14">${formatMoney(totalCredito)}</div>
      <div class="small text-muted">${aCredito.length} ${aCredito.length === 1 ? 'venta a crédito' : 'ventas a crédito'}</div>
    </div>
    <div class="border rounded-3 p-2 px-3 bg-light">
      <div class="small text-muted"><i class="bi bi-receipt-cutoff me-1"></i>Abiertos</div>
      <div class="fw-bold fs-5 text-primary">${comandasAbiertas}</div>
      <div class="small text-muted">${formatMoney(pendiente)} sin liquidar</div>
    </div>`;

  // La caja del día vive en el mismo modal: mantené sus tarjetas al día.
  renderCajaEnVentas();
}

function renderListaVentas() {
  const cont = document.getElementById('listaVentas');
  const mio = obtenerNombreUsuarioActivo();
  const mias = [...ventasData].reverse()
    .filter(v => (v.usuarioNombre || 'Sin asignar') === mio)
    .slice(0, 100);

  if (mias.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no tenés ventas registradas.</div>`;
    return;
  }

  cont.innerHTML = mias.map(v => {
    const abierta = ventasExpandidas.has(v.id);
    const unidades = v.productos.reduce((s, p) => s + p.cant, 0);
    const chipCliente = v.clienteNombre
      ? `<span class="badge text-bg-warning ms-1" title="Esta venta está en la cuenta por cobrar del cliente: al editarla cambia lo que debe"><i class="bi bi-person-vcard me-1"></i>${v.clienteNombre} · por cobrar</span>`
      : '';
    return `
      <div class="border rounded-3 mb-2 ${v.clienteNombre ? 'border-warning' : ''}">
        <div class="d-flex justify-content-between align-items-center p-2" style="cursor:pointer" onclick="toggleVentaDetalle('${v.id}')">
          <div>
            <div class="fw-bold"><i class="bi ${abierta ? 'bi-chevron-down' : 'bi-chevron-right'} me-1"></i>${v.mesaNombre} · ${v.cuentaNombre}${chipCliente}</div>
            <div class="small text-muted">${formatFecha(v.fecha)} · ${unidades} und.</div>
          </div>
          <span class="fs-6 fw-bold text-success">${formatMoney(v.total)}</span>
        </div>
        ${abierta ? renderVentaDetalle(v) : ''}
      </div>`;
  }).join('');
}

function toggleVentaDetalle(ventaId) {
  if (ventasExpandidas.has(ventaId)) ventasExpandidas.delete(ventaId);
  else ventasExpandidas.add(ventaId);
  renderListaVentas();
}

function renderVentaDetalle(v) {
  const filas = v.productos.length === 0
    ? `<tr><td colspan="5" class="text-center text-muted small py-2">Venta sin productos.</td></tr>`
    : v.productos.map((p, i) => `
      <tr>
        <td class="fw-bold">${p.nombre}</td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary py-0 px-1" onclick="modificarLineaVenta('${v.id}',${i},-1)">-</button>
            <span class="btn btn-light disabled py-0 px-2 fw-bold text-dark">${p.cant}</span>
            <button class="btn btn-outline-secondary py-0 px-1" onclick="modificarLineaVenta('${v.id}',${i},1)">+</button>
          </div>
        </td>
        <td class="text-end">${formatMoney(p.precio)}</td>
        <td class="text-end fw-bold">${formatMoney(p.cant * p.precio)}</td>
        <td class="text-center"><button class="btn btn-sm btn-link text-danger p-0" onclick="eliminarLineaVenta('${v.id}',${i})" title="Quitar de la venta"><i class="bi bi-trash"></i></button></td>
      </tr>`).join('');

  const opciones = [...dbJSON.products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `<option value="${p.id}">${p.name} — ${formatMoney(p.price)}</option>`).join('');

  return `
    <div class="border-top p-2 bg-light">
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-2"><tbody>${filas}</tbody></table>
      </div>
      <div class="d-flex gap-1 align-items-center flex-wrap">
        <span class="small text-muted fw-bold">Agregar:</span>
        <select id="addProdSel-${v.id}" class="form-select form-select-sm" style="max-width:230px">${opciones}</select>
        <input id="addProdQty-${v.id}" type="number" min="1" value="1" class="form-control form-control-sm" style="width:64px">
        <button class="btn btn-sm btn-success fw-bold" onclick="agregarProductoAVenta('${v.id}')"><i class="bi bi-plus-lg me-1"></i>Agregar producto</button>
      </div>
    </div>`;
}

function agregarProductoAVenta(ventaId) {
  const v = ventasData.find(x => x.id === ventaId);
  if (!v) return;
  const productId = document.getElementById('addProdSel-' + ventaId).value;
  const qty = Math.max(1, parseInt(document.getElementById('addProdQty-' + ventaId).value, 10) || 1);
  const prod = dbJSON.products.find(p => p.id === productId);
  if (!prod) return;
  if (obtenerStock(productId) < qty) { notificarSinStock(prod.name); return; }

  const linea = v.productos.find(p => p.productId === productId);
  if (linea) linea.cant += qty;
  else v.productos.push({ productId, categoryId: prod.categoryId, nombre: prod.name, cant: qty, precio: prod.price });

  ajustarStock(productId, -qty, 'Venta (agregado a venta)');
  v.total = v.productos.reduce((s, p) => s + p.cant * p.precio, 0);
  guardarVentas();
  sincronizarCargoFiado(v);
  refrescarVistasInventarioSiEstanAbiertas();
  renderResumenVentasPorUsuario();
  renderListaVentas();
  mostrarNotificacion(`${prod.name} x${qty} agregado a la venta`, 'success', 'bi-check-circle-fill');
}

function modificarLineaVenta(ventaId, idx, delta) {
  const v = ventasData.find(x => x.id === ventaId);
  if (!v) return;
  const p = v.productos[idx];
  if (!p) return;
  if (delta > 0 && p.productId && obtenerStock(p.productId) <= 0) { notificarSinStock(p.nombre); return; }
  if (p.productId) ajustarStock(p.productId, -delta, delta > 0 ? 'Venta (editada)' : 'Devolución (venta editada)');
  p.cant += delta;
  if (p.cant <= 0) v.productos.splice(idx, 1);
  v.total = v.productos.reduce((s, x) => s + x.cant * x.precio, 0);
  guardarVentas();
  sincronizarCargoFiado(v);
  refrescarVistasInventarioSiEstanAbiertas();
  renderResumenVentasPorUsuario();
  renderListaVentas();
}

function eliminarLineaVenta(ventaId, idx) {
  const v = ventasData.find(x => x.id === ventaId);
  if (!v) return;
  const p = v.productos[idx];
  if (!p) return;
  if (p.productId) ajustarStock(p.productId, p.cant, 'Devolución (venta editada)');
  v.productos.splice(idx, 1);
  v.total = v.productos.reduce((s, x) => s + x.cant * x.precio, 0);
  guardarVentas();
  sincronizarCargoFiado(v);
  refrescarVistasInventarioSiEstanAbiertas();
  renderResumenVentasPorUsuario();
  renderListaVentas();
}


/* ============================================================================
   CAJA DEL DÍA  (antes js/modules/caja.js — ahora parte de este módulo)
   ----------------------------------------------------------------------------
   Un turno de caja a la vez (compartido), operado desde este mismo modal.
   Esperado en caja = valor inicial + ventas cobradas del turno
                      − salidas sin justificar − salidas por pago de inventario.
   ========================================================================== */

// Suma de movimientos de caja por tipo ('entrada' se mantiene solo por
// compatibilidad con turnos guardados por versiones anteriores).
function totalMovsCaja(tipo) {
  if (!cajaActual) return 0;
  return cajaActual.movimientos.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
}

// Salidas de dinero por categoría. Los movimientos viejos sin `categoria`
// cuentan como "sin justificar".
function totalSalidasCaja(categoria) {
  if (!cajaActual) return 0;
  return cajaActual.movimientos
    .filter(m => m.tipo === 'salida')
    .filter(m => {
      if (!categoria) return true;
      if (categoria === 'sin_justificar') return m.categoria === 'sin_justificar' || !m.categoria;
      return m.categoria === categoria;
    })
    .reduce((s, m) => s + m.monto, 0);
}

// Ventas del turno abierto (desde la apertura).
//   soloCredito=false -> cobradas (entran a la caja);  true -> a crédito.
function ventasDelTurno(soloCredito) {
  if (!cajaActual) return [];
  const desde = new Date(cajaActual.fecha).getTime();
  return ventasData
    .filter(v => new Date(v.fecha).getTime() >= desde)
    .filter(v => (soloCredito ? !!v.clienteId : !v.clienteId));
}
function totalVentasTurno(soloCredito) {
  return ventasDelTurno(soloCredito).reduce((s, v) => s + (v.total || 0), 0);
}
function ventasCobradasDelTurno() { return totalVentasTurno(false); } // compat

// Cuentas (comandas) abiertas en TODAS las mesas y su total pendiente.
function cuentasAbiertasResumen() {
  let n = 0, total = 0;
  Object.values(mesasData).forEach(cuentas => {
    (cuentas || []).forEach(c => {
      if ((c.productos || []).length) {
        n++;
        total += c.productos.reduce((s, p) => s + p.cant * p.precio, 0);
      }
    });
  });
  return { n, total };
}

function esperadoEnCaja() {
  if (!cajaActual) return 0;
  return cajaActual.montoInicial
    + totalVentasTurno(false)
    + totalMovsCaja('entrada')       // compat: turnos viejos
    - totalSalidasCaja();
}

// Punto verde en el botón "Ventas" del menú inferior mientras hay caja abierta.
function actualizarBadgeCaja() {
  const dot = document.getElementById('bbVentasDot');
  if (dot) dot.classList.toggle('d-none', !cajaActual);
}

function horaCorta(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function cardCaja(label, valor, sub, cls) {
  return `
    <div class="border rounded-3 p-2 px-3 bg-white ${cls || ''}" style="min-width:132px">
      <div class="small text-muted">${label}</div>
      <div class="fw-bold fs-6">${valor}</div>
      ${sub ? `<div class="small text-muted">${sub}</div>` : ''}
    </div>`;
}

/* --- RENDER dentro del modal "Mis Ventas" --- */
function renderCajaEnVentas() {
  const slot = document.getElementById('ventasCajaSlot');
  const cerrarSlot = document.getElementById('ventasCajaCerrarSlot');
  if (!slot) return;

  // Sin caja abierta: pedir el VALOR INICIAL (antes de vender).
  if (!cajaActual) {
    slot.innerHTML = `
      <div class="border rounded-3 p-3 bg-light">
        <div class="fw-bold mb-1"><i class="bi bi-cash-coin me-1"></i> Caja del día</div>
        <div class="small text-muted mb-2">Abrí la caja con el efectivo base antes de empezar a vender.</div>
        <div class="input-group input-group-sm" style="max-width:280px">
          <span class="input-group-text">$</span>
          <input type="number" id="cajaMontoInicial" class="form-control" min="0" step="1000" placeholder="Valor inicial" value="0">
          <button class="btn btn-success fw-bold" onclick="abrirCaja()"><i class="bi bi-unlock me-1"></i> Abrir caja</button>
        </div>
      </div>`;
    if (cerrarSlot) cerrarSlot.innerHTML = '';
    return;
  }

  const tCobradas   = totalVentasTurno(false);
  const nCobradas   = ventasDelTurno(false).length;
  const tSinJust    = totalSalidasCaja('sin_justificar');
  const tPagoInv    = totalSalidasCaja('pago_inventario');
  const ventasCred  = ventasDelTurno(true);
  const tCredTurno  = ventasCred.reduce((s, v) => s + (v.total || 0), 0);
  const tCredGlobal = (typeof saldoTotalPorCobrar === 'function') ? saldoTotalPorCobrar() : tCredTurno;
  const abiertas    = cuentasAbiertasResumen();
  const salidas     = cajaActual.movimientos.filter(m => m.tipo === 'salida');

  const etiquetaCat = (m) => (m.categoria === 'pago_inventario')
    ? '<span class="badge text-bg-light border">Pago inventario</span>'
    : '<span class="badge text-bg-light border">Sin justificar</span>';

  const listaSalidas = salidas.length
    ? salidas.slice().reverse().map(m => `
        <div class="d-flex justify-content-between align-items-center small border-bottom py-1">
          <span>${etiquetaCat(m)} ${m.concepto} <span class="text-muted">· ${horaCorta(m.fecha)} · ${m.usuarioNombre}</span></span>
          <span class="fw-bold text-danger">−${formatMoney(m.monto)}</span>
        </div>`).join('')
    : `<div class="small text-muted fst-italic px-1">Sin salidas registradas.</div>`;

  const listaCredito = ventasCred.length
    ? ventasCred.slice().reverse().map(v => `
        <div class="d-flex justify-content-between align-items-center small border-bottom py-1">
          <span><i class="bi bi-person-vcard me-1" style="color:#fd7e14"></i>${v.clienteNombre || 'Cliente'} <span class="text-muted">· ${v.mesaNombre} · ${horaCorta(v.fecha)}</span></span>
          <span class="fw-bold" style="color:#fd7e14">${formatMoney(v.total)}</span>
        </div>`).join('')
    : `<div class="small text-muted fst-italic px-1">Sin ventas a crédito en el turno.</div>`;

  slot.innerHTML = `
    <div class="border rounded-3 p-2 bg-light">
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-1">
        <span class="fw-bold"><i class="bi bi-cash-coin me-1"></i> Caja del día</span>
        <span class="small text-muted">Abrió ${cajaActual.usuarioNombre} · ${horaCorta(cajaActual.fecha)}</span>
      </div>

      <div class="d-flex flex-wrap gap-2">
        ${cardCaja('Valor inicial de caja', formatMoney(cajaActual.montoInicial))}
        ${cardCaja('Ventas cobradas', formatMoney(tCobradas), `${nCobradas} · entra a caja`)}
        ${cardCaja('Salida sin justificar', '−' + formatMoney(tSinJust), null, tSinJust ? 'border-danger' : '')}
        ${cardCaja('Salida pago inventario', '−' + formatMoney(tPagoInv), null, tPagoInv ? 'border-danger' : '')}
        ${cardCaja('Esperado en caja', formatMoney(esperadoEnCaja()), null, 'border-primary')}
      </div>

      <div class="d-flex gap-2 mt-2 flex-wrap">
        <button class="btn btn-sm btn-outline-danger" onclick="agregarSalidaCaja('sin_justificar')"><i class="bi bi-dash-circle me-1"></i>Salida sin justificar</button>
        <button class="btn btn-sm btn-outline-danger" onclick="agregarSalidaCaja('pago_inventario')"><i class="bi bi-truck me-1"></i>Pago de inventario</button>
      </div>

      <details class="mt-2">
        <summary class="small text-muted" style="cursor:pointer">Ver detalle del turno</summary>
        <div class="mt-2">
          <div class="small fw-bold text-danger mb-1"><i class="bi bi-arrow-up-circle me-1"></i>Salidas de dinero</div>
          ${listaSalidas}

          <div class="small fw-bold mt-3 mb-1" style="color:#fd7e14"><i class="bi bi-person-vcard me-1"></i>Cuentas por cobrar a clientes</div>
          <div class="d-flex justify-content-between small px-1"><span>De este turno</span><span class="fw-bold" style="color:#fd7e14">${formatMoney(tCredTurno)}</span></div>
          <div class="d-flex justify-content-between small px-1 text-muted"><span>Total por cobrar (todos los clientes)</span><span>${formatMoney(tCredGlobal)}</span></div>
          <div class="mt-1">${listaCredito}</div>

          <div class="small fw-bold mt-3 mb-1 text-primary"><i class="bi bi-receipt-cutoff me-1"></i>Cuentas abiertas</div>
          <div class="d-flex justify-content-between small px-1"><span>${abiertas.n} ${abiertas.n === 1 ? 'cuenta abierta' : 'cuentas abiertas'} en las mesas</span><span class="fw-bold">${formatMoney(abiertas.total)}</span></div>
          <div class="small text-muted px-1">Todavía no liquidadas — no entran a la caja.</div>
        </div>
      </details>
    </div>`;

  if (cerrarSlot) {
    cerrarSlot.innerHTML = `
      <button class="btn btn-outline-dark w-100 fw-bold" onclick="cerrarCaja()">
        <i class="bi bi-lock me-1"></i> Cerrar caja del día
      </button>`;
  }
}

// Refresca la caja y el resto del modal "Mis Ventas".
function refrescarVentasYCaja() {
  renderCajaEnVentas();
  renderResumenVentasPorUsuario();
  renderListaVentas();
}

function abrirCaja() {
  if (cajaActual) { renderCajaEnVentas(); return; }
  const campo = document.getElementById('cajaMontoInicial');
  const monto = Math.max(0, parseFloat(campo ? campo.value : 0) || 0);
  cajaActual = {
    id: 'caja-' + Date.now(),
    fecha: new Date().toISOString(),
    usuarioNombre: obtenerNombreUsuarioActivo(),
    montoInicial: monto,
    movimientos: []
  };
  guardarCaja();
  actualizarBadgeCaja();
  refrescarVentasYCaja();
  mostrarNotificacion(`Caja abierta con ${formatMoney(monto)}`, 'success', 'bi-unlock');
}

// Salida de efectivo de la caja. `categoria`:
//   'sin_justificar'  -> retiro sin respaldo.
//   'pago_inventario' -> pago de mercadería; si el texto coincide con el
//                        nombre de un proveedor, además baja su cuenta por pagar.
function agregarSalidaCaja(categoria) {
  if (!cajaActual) return;
  const esInv = categoria === 'pago_inventario';
  pedirTexto(
    esInv ? 'Monto pagado por inventario / mercadería (COP):' : 'Monto que SALE de la caja sin justificar (COP):',
    '',
    (valor) => {
      const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
      if (isNaN(monto) || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
        return;
      }
      const porDefecto = esInv
        ? ((typeof proveedoresData !== 'undefined' && proveedoresData[0] && proveedoresData[0].nombre) || 'Proveedor')
        : 'Sin justificación';
      setTimeout(() => {
        pedirTexto(esInv ? '¿A qué proveedor? (o descripción del pago):' : 'Nota (opcional):', porDefecto, (txt) => {
          const concepto = txt.trim() || (esInv ? 'Pago de inventario' : 'Sin justificación');
          let proveedorId = null;

          if (esInv && typeof proveedoresData !== 'undefined') {
            const prov = proveedoresData.find(p => (p.nombre || '').toLowerCase() === concepto.toLowerCase());
            if (prov) {
              proveedorId = prov.id;
              movimientosCxp.push({
                id: 'cxp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                fecha: new Date().toISOString(),
                proveedorId: prov.id,
                tipo: 'pago',
                monto: Math.abs(monto),
                concepto: 'Pago desde caja',
                usuarioNombre: obtenerNombreUsuarioActivo()
              });
              if (movimientosCxp.length > MAX_MOV_CXP_GUARDADOS) {
                movimientosCxp.splice(0, movimientosCxp.length - MAX_MOV_CXP_GUARDADOS);
              }
              guardarCxp();
            }
          }

          cajaActual.movimientos.push({
            id: 'cm-' + Date.now(),
            fecha: new Date().toISOString(),
            tipo: 'salida',
            categoria,
            monto: Math.abs(monto),
            concepto,
            proveedorId,
            usuarioNombre: obtenerNombreUsuarioActivo()
          });
          guardarCaja();
          refrescarVentasYCaja();
          mostrarNotificacion(
            esInv
              ? (proveedorId ? 'Pago de inventario registrado (baja la cuenta por pagar)' : 'Pago de inventario registrado')
              : 'Salida sin justificar registrada',
            'success', 'bi-check-circle-fill'
          );
        });
      }, 350);
    }
  );
}

function cerrarCaja() {
  if (!cajaActual) return;
  const esperado = esperadoEnCaja();
  pedirTexto(`Contá el efectivo real en la caja (esperado: ${formatMoney(esperado)}):`, String(esperado), (valor) => {
    const contado = Math.max(0, parseFloat(String(valor).replace(/[^\d.-]/g, '')) || 0);
    const diferencia = contado - esperado;
    const difTxt = diferencia === 0 ? 'Cuadra exacto'
      : diferencia > 0 ? `Sobran ${formatMoney(diferencia)}`
      : `Faltan ${formatMoney(-diferencia)}`;

    setTimeout(() => {
      pedirConfirmacion(
        `Cierre de caja:\n\nEsperado: ${formatMoney(esperado)}\nContado: ${formatMoney(contado)}\nDiferencia: ${difTxt}\n\n¿Cerrar la caja?`,
        () => {
          const turno = JSON.parse(JSON.stringify(cajaActual));
          turno.cierre = {
            fecha: new Date().toISOString(),
            usuarioNombre: obtenerNombreUsuarioActivo(),
            esperado, contado, diferencia,
            ventasCobradasTurno: totalVentasTurno(false),
            ventasPorCobrarTurno: totalVentasTurno(true),
            salidaSinJustificar: totalSalidasCaja('sin_justificar'),
            salidaPagoInventario: totalSalidasCaja('pago_inventario')
          };
          cajaHist.push(turno);
          if (cajaHist.length > MAX_CIERRES_CAJA_GUARDADOS) {
            cajaHist.splice(0, cajaHist.length - MAX_CIERRES_CAJA_GUARDADOS);
          }
          cajaActual = null;
          guardarCaja();
          guardarCajaHist();
          actualizarBadgeCaja();
          refrescarVentasYCaja();
          mostrarNotificacion('Caja cerrada · ' + difTxt, diferencia === 0 ? 'success' : 'warning', 'bi-lock');
        }
      );
    }, 350);
  });
}
