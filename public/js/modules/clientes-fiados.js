/* ============================================================================
   js/modules/clientes-fiados.js — Clientes y Fiados (Cuentas por Cobrar)
   ----------------------------------------------------------------------------
   - clientesData        : ficha del cliente { id, nombre, telefono }
   - movimientosFiado    : { id, fecha, clienteId, tipo:'cargo'|'abono',
                             monto, concepto, usuarioNombre }
   Saldo del cliente = Σ cargos − Σ abonos  (lo que el cliente DEBE al local).
   ========================================================================== */

const modalFiadosBS = new bootstrap.Modal(document.getElementById('modalFiados'));

// Cuando se entra desde "Cargar cuenta a fiado", se guarda aquí el monto y
// el concepto pendientes, y la lista de clientes muestra un botón grande
// "Cargar aquí" en cada ficha.
let fiadoModoSeleccion = null; // { monto, concepto } | null

/* --- CÁLCULOS --- */
function saldoCliente(clienteId) {
  return movimientosFiado
    .filter(m => m.clienteId === clienteId)
    .reduce((acc, m) => acc + (m.tipo === 'cargo' ? m.monto : -m.monto), 0);
}

function saldoTotalPorCobrar() {
  return clientesData.reduce((acc, c) => acc + Math.max(0, saldoCliente(c.id)), 0);
}

/* --- MODAL --- */
function abrirModalClientes() {
  fiadoModoSeleccion = null;
  document.getElementById('nuevoClienteNombre').value = '';
  document.getElementById('nuevoClienteTelefono').value = '';
  renderListaClientes();
  modalFiadosBS.show();
}

function renderListaClientes() {
  const cont = document.getElementById('listaClientes');
  const totalEl = document.getElementById('fiadosTotalPorCobrar');
  const banner = document.getElementById('fiadoSeleccionBanner');

  totalEl.innerText = formatMoney(saldoTotalPorCobrar());

  if (fiadoModoSeleccion) {
    banner.classList.remove('d-none');
    document.getElementById('fiadoSeleccionMonto').innerText = formatMoney(fiadoModoSeleccion.monto);
  } else {
    banner.classList.add('d-none');
  }

  cont.innerHTML = '';

  if (clientesData.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no hay clientes. Agrega el primero arriba.</div>`;
    return;
  }

  // Mayor deuda primero
  const ordenados = [...clientesData].sort((a, b) => saldoCliente(b.id) - saldoCliente(a.id));

  ordenados.forEach(c => {
    const saldo = saldoCliente(c.id);
    const debe = saldo > 0;
    const aFavor = saldo < 0;
    const saldoClase = debe ? 'text-danger' : aFavor ? 'text-success' : 'text-muted';
    const saldoTxt = debe ? formatMoney(saldo) + ' debe'
                    : aFavor ? formatMoney(-saldo) + ' a favor'
                    : 'Al día';

    const row = document.createElement('div');
    row.className = 'border rounded-3 p-2 mb-2';
    row.innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <div class="fw-bold"><i class="bi bi-person-vcard me-1 text-primary"></i>${c.nombre}</div>
          <div class="small text-muted">${c.telefono ? '<i class="bi bi-telephone me-1"></i>' + c.telefono + ' · ' : ''}<span class="${saldoClase} fw-bold">${saldoTxt}</span></div>
        </div>
        <div class="d-flex gap-1 flex-wrap">
          ${fiadoModoSeleccion
            ? `<button class="btn btn-sm btn-danger fw-bold" onclick="confirmarCargoDesdeSeleccion(${c.id})"><i class="bi bi-arrow-down-circle me-1"></i>Cargar aquí</button>`
            : `
              <button class="btn btn-sm btn-outline-danger" onclick="registrarCargoFiado(${c.id})" title="Registrar un fiado (cargo)"><i class="bi bi-cart-plus"></i> Fiar</button>
              <button class="btn btn-sm btn-outline-success" onclick="registrarAbonoFiado(${c.id})" title="Registrar un abono / pago"><i class="bi bi-cash-coin"></i> Abono</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="verHistorialFiado(${c.id})" title="Ver historial"><i class="bi bi-clock-history"></i></button>
              <button class="btn btn-sm btn-outline-secondary" onclick="renombrarCliente(${c.id})" title="Editar cliente"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="eliminarCliente(${c.id})" title="Eliminar cliente"><i class="bi bi-trash3"></i></button>
            `}
        </div>
      </div>
      <div id="histFiado-${c.id}" class="mt-2 d-none"></div>
    `;
    cont.appendChild(row);
  });
}

function agregarCliente() {
  const nombre = document.getElementById('nuevoClienteNombre').value.trim();
  const telefono = document.getElementById('nuevoClienteTelefono').value.trim();
  if (!nombre) {
    mostrarNotificacion('Ponle un nombre al cliente.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  contadorClientes++;
  clientesData.push({ id: contadorClientes, nombre, telefono });
  guardarClientes();
  document.getElementById('nuevoClienteNombre').value = '';
  document.getElementById('nuevoClienteTelefono').value = '';
  renderListaClientes();
  mostrarNotificacion(`Cliente "${nombre}" agregado`, 'success', 'bi-person-plus-fill');
}

function renombrarCliente(id) {
  const c = clientesData.find(x => x.id === id);
  if (!c) return;
  pedirTexto('Nombre del cliente:', c.nombre, (nuevo) => {
    c.nombre = nuevo;
    guardarClientes();
    renderListaClientes();
  });
}

function eliminarCliente(id) {
  const c = clientesData.find(x => x.id === id);
  if (!c) return;
  pedirConfirmacion(`¿Eliminar a "${c.nombre}"? Se borrará también su historial de fiados.`, () => {
    clientesData = clientesData.filter(x => x.id !== id);
    movimientosFiado = movimientosFiado.filter(m => m.clienteId !== id);
    guardarClientes();
    guardarFiados();
    renderListaClientes();
  });
}

/* --- MOVIMIENTOS --- */
function registrarMovimientoFiado(clienteId, tipo, monto, concepto) {
  movimientosFiado.push({
    id: 'fdo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    fecha: new Date().toISOString(),
    clienteId,
    tipo,
    monto: Math.abs(Number(monto) || 0),
    concepto: concepto || (tipo === 'cargo' ? 'Fiado' : 'Abono'),
    usuarioNombre: obtenerNombreUsuarioActivo()
  });
  if (movimientosFiado.length > MAX_MOV_FIADOS_GUARDADOS) {
    movimientosFiado.splice(0, movimientosFiado.length - MAX_MOV_FIADOS_GUARDADOS);
  }
  guardarFiados();
}

function registrarCargoFiado(clienteId) {
  pedirTexto('Monto a fiar (COP):', '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    registrarMovimientoFiado(clienteId, 'cargo', monto, 'Fiado manual');
    renderListaClientes();
    mostrarNotificacion('Fiado registrado', 'success', 'bi-cart-plus');
  });
}

function registrarAbonoFiado(clienteId) {
  const saldo = saldoCliente(clienteId);
  pedirTexto(`Abono del cliente (debe ${formatMoney(Math.max(0, saldo))}):`, '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    registrarMovimientoFiado(clienteId, 'abono', monto, 'Abono');
    renderListaClientes();
    mostrarNotificacion('Abono registrado', 'success', 'bi-cash-coin');
  });
}

function verHistorialFiado(clienteId) {
  const cont = document.getElementById('histFiado-' + clienteId);
  if (!cont) return;
  if (!cont.classList.contains('d-none')) { cont.classList.add('d-none'); return; }

  const movs = movimientosFiado
    .filter(m => m.clienteId === clienteId)
    .slice()
    .reverse();

  cont.innerHTML = movs.length === 0
    ? `<div class="small text-muted fst-italic">Sin movimientos.</div>`
    : movs.map(m => `
        <div class="d-flex justify-content-between align-items-center small border-top py-1">
          <span>${m.tipo === 'cargo' ? '<i class="bi bi-arrow-down-circle text-danger me-1"></i>' : '<i class="bi bi-arrow-up-circle text-success me-1"></i>'}${m.concepto} <span class="text-muted">· ${formatFecha(m.fecha)} · ${m.usuarioNombre}</span></span>
          <span class="fw-bold ${m.tipo === 'cargo' ? 'text-danger' : 'text-success'}">${m.tipo === 'cargo' ? '+' : '-'}${formatMoney(m.monto)}</span>
        </div>
      `).join('');
  cont.classList.remove('d-none');
}

/* --- PUENTE CON EL MODAL DE CUENTAS ---
   "Cargar cuenta a fiado": registra la venta (es ingreso, pero a crédito)
   y crea un cargo en el fiado del cliente elegido; luego cierra la cuenta. */
function cargarCuentaActualAFiado() {
  const cuentas = mesasData[mesaActivaId];
  const cuenta = cuentas ? cuentas[cuentaActivaIndex] : null;
  if (!cuenta) return;
  const total = cuenta.productos.reduce((s, p) => s + (p.cant * p.precio), 0);
  if (total <= 0) {
    mostrarNotificacion('La cuenta está vacía.', 'warning', 'bi-exclamation-triangle-fill');
    return;
  }
  if (clientesData.length === 0) {
    mostrarNotificacion('Primero registra un cliente en "Clientes / Fiados".', 'warning', 'bi-info-circle');
    abrirModalClientes();
    return;
  }

  const el = document.querySelector(`[data-mesaid="${mesaActivaId}"]`);
  const mesaNombre = el ? el.querySelector('.nombre-label').innerText : 'Mesa';

  fiadoModoSeleccion = {
    monto: total,
    concepto: `Consumo ${mesaNombre} · ${cuenta.nombreCuenta}`,
    mesaId: mesaActivaId,
    cuentaIndex: cuentaActivaIndex
  };
  renderListaClientes();
  modalFiadosBS.show();
}

function confirmarCargoDesdeSeleccion(clienteId) {
  if (!fiadoModoSeleccion) return;
  const { monto, concepto, mesaId, cuentaIndex } = fiadoModoSeleccion;

  const cuentas = mesasData[mesaId];
  const cuenta = cuentas ? cuentas[cuentaIndex] : null;
  if (!cuenta) { fiadoModoSeleccion = null; renderListaClientes(); return; }

  // 1) Es una venta (ingreso), solo que a crédito.
  registrarVenta(mesaId, cuenta);
  // 2) Queda como deuda del cliente.
  registrarMovimientoFiado(clienteId, 'cargo', monto, concepto);

  // 3) Se cierra la cuenta de la mesa.
  cuentas.splice(cuentaIndex, 1);
  if (cuentaActivaIndex >= cuentas.length) cuentaActivaIndex = Math.max(0, cuentas.length - 1);
  actualizarBadgeMesa(mesaId);
  actualizarSidebar();
  if (cuentas.length === 0) modalCuentasBS.hide();
  else { renderModalTabs(); renderSelectMesero(); renderModalContenidoCuenta(); }

  fiadoModoSeleccion = null;
  renderListaClientes();
  const cli = clientesData.find(c => c.id === clienteId);
  mostrarNotificacion(`${formatMoney(monto)} cargados al fiado de ${cli ? cli.nombre : 'cliente'}`, 'success', 'bi-journal-check');
}
