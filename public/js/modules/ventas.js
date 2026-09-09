/* ============================================================================
   js/modules/ventas.js — "Ventas del turno" + Caja del día (módulo unificado)
   ----------------------------------------------------------------------------
   `registrarVenta()` se llama al liquidar una cuenta. El modal muestra LAS
   VENTAS DE LA CAJA: desde que el turno se abrió hasta que se cierra (de
   cualquier persona, no solo del vendedor en sesión). Cada venta se puede
   desplegar para ver qué se vendió y editarla (agregar productos, cambiar
   cantidades) — el stock se ajusta en consecuencia. El panorama completo
   (histórico, todos los turnos) está en el Dashboard.

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

// Medio de pago de una venta liquidada.
function rotuloMedioPago(m) {
  return m === 'transferencia' ? 'Transferencia'
    : m === 'tarjeta' ? 'Tarjeta'
    : m === 'efectivo' ? 'Efectivo'
    : '';
}
// Una venta cobrada cuenta como EFECTIVO si su medio es 'efectivo' o si no
// tiene medio (ventas de versiones anteriores).
function ventaEsEfectivo(v) {
  return !v.medioPago || v.medioPago === 'efectivo';
}

function registrarVenta(mesaId, cuenta, medioPago) {
  if (!cuenta) return;
  const total = cuenta.productos.reduce((s, p) => s + (p.cant * p.precio), 0);
  if (total <= 0) return; // no tiene sentido registrar una cuenta vacía

  const el = document.querySelector(`[data-mesaid="${mesaId}"]`);
  const mesaNombre = el ? el.querySelector('.nombre-label').innerText : 'Mesa';

  const venta = {
    id: 'venta-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    fecha: new Date().toISOString(),
    mesaId, mesaNombre,
    cuentaId: cuenta.idCuenta || null,     // trazabilidad hacia la cuenta de origen
    cuentaNombre: cuenta.nombreCuenta,
    usuarioNombre: cuenta.usuarioNombre || obtenerNombreUsuarioActivo(),
    medioPago: medioPago || null,          // 'efectivo' | 'transferencia' | 'tarjeta'
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
  const cargo = movimientosFiado.find(m => m.venta_id === v.id && m.tipo === 'cargo');
  if (!cargo || cargo.monto === v.total) return;
  cargo.monto = v.total;
  if (window.db) db.editar('mov_fiado', cargo.id, { monto: v.total }).catch(e => console.error('sincronizar fiado:', e));
  const modalFi = document.getElementById('modalFiados');
  if (modalFi && modalFi.classList.contains('show') && typeof renderListaClientes === 'function') {
    renderListaClientes();
  }
  if (typeof refrescarCuentaClienteSiAbierta === 'function') refrescarCuentaClienteSiAbierta();
}

function abrirModalVentas() {
  renderCajaEnVentas();
  renderListaVentas();
  modalVentasBS.show();
}

// Alcance de "Mis Ventas": ahora NO es "las ventas del vendedor", sino
// LAS VENTAS DE LA CAJA — desde que el turno se abrió hasta que se cierra.
//   · caja abierta      -> ventas con fecha >= apertura (de cualquier persona).
//   · sin caja abierta  -> el último turno cerrado (apertura..cierre).
//   · nunca hubo caja   -> respaldo: ventas de hoy.
function alcanceVentasActual() {
  if (cajaActual) {
    const desde = new Date(cajaActual.fecha).getTime();
    return {
      ventas: ventasData.filter(v => new Date(v.fecha).getTime() >= desde),
      titulo: `Turno abierto · desde las ${horaCorta(cajaActual.fecha)}`,
      abierto: true
    };
  }
  if (Array.isArray(cajaHist) && cajaHist.length) {
    const t = cajaHist[cajaHist.length - 1];
    const ini = new Date(t.fecha).getTime();
    const fin = t.cierre ? new Date(t.cierre.fecha).getTime() : Date.now();
    return {
      ventas: ventasData.filter(v => {
        const ts = new Date(v.fecha).getTime();
        return ts >= ini && ts <= fin;
      }),
      titulo: `Último turno cerrado · ${formatFecha(t.fecha)}`,
      abierto: false
    };
  }
  return {
    ventas: ventasData.filter(v => esMismoDiaVenta(v.fecha)),
    titulo: 'Caja sin abrir · ventas de hoy',
    abierto: false
  };
}

function renderListaVentas() {
  const cont = document.getElementById('listaVentas');
  const { ventas } = alcanceVentasActual();
  const lista = [...ventas].reverse().slice(0, 200);

  if (lista.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">${
      cajaActual
        ? 'Todavía no hay ventas en este turno de caja.'
        : 'No hay ventas para mostrar. Abrí la caja para registrar el turno.'
    }</div>`;
    return;
  }

  cont.innerHTML = lista.map(v => {
    const abierta = ventasExpandidas.has(v.id);
    const unidades = v.productos.reduce((s, p) => s + p.cant, 0);
    const chipCliente = v.clienteNombre
      ? `<span class="badge text-bg-warning ms-1" title="Esta venta está en la cuenta por cobrar del cliente: al editarla cambia lo que debe"><i class="bi bi-person-vcard me-1"></i>${v.clienteNombre} · por cobrar</span>`
      : '';
    const chipMedio = (!v.clienteNombre && v.medioPago)
      ? `<span class="badge ms-1 ${v.medioPago === 'efectivo' ? 'text-bg-success' : v.medioPago === 'transferencia' ? 'text-bg-primary' : 'text-bg-dark'}">${rotuloMedioPago(v.medioPago)}</span>`
      : '';
    return `
      <div class="border rounded-3 mb-2 ${v.clienteNombre ? 'border-warning' : ''}">
        <div class="d-flex justify-content-between align-items-center p-2" style="cursor:pointer" onclick="toggleVentaDetalle('${v.id}')">
          <div>
            <div class="fw-bold"><i class="bi ${abierta ? 'bi-chevron-down' : 'bi-chevron-right'} me-1"></i>${v.mesaNombre} · ${v.cuentaNombre}${chipCliente}${chipMedio}</div>
            <div class="small text-muted">${formatFecha(v.fecha)} · ${unidades} und. · <i class="bi bi-person-fill"></i> ${v.usuarioNombre || 'Sin asignar'}</div>
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

  return `
    <div class="border-top p-2 bg-light">
      <div class="d-flex justify-content-between align-items-center bg-white border rounded p-2 mb-2">
        <span class="small text-muted fw-bold">Editá los productos de esta venta</span>
        <button class="btn btn-sm btn-primary fw-bold" onclick="abrirCatalogoDesdeVenta('${v.id}')">
          <i class="bi bi-grid-3x3-gap-fill me-1"></i> Catálogo de Productos
        </button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0"><tbody>${filas}</tbody></table>
      </div>
    </div>`;
}

// Abre el mismo "Catálogo de Productos" que las cuentas, pero apuntando a
// esta venta (agregar producto = descuenta stock y actualiza el total).
function abrirCatalogoDesdeVenta(ventaId) {
  abrirCatalogoProductos({ tipo: 'venta', ventaId });
}
// (Agregar productos a una venta se hace ahora con el "Catálogo de Productos"
//  -> ver abrirCatalogoDesdeVenta() y agregarProductoDesdeCatalogo().)

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
  renderCajaEnVentas();
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
  renderCajaEnVentas();
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

// Ventas cobradas del turno separadas por medio de pago. Solo el EFECTIVO
// entra físicamente a la caja; transferencia y tarjeta no.
function totalEfectivoTurno() {
  return ventasDelTurno(false).filter(ventaEsEfectivo).reduce((s, v) => s + (v.total || 0), 0);
}
function totalOtroMedioTurno() {
  return ventasDelTurno(false).filter(v => !ventaEsEfectivo(v)).reduce((s, v) => s + (v.total || 0), 0);
}

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

// Compras de inventario A CRÉDITO del turno (reposición sin pagar): NO
// descuentan la caja; se muestran en rojo como "por pagar".
function comprasCreditoTurno() {
  if (!cajaActual) return { total: 0, items: [] };
  const items = cajaActual.movimientos.filter(m => m.tipo === 'compra_credito');
  return { total: items.reduce((s, m) => s + m.monto, 0), items };
}

// Compras del turno que NO tocan la caja: a crédito ('compra_credito') o
// pagadas por otro medio ('compra_externa').
function comprasNoCajaTurno() {
  if (!cajaActual) return [];
  return cajaActual.movimientos.filter(m => m.tipo === 'compra_credito' || m.tipo === 'compra_externa');
}

function esperadoEnCaja() {
  if (!cajaActual) return 0;
  return cajaActual.montoInicial
    + totalEfectivoTurno()           // solo lo cobrado EN EFECTIVO va al cajón
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

// Una tarjeta KPI (col-4 por defecto). `color`: kpi-verde | kpi-naranja |
// kpi-azul | kpi-gris | kpi-rojo.
function kpiCard(color, label, valor, sub, colCls) {
  return `
    <div class="${colCls || 'col-4'}">
      <div class="kpi-card ${color}">
        <div class="kpi-label">${label}</div>
        <div class="kpi-valor">${valor}</div>
        ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
      </div>
    </div>`;
}

/* --- RENDER unificado: KPIs con color + controles de caja, sin repetir
   ningún número. Todo va en #ventasCajaSlot; el botón de cierre en
   #ventasCajaCerrarSlot. --- */
function renderCajaEnVentas() {
  const slot = document.getElementById('ventasCajaSlot');
  const cerrarSlot = document.getElementById('ventasCajaCerrarSlot');
  if (!slot) return;

  const { ventas, titulo } = alcanceVentasActual();
  const abiertas = cuentasAbiertasResumen();

  /* ---------- SIN caja abierta ---------- */
  if (!cajaActual) {
    const cobr = ventas.filter(v => !v.clienteId).reduce((s, v) => s + (v.total || 0), 0);
    const cred = ventas.filter(v => v.clienteId).reduce((s, v) => s + (v.total || 0), 0);
    slot.innerHTML = `
      <div class="row g-2">
        <div class="col-12 small fw-bold text-muted"><i class="bi bi-cash-coin me-1"></i>${titulo}</div>
        ${kpiCard('kpi-verde',   'Vendido',    formatMoney(cobr), 'cobrado')}
        ${kpiCard('kpi-naranja', 'Por cobrar', formatMoney(cred), 'a crédito')}
        ${kpiCard('kpi-azul',    'Abiertas',   String(abiertas.n), `${formatMoney(abiertas.total)} pend.`)}
      </div>
      <div class="border rounded-3 p-3 bg-light mt-2">
        <div class="fw-bold mb-1"><i class="bi bi-unlock me-1"></i> Abrir la caja del día</div>
        <div class="small text-muted mb-2">Poné el efectivo base antes de empezar a vender.</div>
        <div class="input-group input-group-sm" style="max-width:280px">
          <span class="input-group-text">$</span>
          <input type="number" id="cajaMontoInicial" class="form-control" min="0" step="1000" placeholder="Valor inicial" value="0">
          <button class="btn btn-success fw-bold" onclick="abrirCaja()">Abrir caja</button>
        </div>
      </div>`;
    if (cerrarSlot) cerrarSlot.innerHTML = '';
    return;
  }

  /* ---------- CAJA abierta ---------- */
  const inicial     = cajaActual.montoInicial;
  const tCobradas   = totalVentasTurno(false);
  const efvo        = totalEfectivoTurno();
  const otros       = totalOtroMedioTurno();
  const nCobradas   = ventasDelTurno(false).length;
  const tSinJust    = totalSalidasCaja('sin_justificar');
  const tPagoInv    = totalSalidasCaja('pago_inventario');
  const tSalidas    = tSinJust + tPagoInv;
  const esperado    = esperadoEnCaja();
  const ventasCred  = ventasDelTurno(true);
  const tCred       = ventasCred.reduce((s, v) => s + (v.total || 0), 0);
  const tCredGlobal = (typeof saldoTotalPorCobrar === 'function') ? saldoTotalPorCobrar() : tCred;
  const salidas     = cajaActual.movimientos.filter(m => m.tipo === 'salida');
  const compras     = comprasCreditoTurno();
  const comprasNoCaja = comprasNoCajaTurno();

  const etiquetaCat = (m) => (m.categoria === 'pago_inventario')
    ? '<span class="badge text-bg-light border">Pago proveedor</span>'
    : '<span class="badge text-bg-light border">Sin justificar</span>';

  const und = (m) => m.unidades ? ` · ${m.unidades} und` : '';

  const listaSalidas = salidas.length
    ? salidas.slice().reverse().map(m => `
        <div class="d-flex justify-content-between align-items-center small border-bottom py-1">
          <span>${etiquetaCat(m)} ${m.concepto}${und(m)} <span class="text-muted">· ${formatFecha(m.fecha)} · ${m.usuarioNombre}</span></span>
          <span class="fw-bold text-danger">−${formatMoney(m.monto)}</span>
        </div>`).join('')
    : `<div class="small text-muted fst-italic px-1">Sin salidas registradas.</div>`;

  const listaCompras = comprasNoCaja.length
    ? comprasNoCaja.slice().reverse().map(m => {
        const badge = m.tipo === 'compra_externa'
          ? '<span class="badge text-bg-light border">Pagado · otro medio</span>'
          : '<span class="badge text-bg-light border">A crédito</span>';
        return `
        <div class="d-flex justify-content-between align-items-center small border-bottom py-1">
          <span>${badge} ${m.concepto}${und(m)} <span class="text-muted">· ${formatFecha(m.fecha)} · ${m.usuarioNombre}</span></span>
          <span class="fw-bold text-danger">−${formatMoney(m.monto)}</span>
        </div>`;
      }).join('')
    : `<div class="small text-muted fst-italic px-1">Sin compras fuera de caja en el turno.</div>`;

  const listaCredito = ventasCred.length
    ? ventasCred.slice().reverse().map(v => `
        <div class="d-flex justify-content-between align-items-center small border-bottom py-1">
          <span><i class="bi bi-person-vcard me-1" style="color:#fd7e14"></i>${v.clienteNombre || 'Cliente'} <span class="text-muted">· ${v.mesaNombre} · ${horaCorta(v.fecha)}</span></span>
          <span class="fw-bold" style="color:#fd7e14">${formatMoney(v.total)}</span>
        </div>`).join('')
    : `<div class="small text-muted fst-italic px-1">Sin ventas a crédito en el turno.</div>`;

  slot.innerHTML = `
    <div class="row g-2">
      <div class="col-12 d-flex justify-content-between align-items-center flex-wrap gap-1">
        <span class="small fw-bold text-muted"><i class="bi bi-cash-coin me-1"></i>${titulo}</span>
        <span class="small text-muted">Abrió ${cajaActual.usuarioNombre} · ${horaCorta(cajaActual.fecha)}</span>
      </div>

      ${kpiCard('kpi-gris',  'Inicial', formatMoney(inicial))}
      ${kpiCard('kpi-verde', 'Vendido', formatMoney(tCobradas), `${nCobradas} vtas · efvo ${formatMoney(efvo)}`)}
      ${kpiCard('kpi-rojo',  'Salidas', '−' + formatMoney(tSalidas), `sin just. ${formatMoney(tSinJust)} · prov. ${formatMoney(tPagoInv)}`)}

      <div class="col-12">
        <div class="kpi-card kpi-azul kpi-xl">
          <div class="kpi-label">Esperado en caja</div>
          <div class="kpi-valor">${formatMoney(esperado)}</div>
        </div>
      </div>

      ${kpiCard('kpi-azul',    'Otros medios', formatMoney(otros), 'transf/tarjeta · no entra', 'col-6')}
      ${kpiCard('kpi-naranja', 'Por cobrar', formatMoney(tCred), 'clientes · no entra', 'col-6')}
      ${kpiCard('kpi-rojo',    'Por pagar',  formatMoney(compras.total), 'a crédito · no entra', 'col-6')}
      ${kpiCard('kpi-azul',    'Abiertas',   String(abiertas.n), `${formatMoney(abiertas.total)} · no entra`, 'col-6')}
    </div>

    <div class="d-flex gap-2 mt-2 flex-wrap">
      <button class="btn btn-sm btn-outline-danger" onclick="agregarSalidaSinJustificar()"><i class="bi bi-dash-circle me-1"></i>Salida sin justificar</button>
      <button class="btn btn-sm btn-outline-danger" onclick="abrirModalInventario('pago')"><i class="bi bi-truck me-1"></i>Pago de inventario</button>
    </div>

    <details class="mt-2">
      <summary class="small text-muted" style="cursor:pointer">Ver movimientos del turno</summary>
      <div class="mt-2">
        <div class="small fw-bold text-success mb-1"><i class="bi bi-cash-coin me-1"></i>Ventas cobradas del turno por medio</div>
        <div class="d-flex justify-content-between small px-1"><span><i class="bi bi-cash me-1"></i>Efectivo (entra a la caja)</span><span class="fw-bold text-success">${formatMoney(efvo)}</span></div>
        <div class="d-flex justify-content-between small px-1"><span><i class="bi bi-arrow-left-right me-1"></i>Transferencia</span><span>${formatMoney(ventasDelTurno(false).filter(v => v.medioPago === 'transferencia').reduce((s, v) => s + (v.total || 0), 0))}</span></div>
        <div class="d-flex justify-content-between small px-1"><span><i class="bi bi-credit-card me-1"></i>Tarjeta</span><span>${formatMoney(ventasDelTurno(false).filter(v => v.medioPago === 'tarjeta').reduce((s, v) => s + (v.total || 0), 0))}</span></div>

        <div class="small fw-bold text-danger mt-3 mb-1"><i class="bi bi-arrow-up-circle me-1"></i>Salidas de dinero (sale de la caja)</div>
        ${listaSalidas}

        <div class="small fw-bold mt-3 mb-1 text-danger"><i class="bi bi-truck me-1"></i>Compras del turno que NO salen de la caja</div>
        ${listaCompras}

        <div class="small fw-bold mt-3 mb-1" style="color:#fd7e14"><i class="bi bi-person-vcard me-1"></i>Ventas a crédito del turno</div>
        ${listaCredito}
        <div class="d-flex justify-content-between small px-1 text-muted mt-1">
          <span>Total por cobrar histórico (todos los clientes)</span><span>${formatMoney(tCredGlobal)}</span>
        </div>
      </div>
    </details>`;

  if (cerrarSlot) {
    cerrarSlot.innerHTML = `
      <button class="btn btn-outline-dark w-100 fw-bold" onclick="cerrarCaja()">
        <i class="bi bi-lock me-1"></i> Cerrar caja del día
      </button>`;
  }
}

// Refresca la caja/KPIs y la lista del modal "Ventas del turno".
function refrescarVentasYCaja() {
  renderCajaEnVentas();
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

// Salida de efectivo SIN justificación (retiro sin respaldo). El pago de
// inventario NO pasa por acá: se hace desde el modal de Inventario
// ("Guardar reposición…"), que además ajusta el stock y el proveedor.
function agregarSalidaSinJustificar() {
  if (!cajaActual) return;
  pedirTexto('Monto que SALE de la caja sin justificar (COP):', '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    setTimeout(() => {
      pedirTexto('Nota (opcional):', 'Sin justificación', (txt) => {
        cajaActual.movimientos.push({
          id: 'cm-' + Date.now(),
          fecha: new Date().toISOString(),
          tipo: 'salida',
          categoria: 'sin_justificar',
          monto: Math.abs(monto),
          concepto: txt.trim() || 'Sin justificación',
          usuarioNombre: obtenerNombreUsuarioActivo()
        });
        guardarCaja();
        refrescarVentasYCaja();
        mostrarNotificacion('Salida sin justificar registrada', 'success', 'bi-check-circle-fill');
      });
    }, 350);
  });
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
            cobradoEfectivo: totalEfectivoTurno(),
            cobradoOtroMedio: totalOtroMedioTurno(),
            ventasPorCobrarTurno: totalVentasTurno(true),
            salidaSinJustificar: totalSalidasCaja('sin_justificar'),
            salidaPagoInventario: totalSalidasCaja('pago_inventario'),
            comprasCreditoTurno: comprasCreditoTurno().total
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
