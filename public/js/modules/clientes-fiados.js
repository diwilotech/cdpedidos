/* ============================================================================
   js/modules/clientes-fiados.js — Clientes y cuentas por cobrar
   ----------------------------------------------------------------------------
   - clientesData     : ficha del cliente { id, nombre, telefono }
   - movimientosFiado : { id, fecha, clienteId, tipo:'cargo'|'abono',
                          monto, concepto, usuarioNombre }
   Saldo del cliente = Σ cargos − Σ abonos  (lo que el cliente DEBE al local).
   ("cargo" = consumo que se le anota; "abono" = pago que hace).
   ========================================================================== */

const modalFiadosBS = new bootstrap.Modal(document.getElementById('modalFiados'));
const modalCuentaClienteBS = new bootstrap.Modal(document.getElementById('modalCuentaCliente'));

// Cliente cuya cuenta/extracto está abierta en #modalCuentaCliente (o null).
let cuentaClienteAbiertaId = null;

// Al entrar desde "Guardar para pago después" se deja aquí el monto y el
// concepto pendientes; cada ficha de cliente muestra un botón "Guardar aquí".
let fiadoModoSeleccion = null;

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

  const ordenados = [...clientesData].sort((a, b) => saldoCliente(b.id) - saldoCliente(a.id));

  ordenados.forEach(c => {
    const saldo = saldoCliente(c.id);
    const debe = saldo > 0;
    const aFavor = saldo < 0;
    const saldoClase = debe ? 'text-danger' : aFavor ? 'text-success' : 'text-muted';
    const saldoTxt = debe ? formatMoney(saldo) + ' por cobrar'
                    : aFavor ? formatMoney(-saldo) + ' a favor'
                    : 'Al día';

    const row = document.createElement('div');
    row.className = 'border rounded-3 p-2 mb-2';
    row.innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <div class="fw-bold"><i class="bi bi-person-vcard me-1 text-primary"></i>${c.nombre}</div>
          ${(c.telefono || c.descripcion) ? `<div class="small text-muted">${[
            c.telefono ? '<i class="bi bi-telephone me-1"></i>' + c.telefono : '',
            c.descripcion ? '<i class="bi bi-sticky me-1"></i>' + c.descripcion : ''
          ].filter(Boolean).join(' · ')}</div>` : ''}
          <div class="small"><span class="${saldoClase} fw-bold">${saldoTxt}</span></div>
        </div>
        <div class="d-flex gap-1 flex-wrap">
          ${fiadoModoSeleccion
            ? `<button class="btn btn-sm btn-danger fw-bold" onclick="confirmarCargoDesdeSeleccion(${c.id})"><i class="bi bi-arrow-down-circle me-1"></i>Guardar aquí</button>`
            : `
              <button class="btn btn-sm btn-outline-primary fw-bold" onclick="verCuentaCliente(${c.id})" title="Ver la cuenta / extracto del cliente"><i class="bi bi-journal-text me-1"></i> Ver cuenta</button>
              <button class="btn btn-sm btn-outline-danger" onclick="registrarCargoFiado(${c.id})" title="Anotar un consumo a la cuenta del cliente"><i class="bi bi-cart-plus"></i> Cargar</button>
              <button class="btn btn-sm btn-outline-success" onclick="registrarAbonoFiado(${c.id})" title="Registrar un pago / abono del cliente"><i class="bi bi-cash-coin"></i> Abono</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="editarClienteModal(${c.id})" title="Editar nombre, teléfono y descripción"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="eliminarCliente(${c.id})" title="Eliminar cliente"><i class="bi bi-trash3"></i></button>
            `}
        </div>
      </div>
    `;
    cont.appendChild(row);
  });
}

function agregarCliente() {
  const nombre = document.getElementById('nuevoClienteNombre').value.trim();
  const telefono = document.getElementById('nuevoClienteTelefono').value.trim();
  const descripcion = document.getElementById('nuevoClienteDescripcion').value.trim();
  if (!nombre) {
    mostrarNotificacion('Ponle un nombre al cliente.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  contadorClientes++;
  clientesData.push({ id: contadorClientes, nombre, telefono, descripcion });
  guardarClientes();
  document.getElementById('nuevoClienteNombre').value = '';
  document.getElementById('nuevoClienteTelefono').value = '';
  document.getElementById('nuevoClienteDescripcion').value = '';
  renderListaClientes();
  mostrarNotificacion(`Cliente "${nombre}" agregado`, 'success', 'bi-person-plus-fill');
}

// Editar toda la ficha del cliente (nombre, teléfono, descripción).
function editarClienteModal(id) {
  const c = clientesData.find(x => x.id === id);
  if (!c) return;
  document.getElementById('editCliId').value = String(id);
  document.getElementById('editCliNombre').value = c.nombre || '';
  document.getElementById('editCliTel').value = c.telefono || '';
  document.getElementById('editCliDesc').value = c.descripcion || '';
  modalClienteEditarBS.show();
}

function guardarEdicionCliente() {
  const c = clientesData.find(x => x.id === parseInt(document.getElementById('editCliId').value, 10));
  if (!c) { modalClienteEditarBS.hide(); return; }
  const nombre = document.getElementById('editCliNombre').value.trim();
  if (!nombre) {
    mostrarNotificacion('El cliente necesita un nombre.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  c.nombre = nombre;
  c.telefono = document.getElementById('editCliTel').value.trim();
  c.descripcion = document.getElementById('editCliDesc').value.trim();
  guardarClientes();
  modalClienteEditarBS.hide();
  renderListaClientes();
  refrescarCuentaClienteSiAbierta();
  mostrarNotificacion('Cliente actualizado', 'success', 'bi-check-circle-fill');
}

function eliminarCliente(id) {
  const c = clientesData.find(x => x.id === id);
  if (!c) return;
  pedirConfirmacion(`¿Eliminar a "${c.nombre}"? Se borrará también su historial de cuenta.`, () => {
    clientesData = clientesData.filter(x => x.id !== id);
    movimientosFiado = movimientosFiado.filter(m => m.clienteId !== id);
    guardarClientes();
    guardarFiados();
    renderListaClientes();
  });
}

/* --- MOVIMIENTOS ---
   `ventaId` (opcional): liga este cargo a una venta. Si esa venta se edita
   después (modal "Mis Ventas"), su total vuelve a sincronizar este `monto`
   (ver sincronizarCargoFiado en ventas.js). */
function registrarMovimientoFiado(clienteId, tipo, monto, concepto, ventaId) {
  movimientosFiado.push({
    id: 'fdo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    fecha: new Date().toISOString(),
    clienteId,
    tipo,
    monto: Math.abs(Number(monto) || 0),
    concepto: concepto || (tipo === 'cargo' ? 'Consumo' : 'Abono'),
    ventaId: ventaId || null,
    usuarioNombre: obtenerNombreUsuarioActivo()
  });
  if (movimientosFiado.length > MAX_MOV_FIADOS_GUARDADOS) {
    movimientosFiado.splice(0, movimientosFiado.length - MAX_MOV_FIADOS_GUARDADOS);
  }
  guardarFiados();
}

function registrarCargoFiado(clienteId) {
  pedirTexto('Monto a cargar a la cuenta (COP):', '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    // Segundo paso: descripción. Se espera a que el primer diálogo termine de
    // cerrarse antes de reabrirlo (mismo modal). Valor por defecto para que
    // nunca quede vacío (pedirTexto ignora el vacío).
    setTimeout(() => {
      pedirTexto('Descripción del cargo (qué consumió):', 'Cargo manual', (desc) => {
        registrarMovimientoFiado(clienteId, 'cargo', monto, desc.trim() || 'Cargo manual');
        renderListaClientes();
        refrescarCuentaClienteSiAbierta();
        mostrarNotificacion('Cargo registrado', 'success', 'bi-cart-plus');
      });
    }, 350);
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
    refrescarCuentaClienteSiAbierta();
    mostrarNotificacion('Abono registrado', 'success', 'bi-cash-coin');
  });
}

/* --- CUENTA / EXTRACTO DEL CLIENTE (#modalCuentaCliente) ---
   Estado de cuenta con todos los movimientos en orden cronológico y el
   saldo acumulado después de cada uno. */
function verCuentaCliente(clienteId) {
  const c = clientesData.find(x => x.id === clienteId);
  if (!c) return;
  cuentaClienteAbiertaId = clienteId;
  document.getElementById('ccNombre').textContent = c.nombre;
  document.getElementById('ccTel').innerHTML = [
    c.telefono ? `<i class="bi bi-telephone me-1"></i>${c.telefono}` : '',
    c.descripcion ? `<i class="bi bi-sticky me-1"></i>${c.descripcion}` : ''
  ].filter(Boolean).join(' · ');
  document.getElementById('ccBtnCargar').onclick = () => registrarCargoFiado(clienteId);
  document.getElementById('ccBtnAbono').onclick = () => registrarAbonoFiado(clienteId);
  renderCuentaCliente();
  modalCuentaClienteBS.show();
}

function renderCuentaCliente() {
  const id = cuentaClienteAbiertaId;
  if (id == null) return;

  const saldo = saldoCliente(id);
  const sEl = document.getElementById('ccSaldo');
  sEl.textContent = saldo > 0 ? formatMoney(saldo) + ' por cobrar'
    : saldo < 0 ? formatMoney(-saldo) + ' a favor' : 'Al día';
  sEl.className = 'badge fw-bold bg-light ' + (saldo > 0 ? 'text-danger' : saldo < 0 ? 'text-success' : 'text-secondary');

  const movs = movimientosFiado
    .filter(m => m.clienteId === id)
    .slice()
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));   // del más viejo al más nuevo

  const tb = document.getElementById('ccBody');
  if (movs.length === 0) {
    tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4 small">Sin movimientos en la cuenta todavía.</td></tr>`;
    return;
  }

  let run = 0;
  tb.innerHTML = movs.map(m => {
    const cargo = m.tipo === 'cargo';
    run += cargo ? m.monto : -m.monto;
    return `<tr>
      <td class="small text-nowrap">${formatFecha(m.fecha)}</td>
      <td>
        ${cargo ? '<i class="bi bi-arrow-down-circle text-danger me-1"></i>' : '<i class="bi bi-arrow-up-circle text-success me-1"></i>'}${m.concepto || (cargo ? 'Cargo' : 'Abono')}
        <div class="small text-muted"><i class="bi bi-person-fill"></i> ${m.usuarioNombre || '—'}</div>
      </td>
      <td class="text-end ${cargo ? 'text-danger fw-bold' : 'text-muted'}">${cargo ? formatMoney(m.monto) : ''}</td>
      <td class="text-end ${!cargo ? 'text-success fw-bold' : 'text-muted'}">${!cargo ? formatMoney(m.monto) : ''}</td>
      <td class="text-end fw-bold ${run > 0 ? 'text-danger' : run < 0 ? 'text-success' : ''}">${formatMoney(run)}</td>
    </tr>`;
  }).join('');
}

function refrescarCuentaClienteSiAbierta() {
  const el = document.getElementById('modalCuentaCliente');
  if (cuentaClienteAbiertaId != null && el && el.classList.contains('show')) {
    renderCuentaCliente();
  }
}

/* --- PUENTE CON EL MODAL DE CUENTAS ---
   "Guardar para pago después": registra la venta (es ingreso, pero a
   crédito) y anota el consumo en la cuenta del cliente elegido; cierra la
   cuenta de la mesa. */
function guardarCuentaParaPagoDespues() {
  const cuentas = mesasData[mesaActivaId];
  const cuenta = cuentas ? cuentas[cuentaActivaIndex] : null;
  if (!cuenta) return;
  const total = cuenta.productos.reduce((s, p) => s + (p.cant * p.precio), 0);
  if (total <= 0) {
    mostrarNotificacion('La cuenta está vacía.', 'warning', 'bi-exclamation-triangle-fill');
    return;
  }
  if (clientesData.length === 0) {
    mostrarNotificacion('Primero registra un cliente en "Clientes".', 'warning', 'bi-info-circle');
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
// Alias antiguo, por si quedó alguna referencia:
const cargarCuentaActualAFiado = guardarCuentaParaPagoDespues;

function confirmarCargoDesdeSeleccion(clienteId) {
  if (!fiadoModoSeleccion) return;
  const { concepto, mesaId, cuentaIndex } = fiadoModoSeleccion;

  const cuentas = mesasData[mesaId];
  const cuenta = cuentas ? cuentas[cuentaIndex] : null;
  if (!cuenta) { fiadoModoSeleccion = null; renderListaClientes(); return; }

  const cli = clientesData.find(c => c.id === clienteId);

  // 1) Es una venta (ingreso), solo que a crédito. Queda LIGADA al cliente:
  //    editar esta venta después actualiza lo que el cliente debe.
  const venta = registrarVenta(mesaId, cuenta);
  const monto = venta ? venta.total : 0;
  if (venta) {
    venta.clienteId = clienteId;
    venta.clienteNombre = cli ? cli.nombre : null;
    guardarVentas();
  }
  // 2) Cargo en la cuenta por cobrar del cliente, ligado a esa venta.
  registrarMovimientoFiado(clienteId, 'cargo', monto, concepto, venta ? venta.id : null);

  // 3) Se cierra la cuenta de la mesa.
  cuentas.splice(cuentaIndex, 1);
  if (cuentaActivaIndex >= cuentas.length) cuentaActivaIndex = Math.max(0, cuentas.length - 1);
  actualizarBadgeMesa(mesaId);
  actualizarSidebar();
  if (cuentas.length === 0) modalCuentasBS.hide();
  else { renderModalTabs(); renderAtendidoPor(); renderModalContenidoCuenta(); }

  fiadoModoSeleccion = null;
  renderListaClientes();
  mostrarNotificacion(`${formatMoney(monto)} guardados en la cuenta de ${cli ? cli.nombre : 'cliente'}`, 'success', 'bi-journal-check');
}
