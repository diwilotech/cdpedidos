/* ============================================================================
   js/modules/proveedores-cxp.js — Proveedores y Cuentas por Pagar
   ----------------------------------------------------------------------------
   - proveedoresData : ficha del proveedor { id, nombre, telefono }
   - movimientosCxp  : { id, fecha, proveedorId, tipo:'factura'|'pago',
                         monto, concepto, usuarioNombre }
   Saldo del proveedor = Σ facturas − Σ pagos  (lo que el local DEBE pagar).
   ========================================================================== */

const modalProveedoresBS = new bootstrap.Modal(document.getElementById('modalProveedores'));

/* --- CÁLCULOS --- */
function saldoProveedor(proveedorId) {
  return movimientosCxp
    .filter(m => m.proveedorId === proveedorId)
    .reduce((acc, m) => acc + (m.tipo === 'factura' ? m.monto : -m.monto), 0);
}

function saldoTotalPorPagar() {
  return proveedoresData.reduce((acc, p) => acc + Math.max(0, saldoProveedor(p.id)), 0);
}

/* --- MODAL --- */
function abrirModalProveedores() {
  document.getElementById('nuevoProveedorNombre').value = '';
  document.getElementById('nuevoProveedorTelefono').value = '';
  renderListaProveedores();
  modalProveedoresBS.show();
}

function renderListaProveedores() {
  const cont = document.getElementById('listaProveedores');
  document.getElementById('cxpTotalPorPagar').innerText = formatMoney(saldoTotalPorPagar());

  cont.innerHTML = '';

  if (proveedoresData.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no hay proveedores. Agrega el primero arriba.</div>`;
    return;
  }

  const ordenados = [...proveedoresData].sort((a, b) => saldoProveedor(b.id) - saldoProveedor(a.id));

  ordenados.forEach(p => {
    const saldo = saldoProveedor(p.id);
    const debe = saldo > 0;
    const aFavor = saldo < 0;
    const saldoClase = debe ? 'text-danger' : aFavor ? 'text-success' : 'text-muted';
    const saldoTxt = debe ? formatMoney(saldo) + ' por pagar'
                    : aFavor ? formatMoney(-saldo) + ' a favor'
                    : 'Al día';

    const row = document.createElement('div');
    row.className = 'border rounded-3 p-2 mb-2';
    row.innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <div class="fw-bold"><i class="bi bi-truck me-1 text-primary"></i>${p.nombre}</div>
          <div class="small text-muted">${p.telefono ? '<i class="bi bi-telephone me-1"></i>' + p.telefono + ' · ' : ''}<span class="${saldoClase} fw-bold">${saldoTxt}</span></div>
        </div>
        <div class="d-flex gap-1 flex-wrap">
          <button class="btn btn-sm btn-outline-danger" onclick="registrarFacturaCxp(${p.id})" title="Registrar una factura / compra a crédito"><i class="bi bi-receipt"></i> Factura</button>
          <button class="btn btn-sm btn-outline-success" onclick="registrarPagoCxp(${p.id})" title="Registrar un pago al proveedor"><i class="bi bi-cash-coin"></i> Pago</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="verHistorialCxp(${p.id})" title="Ver historial"><i class="bi bi-clock-history"></i></button>
          <button class="btn btn-sm btn-outline-secondary" onclick="renombrarProveedor(${p.id})" title="Editar proveedor"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarProveedor(${p.id})" title="Eliminar proveedor"><i class="bi bi-trash3"></i></button>
        </div>
      </div>
      <div id="histCxp-${p.id}" class="mt-2 d-none"></div>
    `;
    cont.appendChild(row);
  });
}

function agregarProveedor() {
  const nombre = document.getElementById('nuevoProveedorNombre').value.trim();
  const telefono = document.getElementById('nuevoProveedorTelefono').value.trim();
  if (!nombre) {
    mostrarNotificacion('Ponle un nombre al proveedor.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  contadorProveedores++;
  proveedoresData.push({ id: contadorProveedores, nombre, telefono });
  guardarProveedores();
  document.getElementById('nuevoProveedorNombre').value = '';
  document.getElementById('nuevoProveedorTelefono').value = '';
  renderListaProveedores();
  mostrarNotificacion(`Proveedor "${nombre}" agregado`, 'success', 'bi-truck');
}

function renombrarProveedor(id) {
  const p = proveedoresData.find(x => x.id === id);
  if (!p) return;
  pedirTexto('Nombre del proveedor:', p.nombre, (nuevo) => {
    p.nombre = nuevo;
    guardarProveedores();
    renderListaProveedores();
  });
}

function eliminarProveedor(id) {
  const p = proveedoresData.find(x => x.id === id);
  if (!p) return;
  pedirConfirmacion(`¿Eliminar a "${p.nombre}"? Se borrará también su historial de cuentas por pagar.`, () => {
    proveedoresData = proveedoresData.filter(x => x.id !== id);
    movimientosCxp = movimientosCxp.filter(m => m.proveedorId !== id);
    guardarProveedores();
    guardarCxp();
    renderListaProveedores();
  });
}

/* --- MOVIMIENTOS --- */
function registrarMovimientoCxp(proveedorId, tipo, monto, concepto) {
  movimientosCxp.push({
    id: 'cxp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    fecha: new Date().toISOString(),
    proveedorId,
    tipo,
    monto: Math.abs(Number(monto) || 0),
    concepto: concepto || (tipo === 'factura' ? 'Factura' : 'Pago'),
    usuarioNombre: obtenerNombreUsuarioActivo()
  });
  if (movimientosCxp.length > MAX_MOV_CXP_GUARDADOS) {
    movimientosCxp.splice(0, movimientosCxp.length - MAX_MOV_CXP_GUARDADOS);
  }
  guardarCxp();
}

function registrarFacturaCxp(proveedorId) {
  pedirTexto('Monto de la factura / compra (COP):', '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    registrarMovimientoCxp(proveedorId, 'factura', monto, 'Factura de compra');
    renderListaProveedores();
    mostrarNotificacion('Factura registrada en cuentas por pagar', 'success', 'bi-receipt');
  });
}

function registrarPagoCxp(proveedorId) {
  const saldo = saldoProveedor(proveedorId);
  pedirTexto(`Pago al proveedor (se debe ${formatMoney(Math.max(0, saldo))}):`, '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    registrarMovimientoCxp(proveedorId, 'pago', monto, 'Pago a proveedor');
    renderListaProveedores();
    mostrarNotificacion('Pago registrado', 'success', 'bi-cash-coin');
  });
}

function verHistorialCxp(proveedorId) {
  const cont = document.getElementById('histCxp-' + proveedorId);
  if (!cont) return;
  if (!cont.classList.contains('d-none')) { cont.classList.add('d-none'); return; }

  const movs = movimientosCxp
    .filter(m => m.proveedorId === proveedorId)
    .slice()
    .reverse();

  cont.innerHTML = movs.length === 0
    ? `<div class="small text-muted fst-italic">Sin movimientos.</div>`
    : movs.map(m => `
        <div class="d-flex justify-content-between align-items-center small border-top py-1">
          <span>${m.tipo === 'factura' ? '<i class="bi bi-arrow-down-circle text-danger me-1"></i>' : '<i class="bi bi-arrow-up-circle text-success me-1"></i>'}${m.concepto} <span class="text-muted">· ${formatFecha(m.fecha)} · ${m.usuarioNombre}</span></span>
          <span class="fw-bold ${m.tipo === 'factura' ? 'text-danger' : 'text-success'}">${m.tipo === 'factura' ? '+' : '-'}${formatMoney(m.monto)}</span>
        </div>
      `).join('');
  cont.classList.remove('d-none');
}
