/* ============================================================================
   js/modules/caja.js — Flujo de caja (POS)
   ----------------------------------------------------------------------------
   Un turno de caja a la vez (compartido):
     · Apertura: la persona pone el VALOR INICIAL (la base).
     · Entradas / Salidas: movimientos de efectivo que carga la persona
       (monto + concepto).
     · Cierre: esperado = inicial + entradas − salidas. La persona cuenta el
       efectivo real; se guarda la diferencia y el turno se archiva.
   ========================================================================== */

const modalCajaBS = new bootstrap.Modal(document.getElementById('modalCaja'));

function abrirModalCaja() {
  renderCaja();
  modalCajaBS.show();
}

// Entradas / salidas MANUALES que cargó la persona (movimientos de efectivo
// que no son ventas: propina, cambio, compra rápida, retiro, etc.).
function totalMovsCaja(tipo) {
  if (!cajaActual) return 0;
  return cajaActual.movimientos.filter(m => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
}

// Ventas del turno abierto (desde la apertura).
//   soloCredito = false -> ventas COBRADAS (entran a la caja como entrada).
//   soloCredito = true  -> ventas a crédito (cuenta por cobrar de un cliente):
//                          NO entran a la caja, se muestran aparte.
function ventasDelTurno(soloCredito) {
  if (!cajaActual) return [];
  const desde = new Date(cajaActual.fecha).getTime();
  return (typeof ventasData !== 'undefined' ? ventasData : [])
    .filter(v => new Date(v.fecha).getTime() >= desde)
    .filter(v => (soloCredito ? !!v.clienteId : !v.clienteId));
}
function totalVentasTurno(soloCredito) {
  return ventasDelTurno(soloCredito).reduce((s, v) => s + (v.total || 0), 0);
}
// Compat: suma de ventas cobradas del turno.
function ventasCobradasDelTurno() { return totalVentasTurno(false); }

// Lo que debería haber en la caja:
//   valor inicial + ventas cobradas del turno + entradas manuales − salidas.
function esperadoEnCaja() {
  if (!cajaActual) return 0;
  return cajaActual.montoInicial
    + totalVentasTurno(false)
    + totalMovsCaja('entrada')
    - totalMovsCaja('salida');
}

function actualizarBadgeCaja() {
  const b = document.getElementById('fabCajaBadge');
  if (b) b.classList.toggle('d-none', !cajaActual);
  const fab = document.getElementById('btnFabCaja');
  if (fab) fab.classList.toggle('caja-abierta', !!cajaActual);
  const dot = document.getElementById('bbCajaDot');   // menú inferior
  if (dot) dot.classList.toggle('d-none', !cajaActual);
}

function horaCorta(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function renderMovsCaja(list, cls, signo) {
  if (!list.length) return '';
  return list.slice().reverse().map(m => `
    <div class="d-flex justify-content-between align-items-center small border-bottom py-1">
      <span>${m.concepto} <span class="text-muted">· ${horaCorta(m.fecha)} · ${m.usuarioNombre}</span></span>
      <span class="fw-bold ${cls}">${signo}${formatMoney(m.monto)}</span>
    </div>`).join('');
}

function renderCaja() {
  const cont = document.getElementById('cajaContenido');

  if (!cajaActual) {
    cont.innerHTML = `
      <div class="text-center py-2">
        <i class="bi bi-cash-stack fs-1 text-secondary"></i>
        <p class="text-muted small mt-2 mb-3">No hay una caja abierta.</p>
      </div>
      <label class="form-label small fw-bold mb-1">Valor inicial (base con la que arranca la caja)</label>
      <div class="input-group mb-3">
        <span class="input-group-text">$</span>
        <input type="number" id="cajaMontoInicial" class="form-control" min="0" step="1000" placeholder="0" value="0">
      </div>
      <button class="btn btn-success w-100 fw-bold" onclick="abrirCaja()"><i class="bi bi-unlock me-1"></i> Abrir caja</button>`;
    return;
  }

  const entManual = cajaActual.movimientos.filter(m => m.tipo === 'entrada');
  const salManual = cajaActual.movimientos.filter(m => m.tipo === 'salida');
  const tEntManual = totalMovsCaja('entrada');
  const tSalManual = totalMovsCaja('salida');

  const ventasCobradas = ventasDelTurno(false);
  const ventasCredito  = ventasDelTurno(true);
  const tVentasCobradas = ventasCobradas.reduce((s, v) => s + (v.total || 0), 0);
  const tVentasCredito  = ventasCredito.reduce((s, v) => s + (v.total || 0), 0);
  const tEntradas = tVentasCobradas + tEntManual;

  const filaVentaCobrada = ventasCobradas.length
    ? `<div class="d-flex justify-content-between align-items-center small border-bottom py-1">
         <span><i class="bi bi-bag-check me-1 text-success"></i>Ventas cobradas del turno <span class="text-muted">· ${ventasCobradas.length}</span></span>
         <span class="fw-bold text-success">+${formatMoney(tVentasCobradas)}</span>
       </div>`
    : '';

  const listaCredito = ventasCredito.length
    ? ventasCredito.slice().reverse().map(v => `
        <div class="d-flex justify-content-between align-items-center small border-bottom py-1">
          <span><i class="bi bi-person-vcard me-1" style="color:#fd7e14"></i>${v.clienteNombre || 'Cliente'} <span class="text-muted">· ${v.mesaNombre} · ${horaCorta(v.fecha)}</span></span>
          <span class="fw-bold" style="color:#fd7e14">${formatMoney(v.total)}</span>
        </div>`).join('')
    : `<div class="small text-muted fst-italic px-1">Sin ventas a crédito en el turno.</div>`;

  cont.innerHTML = `
    <div class="d-flex justify-content-between align-items-center small text-muted mb-2">
      <span><i class="bi bi-person-fill me-1"></i>Abierta por ${cajaActual.usuarioNombre}</span>
      <span>${formatFecha(cajaActual.fecha)}</span>
    </div>

    <div class="d-flex justify-content-between border rounded-3 p-2 mb-3">
      <span class="fw-bold"><i class="bi bi-wallet2 me-1"></i>Valor inicial</span>
      <span class="fw-bold">${formatMoney(cajaActual.montoInicial)}</span>
    </div>

    <div class="small fw-bold text-success mb-1"><i class="bi bi-arrow-down-circle me-1"></i>Entradas · ${formatMoney(tEntradas)}</div>
    ${filaVentaCobrada}
    ${renderMovsCaja(entManual, 'text-success', '+')}
    <button class="btn btn-sm btn-outline-success mt-1 mb-3" onclick="agregarMovCaja('entrada')"><i class="bi bi-plus-lg"></i> Entrada manual</button>

    <div class="small fw-bold text-danger mb-1"><i class="bi bi-arrow-up-circle me-1"></i>Salidas · ${formatMoney(tSalManual)}</div>
    ${renderMovsCaja(salManual, 'text-danger', '−') || `<div class="small text-muted fst-italic px-1">Sin salidas.</div>`}
    <button class="btn btn-sm btn-outline-danger mt-1 mb-3" onclick="agregarMovCaja('salida')"><i class="bi bi-plus-lg"></i> Salida</button>

    <div class="small fw-bold mb-1" style="color:#fd7e14"><i class="bi bi-hourglass-split me-1"></i>Por cobrar del turno · ${formatMoney(tVentasCredito)}</div>
    <div class="mb-1">${listaCredito}</div>
    <div class="small text-muted mb-3"><i class="bi bi-info-circle me-1"></i>Las ventas a crédito no entran a la caja.</div>

    <div class="d-flex justify-content-between align-items-center bg-light rounded-3 p-2 mb-3">
      <span class="fw-bold">Esperado en caja</span>
      <span class="fs-5 fw-bold text-primary">${formatMoney(esperadoEnCaja())}</span>
    </div>

    <button class="btn btn-dark w-100 fw-bold" onclick="cerrarCaja()"><i class="bi bi-lock me-1"></i> Cierre de caja</button>`;
}

function abrirCaja() {
  if (cajaActual) { renderCaja(); return; }
  const monto = Math.max(0, parseFloat(document.getElementById('cajaMontoInicial').value) || 0);
  cajaActual = {
    id: 'caja-' + Date.now(),
    fecha: new Date().toISOString(),
    usuarioNombre: obtenerNombreUsuarioActivo(),
    montoInicial: monto,
    movimientos: []
  };
  guardarCaja();
  actualizarBadgeCaja();
  renderCaja();
  mostrarNotificacion(`Caja abierta con ${formatMoney(monto)}`, 'success', 'bi-unlock');
}

function agregarMovCaja(tipo) {
  if (!cajaActual) return;
  const esEnt = tipo === 'entrada';
  pedirTexto(esEnt ? 'Monto que ENTRA a la caja (COP):' : 'Monto que SALE de la caja (COP):', '', (valor) => {
    const monto = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
    if (isNaN(monto) || monto <= 0) {
      mostrarNotificacion('Ingresa un monto válido.', 'danger', 'bi-exclamation-triangle-fill');
      return;
    }
    setTimeout(() => {
      pedirTexto('Concepto / motivo:', esEnt ? 'Ingreso' : 'Gasto', (concepto) => {
        cajaActual.movimientos.push({
          id: 'cm-' + Date.now(),
          fecha: new Date().toISOString(),
          tipo,
          monto: Math.abs(monto),
          concepto: concepto.trim() || (esEnt ? 'Ingreso' : 'Gasto'),
          usuarioNombre: obtenerNombreUsuarioActivo()
        });
        guardarCaja();
        renderCaja();
        mostrarNotificacion(esEnt ? 'Entrada registrada' : 'Salida registrada', 'success', 'bi-check-circle-fill');
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
            ventasPorCobrarTurno: totalVentasTurno(true),
            totalEntradasManual: totalMovsCaja('entrada'),
            totalSalidas: totalMovsCaja('salida')
          };
          cajaHist.push(turno);
          if (cajaHist.length > MAX_CIERRES_CAJA_GUARDADOS) {
            cajaHist.splice(0, cajaHist.length - MAX_CIERRES_CAJA_GUARDADOS);
          }
          cajaActual = null;
          guardarCaja();
          guardarCajaHist();
          actualizarBadgeCaja();
          renderCaja();
          mostrarNotificacion('Caja cerrada · ' + difTxt, diferencia === 0 ? 'success' : 'warning', 'bi-lock');
        }
      );
    }, 350);
  });
}
