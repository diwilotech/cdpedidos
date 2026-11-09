// Inicio = el módulo Dashboard de Diwilo Modulos. Aquí solo se registra lo PROPIO de Pedidos: el día del negocio (ventas, por cobrar, quién vendió, más vendido).
(() => {
  const { esc, money, bloque } = window.Ped;
  const diaCO = (iso) => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10);
  (window.DwDashboard = window.DwDashboard || []).push({
    id: 'pedidos',
    titulo: 'Tu negocio hoy',
    async mount(host) {
      host.innerHTML = '<div class="empty small">Cargando…</div>';
      const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
      const ventas = (await bloque('plano-restaurante-ventas-v1', [])).filter((v) => diaCO(v.fecha) === hoy);
      const tot = (l) => l.reduce((t, v) => t + (Number(v.total) || 0), 0);
      const porPersona = {}, porProd = {};
      ventas.forEach((v) => {
        porPersona[v.usuarioNombre || 'Sin asignar'] = (porPersona[v.usuarioNombre || 'Sin asignar'] || 0) + (Number(v.total) || 0);
        (v.productos || []).forEach((p) => { porProd[p.nombre] = (porProd[p.nombre] || 0) + (p.cant || 0); });
      });
      const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const card = ([icon, label, value, sub]) => `<div class="col-6 col-lg-3"><div class="card kpi h-100"><div class="d-flex justify-content-between align-items-start"><div class="kpi-label">${label}</div><i class="bi ${icon} kpi-icon"></i></div><div class="kpi-value mt-1">${esc(value)}</div><div class="small text-body-secondary mt-1">${esc(sub)}</div></div></div>`;
      const lista = (t, f) => t.length ? t.map(([n, v]) => `<div class="list-group-item d-flex justify-content-between"><span class="text-truncate">${esc(n)}</span><b>${esc(f(v))}</b></div>`).join('') : '<div class="empty small">Aún no hay ventas hoy</div>';
      host.innerHTML = `<div class="row g-3 mb-3">${[
        ['bi-cash-stack', 'Vendido hoy', money(tot(ventas)), `${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}`],
        ['bi-check2-circle', 'Cobrado hoy', money(tot(ventas.filter((v) => !v.clienteId))), 'Efectivo y transferencias'],
        ['bi-hourglass-split', 'Por cobrar hoy', money(tot(ventas.filter((v) => v.clienteId))), 'Cuentas a nombre de clientes'],
        ['bi-people', 'Vendieron', Object.keys(porPersona).length, 'Personas con ventas hoy'],
      ].map(card).join('')}</div>
      <div class="row g-3"><div class="col-lg-6"><div class="card"><div class="card-header py-3"><i class="bi bi-person-check me-2"></i>Quién vendió hoy</div><div class="list-group list-group-flush">${lista(top(porPersona), money)}</div></div></div>
      <div class="col-lg-6"><div class="card"><div class="card-header py-3"><i class="bi bi-trophy me-2"></i>Lo más vendido hoy</div><div class="list-group list-group-flush">${lista(top(porProd), (v) => `${v} uds`)}</div></div></div></div>
      <div class="mt-3 d-flex gap-2 flex-wrap"><a class="btn btn-primary" href="/staff/ventas.html" data-go="/staff/ventas.html"><i class="bi bi-grid-3x3-gap me-1"></i>Abrir ventas</a><a class="btn btn-outline-secondary" href="/staff/tablero.html" data-go="/staff/tablero.html"><i class="bi bi-speedometer2 me-1"></i>Tablero completo</a></div>`;
    },
  });
})();
