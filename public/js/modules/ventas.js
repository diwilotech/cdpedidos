/* ============================================================================
   js/modules/ventas.js — Registro y reporte de ventas
   ----------------------------------------------------------------------------
   `registrarVenta()` se llama al liquidar una cuenta. El modal de Ventas
   muestra el acumulado por usuario y las cuentas liquidadas recientes.
   ========================================================================== */

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
    usuarioId: cuenta.usuarioId || null,
    usuarioNombre: cuenta.usuarioNombre || 'Sin asignar',
    total,
    productos: cuenta.productos.map(p => ({ nombre: p.nombre, cant: p.cant, precio: p.precio }))
  };

  ventasData.push(venta);
  if (ventasData.length > MAX_VENTAS_GUARDADAS) {
    ventasData.splice(0, ventasData.length - MAX_VENTAS_GUARDADAS);
  }
  guardarVentas();
}

function abrirModalVentas() {
  renderResumenVentasPorUsuario();
  renderListaVentas();
  modalVentasBS.show();
}

function renderResumenVentasPorUsuario() {
  const cont = document.getElementById('resumenVentasPorUsuario');
  cont.innerHTML = '';

  if (ventasData.length === 0) {
    cont.innerHTML = `<div class="text-muted small">Todavía no hay ventas registradas.</div>`;
    return;
  }

  const totales = {}; // nombre -> {total, cuentas}
  ventasData.forEach(v => {
    const nombre = v.usuarioNombre || 'Sin asignar';
    if (!totales[nombre]) totales[nombre] = { total: 0, cuentas: 0 };
    totales[nombre].total += v.total;
    totales[nombre].cuentas += 1;
  });

  const nombresOrdenados = Object.keys(totales).sort((a, b) => totales[b].total - totales[a].total);

  nombresOrdenados.forEach(nombre => {
    const info = totales[nombre];
    const card = document.createElement('div');
    card.className = 'border rounded-3 p-2 px-3 bg-light';
    card.innerHTML = `
      <div class="small text-muted"><i class="bi bi-person-fill me-1"></i>${nombre}</div>
      <div class="fw-bold text-success">${formatMoney(info.total)}</div>
      <div class="small text-muted">${info.cuentas} ${info.cuentas === 1 ? 'cuenta' : 'cuentas'}</div>
    `;
    cont.appendChild(card);
  });
}

function renderListaVentas() {
  const cont = document.getElementById('listaVentas');
  cont.innerHTML = '';

  if (ventasData.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no hay cuentas liquidadas.</div>`;
    return;
  }

  const recientes = [...ventasData].reverse().slice(0, 100);

  recientes.forEach(v => {
    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between align-items-center border rounded-3 p-2 mb-2';
    row.innerHTML = `
      <div>
        <div class="fw-bold">${v.mesaNombre} · ${v.cuentaNombre}</div>
        <div class="small text-muted">${formatFecha(v.fecha)} · <i class="bi bi-person-fill"></i> ${v.usuarioNombre}</div>
      </div>
      <span class="fs-6 fw-bold text-success">${formatMoney(v.total)}</span>
    `;
    cont.appendChild(row);
  });
}
