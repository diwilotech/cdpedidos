/* ============================================================================
   js/modules/caja.js — Caja del día (unificada dentro de "Mis Ventas")
   ----------------------------------------------------------------------------
   Un turno de caja a la vez (compartido). Se ve y se opera desde el modal
   "Mis Ventas": arriba del todo (antes de las ventas) va el valor inicial /
   el turno abierto, y abajo del todo el botón de cierre.
     · Apertura : la persona pone el VALOR INICIAL (la base).
     · Ventas cobradas del turno  -> entran a la caja como entrada.
     · Ventas a crédito del turno  -> NO entran (se muestran aparte).
     · Entradas / salidas manuales -> efectivo que no es venta.
     · Cierre : esperado = inicial + ventas cobradas + entradas − salidas.
   ========================================================================== */

// Entradas / salidas MANUALES que cargó la persona (efectivo que no es venta:
// propina, cambio, compra rápida, retiro, etc.).
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
// Compat.
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

// Punto verde en el botón "Ventas" del menú inferior mientras hay caja abierta.
function actualizarBadgeCaja() {
  const dot = document.getElementById('bbVentasDot');
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

// Tarjetita de resumen (mismo estilo que las de "Mis Ventas").
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

  const entManual = cajaActual.movimientos.filter(m => m.tipo === 'entrada');
  const salManual = cajaActual.movimientos.filter(m => m.tipo === 'salida');
  const tEntManual = totalMovsCaja('entrada');
  const tSalManual = totalMovsCaja('salida');

  const ventasCobradas = ventasDelTurno(false);
  const ventasCredito  = ventasDelTurno(true);
  const tVentasCobradas = ventasCobradas.reduce((s, v) => s + (v.total || 0), 0);
  const tVentasCredito  = ventasCredito.reduce((s, v) => s + (v.total || 0), 0);

  const listaCredito = ventasCredito.length
    ? ventasCredito.slice().reverse().map(v => `
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
        ${cardCaja('Valor inicial', formatMoney(cajaActual.montoInicial))}
        ${cardCaja('Ventas cobradas', formatMoney(tVentasCobradas), `${ventasCobradas.length} · entra a caja`)}
        ${cardCaja('Entradas / Salidas', `+${formatMoney(tEntManual)} / −${formatMoney(tSalManual)}`, 'efectivo manual')}
        ${cardCaja('Esperado en caja', formatMoney(esperadoEnCaja()), null, 'border-primary')}
      </div>

      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-sm btn-outline-success" onclick="agregarMovCaja('entrada')"><i class="bi bi-plus-lg"></i> Entrada</button>
        <button class="btn btn-sm btn-outline-danger" onclick="agregarMovCaja('salida')"><i class="bi bi-dash-lg"></i> Salida</button>
      </div>

      <details class="mt-2">
        <summary class="small text-muted" style="cursor:pointer">Ver movimientos y "por cobrar" del turno</summary>
        <div class="mt-2">
          <div class="small fw-bold text-success mb-1"><i class="bi bi-arrow-down-circle me-1"></i>Entradas manuales</div>
          ${renderMovsCaja(entManual, 'text-success', '+') || `<div class="small text-muted fst-italic px-1">Sin entradas manuales.</div>`}
          <div class="small fw-bold text-danger mt-2 mb-1"><i class="bi bi-arrow-up-circle me-1"></i>Salidas</div>
          ${renderMovsCaja(salManual, 'text-danger', '−') || `<div class="small text-muted fst-italic px-1">Sin salidas.</div>`}
          <div class="small fw-bold mt-2 mb-1" style="color:#fd7e14"><i class="bi bi-hourglass-split me-1"></i>Por cobrar del turno · ${formatMoney(tVentasCredito)} <span class="text-muted fw-normal">(no entra a la caja)</span></div>
          ${listaCredito}
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
  if (typeof renderResumenVentasPorUsuario === 'function') renderResumenVentasPorUsuario();
  if (typeof renderListaVentas === 'function') renderListaVentas();
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
        refrescarVentasYCaja();
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
          refrescarVentasYCaja();
          mostrarNotificacion('Caja cerrada · ' + difTxt, diferencia === 0 ? 'success' : 'warning', 'bi-lock');
        }
      );
    }, 350);
  });
}
