/* ============================================================================
   js/modules/clientes-fiados.js — Clientes y cuentas por cobrar
   ----------------------------------------------------------------------------
   Datos en tablas de D1 (vía window.db):
     clientes   : { id, nombre, telefono, descripcion, creado_en }
     mov_fiado  : { id, cliente_id, fecha, tipo:'cargo'|'abono', monto,
                    concepto, venta_id, usuario_id, usuario_nombre, creado_en }
   `clientesData` / `movimientosFiado` son cachés en memoria (las hidrata
   app.js y este módulo las mantiene al día tras cada mutación).
   Saldo del cliente = Σ cargos − Σ abonos  (lo que DEBE al local).
   ========================================================================== */

const modalFiadosBS = new bootstrap.Modal(document.getElementById('modalFiados'));
const modalCuentaClienteBS = new bootstrap.Modal(document.getElementById('modalCuentaCliente'));

// Cliente cuya cuenta/extracto está abierta en #modalCuentaCliente (o null).
let cuentaClienteAbiertaId = null;

// "Guardar para pago después": deja acá el monto/concepto pendientes.
let fiadoModoSeleccion = null;

/* --- CÁLCULOS --- */
function saldoCliente(clienteId) {
  return movimientosFiado
    .filter(m => m.cliente_id === clienteId)
    .reduce((acc, m) => acc + (m.tipo === 'cargo' ? m.monto : -m.monto), 0);
}
function saldoTotalPorCobrar() {
  return clientesData.reduce((acc, c) => acc + Math.max(0, saldoCliente(c.id)), 0);
}

/* --- MODAL LISTA --- */
function abrirModalClientes() {
  fiadoModoSeleccion = null;
  ['nuevoClienteNombre', 'nuevoClienteTelefono', 'nuevoClienteDescripcion'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderListaClientes();
  modalFiadosBS.show();
}

function renderListaClientes() {
  const cont = document.getElementById('listaClientes');
  document.getElementById('fiadosTotalPorCobrar').innerText = formatMoney(saldoTotalPorCobrar());

  const banner = document.getElementById('fiadoSeleccionBanner');
  if (fiadoModoSeleccion) {
    banner.classList.remove('d-none');
    document.getElementById('fiadoSeleccionMonto').innerText = formatMoney(fiadoModoSeleccion.monto);
  } else {
    banner.classList.add('d-none');
  }

  if (clientesData.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no hay clientes. Agrega el primero arriba.</div>`;
    return;
  }

  cont.innerHTML = [...clientesData].sort((a, b) => saldoCliente(b.id) - saldoCliente(a.id)).map(c => {
    const saldo = saldoCliente(c.id);
    const saldoClase = saldo > 0 ? 'text-danger' : saldo < 0 ? 'text-success' : 'text-muted';
    const saldoTxt = saldo > 0 ? formatMoney(saldo) + ' por cobrar'
                   : saldo < 0 ? formatMoney(-saldo) + ' a favor' : 'Al día';
    const info = [
      c.telefono ? '<i class="bi bi-telephone me-1"></i>' + c.telefono : '',
      c.descripcion ? '<i class="bi bi-sticky me-1"></i>' + c.descripcion : ''
    ].filter(Boolean).join(' · ');
    return `
      <div class="border rounded-3 p-2 mb-2">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div class="fw-bold"><i class="bi bi-person-vcard me-1 text-primary"></i>${c.nombre}</div>
            ${info ? `<div class="small text-muted">${info}</div>` : ''}
            <div class="small"><span class="${saldoClase} fw-bold">${saldoTxt}</span></div>
          </div>
          <div class="d-flex gap-1 flex-wrap">
            ${fiadoModoSeleccion
              ? `<button class="btn btn-sm btn-danger fw-bold" onclick="confirmarCargoDesdeSeleccion('${c.id}')"><i class="bi bi-arrow-down-circle me-1"></i>Guardar aquí</button>`
              : `
                <button class="btn btn-sm btn-outline-primary fw-bold" onclick="verCuentaCliente('${c.id}')" title="Ver la cuenta / extracto"><i class="bi bi-journal-text me-1"></i> Ver cuenta</button>
                <button class="btn btn-sm btn-outline-danger" onclick="registrarCargoFiado('${c.id}')" title="Anotar un consumo"><i class="bi bi-cart-plus"></i> Cargar</button>
                <button class="btn btn-sm btn-outline-success" onclick="registrarAbonoFiado('${c.id}')" title="Registrar un pago"><i class="bi bi-cash-coin"></i> Abono</button>
                <button class="btn btn-sm btn-outline-secondary" onclick="editarClienteModal('${c.id}')" title="Editar datos"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarCliente('${c.id}')" title="Eliminar"><i class="bi bi-trash3"></i></button>
              `}
          </div>
        </div>
      </div>`;
  }).join('');
}

async function agregarCliente() {
  const nombre = document.getElementById('nuevoClienteNombre').value.trim();
  if (!nombre) {
    mostrarNotificacion('Ponle un nombre al cliente.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  const telefono = document.getElementById('nuevoClienteTelefono').value.trim();
  const descripcion = document.getElementById('nuevoClienteDescripcion').value.trim();
  try {
    const c = await db.crear('clientes', { nombre, telefono, descripcion });
    clientesData.push(c);
    ['nuevoClienteNombre', 'nuevoClienteTelefono', 'nuevoClienteDescripcion'].forEach(id => { document.getElementById(id).value = ''; });
    renderListaClientes();
    mostrarNotificacion(`Cliente "${nombre}" agregado`, 'success', 'bi-person-plus-fill');
  } catch (e) {
    mostrarNotificacion('No se pudo agregar el cliente.', 'danger', 'bi-exclamation-triangle-fill');
  }
}

function editarClienteModal(id) {
  const c = clientesData.find(x => x.id === id);
  if (!c) return;
  document.getElementById('editCliId').value = id;
  document.getElementById('editCliNombre').value = c.nombre || '';
  document.getElementById('editCliTel').value = c.telefono || '';
  document.getElementById('editCliDesc').value = c.descripcion || '';
  modalClienteEditarBS.show();
}

async function guardarEdicionCliente() {
  const id = document.getElementById('editCliId').value;
  const c = clientesData.find(x => x.id === id);
  if (!c) { modalClienteEditarBS.hide(); return; }
  const nombre = document.getElementById('editCliNombre').value.trim();
  if (!nombre) {
    mostrarNotificacion('El cliente necesita un nombre.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  const datos = {
    nombre,
    telefono: document.getElementById('editCliTel').value.trim(),
    descripcion: document.getElementById('editCliDesc').value.trim()
  };
  try {
    await db.editar('clientes', id, datos);
    Object.assign(c, datos);
    modalClienteEditarBS.hide();
    renderListaClientes();
    refrescarCuentaClienteSiAbierta();
    mostrarNotificacion('Cliente actualizado', 'success', 'bi-check-circle-fill');
  } catch (e) {
    mostrarNotificacion('No se pudo guardar.', 'danger', 'bi-exclamation-triangle-fill');
  }
}

function eliminarCliente(id) {
  const c = clientesData.find(x => x.id === id);
  if (!c) return;
  pedirConfirmacion(`¿Eliminar a "${c.nombre}"? Se borrará también su historial de cuenta.`, async () => {
    try {
      await db.borrar('clientes', id);   // el server borra en cascada sus mov_fiado
      clientesData = clientesData.filter(x => x.id !== id);
      movimientosFiado = movimientosFiado.filter(m => m.cliente_id !== id);
      renderListaClientes();
    } catch (e) {
      mostrarNotificacion('No se pudo eliminar.', 'danger', 'bi-exclamation-triangle-fill');
    }
  });
}

/* --- MOVIMIENTOS ---
   `ventaId` (opcional): liga un cargo a una venta (al editarla, se
   resincroniza su monto — ver sincronizarCargoFiado en ventas.js). */
async function registrarMovimientoFiado(clienteId, tipo, monto, concepto, ventaId) {
  const fila = {
    cliente_id: clienteId,
    fecha: new Date().toISOString(),
    tipo,
    monto: Math.abs(Number(monto) || 0),
    concepto: concepto || (tipo === 'cargo' ? 'Consumo' : 'Abono'),
    venta_id: ventaId || null,
    usuario_nombre: obtenerNombreUsuarioActivo()
  };
  const m = await db.crear('mov_fiado', fila);
  movimientosFiado.push(m);
  return m;
}

function registrarCargoFiado(clienteId) {
  pedirTexto('Monto a cargar a la cuenta (COP):', '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    setTimeout(() => {
      pedirTexto('Descripción del cargo (qué consumió):', 'Cargo manual', async (desc) => {
        try {
          await registrarMovimientoFiado(clienteId, 'cargo', monto, desc.trim() || 'Cargo manual');
          renderListaClientes();
          refrescarCuentaClienteSiAbierta();
          mostrarNotificacion('Cargo registrado', 'success', 'bi-cart-plus');
        } catch (e) { mostrarNotificacion('No se pudo registrar el cargo.', 'danger', 'bi-exclamation-triangle-fill'); }
      });
    }, 350);
  });
}

function registrarAbonoFiado(clienteId) {
  const saldo = saldoCliente(clienteId);
  pedirTexto(`Abono del cliente (debe ${formatMoney(Math.max(0, saldo))}):`, '', async (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    try {
      await registrarMovimientoFiado(clienteId, 'abono', monto, 'Abono');
      renderListaClientes();
      refrescarCuentaClienteSiAbierta();
      mostrarNotificacion('Abono registrado', 'success', 'bi-cash-coin');
    } catch (e) { mostrarNotificacion('No se pudo registrar el abono.', 'danger', 'bi-exclamation-triangle-fill'); }
  });
}

/* --- CUENTA / EXTRACTO (#modalCuentaCliente) --- */
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
    .filter(m => m.cliente_id === id)
    .slice()
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));   // cronológico

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
        <div class="small text-muted"><i class="bi bi-person-fill"></i> ${m.usuario_nombre || '—'}</div>
      </td>
      <td class="text-end ${cargo ? 'text-danger fw-bold' : 'text-muted'}">${cargo ? formatMoney(m.monto) : ''}</td>
      <td class="text-end ${!cargo ? 'text-success fw-bold' : 'text-muted'}">${!cargo ? formatMoney(m.monto) : ''}</td>
      <td class="text-end fw-bold ${run > 0 ? 'text-danger' : run < 0 ? 'text-success' : ''}">${formatMoney(run)}</td>
    </tr>`;
  }).join('');
}

function refrescarCuentaClienteSiAbierta() {
  const el = document.getElementById('modalCuentaCliente');
  if (cuentaClienteAbiertaId != null && el && el.classList.contains('show')) renderCuentaCliente();
}

/* --- PUENTE CON EL MODAL DE CUENTAS: "Guardar para pago después" --- */
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
const cargarCuentaActualAFiado = guardarCuentaParaPagoDespues;   // alias antiguo

async function confirmarCargoDesdeSeleccion(clienteId) {
  if (!fiadoModoSeleccion) return;
  const { concepto, mesaId, cuentaIndex } = fiadoModoSeleccion;
  const cuentas = mesasData[mesaId];
  const cuenta = cuentas ? cuentas[cuentaIndex] : null;
  if (!cuenta) { fiadoModoSeleccion = null; renderListaClientes(); return; }
  const cli = clientesData.find(c => c.id === clienteId);

  // 1) Venta a crédito, ligada al cliente (la venta todavía es bloque — dominio 4).
  const venta = registrarVenta(mesaId, cuenta);
  const monto = venta ? venta.total : 0;
  if (venta) {
    venta.clienteId = clienteId;
    venta.clienteNombre = cli ? cli.nombre : null;
    guardarVentas();
  }
  // 2) Cargo en la cuenta por cobrar del cliente, ligado a esa venta.
  try {
    await registrarMovimientoFiado(clienteId, 'cargo', monto, concepto, venta ? venta.id : null);
  } catch (e) {
    mostrarNotificacion('La venta se registró pero no se pudo anotar el fiado.', 'warning', 'bi-exclamation-triangle-fill');
  }

  // 3) Cerrar la cuenta de la mesa.
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
