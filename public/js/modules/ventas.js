/* ============================================================================
   js/modules/ventas.js — "Mis ventas"
   ----------------------------------------------------------------------------
   `registrarVenta()` se llama al liquidar una cuenta. El modal muestra SOLO
   las ventas del usuario que tiene la sesión: su resumen y su lista, donde
   cada venta se puede desplegar para ver qué vendió y editarla (agregar
   productos, cambiar cantidades) — el stock se ajusta en consecuencia.
   El panorama completo (todos los usuarios) está en el Dashboard.
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
