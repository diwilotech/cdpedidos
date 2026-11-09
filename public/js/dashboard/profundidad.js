/* Profundidad del dashboard (solo administrador): qué se vende más, qué no rota, a qué hora se vende, stock bajo y descargas CSV.
   Usa los datos que ya carga dashboard.js (D) y el kit común dwviz. */
(function () {
  const dia = 86400000;
  const num = (v) => Number(v || 0).toLocaleString('es-CO');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function csv(nombre, filas) {
    const cel = (v) => { const t = String(v ?? '').replace(/\r?\n/g, ' '); return /[",;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + filas.map((f) => f.map(cel).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function pintar() {
    const host = document.getElementById('profundidad'), V = window.DwViz;
    if (!host || !V || !D.esAdmin) return;
    const desde = Date.now() - 30 * dia;
    const ventas = D.ventas.filter((v) => new Date(v.fecha).getTime() >= desde);
    if (!ventas.length && !D.catalogo.length) { V.vacio(host, { icono: 'bi-bag', titulo: 'Aún no hay ventas', texto: 'Cuando vendas, aquí verás lo que más sale, las horas pico y el stock bajo.' }); return; }

    const porProd = {};
    ventas.forEach((v) => (v.productos || []).forEach((p) => {
      const k = p.productId || p.nombre;
      const x = (porProd[k] ||= { nombre: p.nombre, cant: 0, valor: 0 });
      x.cant += p.cant || 0; x.valor += (p.cant || 0) * (p.precio || 0);
    }));
    const top = Object.values(porProd).sort((a, b) => b.cant - a.cant).slice(0, 8);
    const vendidos = new Set(Object.keys(porProd));
    const sinRotar = D.catalogo.filter((p) => (D.inventario[p.id] || 0) > 0 && !vendidos.has(p.id) && !vendidos.has(p.name) && !vendidos.has(p.nombre)).slice(0, 8);
    const bajo = D.catalogo.filter((p) => (D.inventario[p.id] ?? 0) <= 3 && p.activo !== false).sort((a, b) => (D.inventario[a.id] || 0) - (D.inventario[b.id] || 0)).slice(0, 8);
    const horas = Array(24).fill(0), dows = Array(7).fill(0);
    ventas.forEach((v) => { const d = new Date(v.fecha); horas[d.getHours()] += v.total || 0; dows[d.getDay()] += v.total || 0; });
    const horasUtiles = horas.map((x, h) => [h, x]).filter(([h]) => h >= 6);

    host.innerHTML = '<div class="dv-g"><div data-a></div><div data-b></div></div><div class="dv-g mt-3"><div data-c></div><div data-d></div></div>';
    const box = (id, titulo, sub) => { const h = host.querySelector(`[data-${id}]`); h.innerHTML = V.tarjeta(titulo, '<div data-in></div>', { sub }); return h.querySelector('[data-in]'); };
    const a = box('a', 'Lo que más se vende', 'Unidades vendidas en 30 días');
    if (top.length) V.ranking(a, top.map((p) => ({ nombre: p.nombre, valor: p.cant, detalle: formatMoney(p.valor) })), { fmt: num });
    else V.vacio(a, { icono: 'bi-bag', titulo: 'Sin ventas en 30 días', texto: 'Se llena con tus próximas ventas.' });
    V.barras(box('b', 'A qué hora se vende', 'Ventas en pesos por hora · 30 días'), { etiquetas: horasUtiles.map(([h]) => `${h}h`), series: [{ nombre: 'Ventas', datos: horasUtiles.map(([, x]) => x) }], fmt: (v) => formatMoney(v) });
    const c = box('c', 'Stock bajo', '3 unidades o menos: hora de reponer');
    c.innerHTML = bajo.length ? bajo.map((p) => `<div class="d-flex justify-content-between py-2 border-bottom"><span class="text-truncate">${esc(p.name || p.nombre)}</span><b class="${(D.inventario[p.id] || 0) <= 0 ? 'text-danger' : 'text-warning'}">${D.inventario[p.id] || 0}</b></div>`).join('') : '<div class="small text-muted p-2">Todo tiene stock suficiente.</div>';
    const d = box('d', 'Sin rotación en 30 días', 'Tienen stock pero no se han vendido');
    d.innerHTML = sinRotar.length ? sinRotar.map((p) => `<div class="d-flex justify-content-between py-2 border-bottom"><span class="text-truncate">${esc(p.name || p.nombre)}</span><span class="text-muted">${D.inventario[p.id] || 0} en stock</span></div>`).join('') : '<div class="small text-muted p-2">Todo lo que tienes en stock se está moviendo.</div>';
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-csv]'); if (!b || typeof D === 'undefined') return;
    const hoy = new Date().toISOString().slice(0, 10);
    if (b.dataset.csv === 'ventas') csv(`ventas-${hoy}.csv`, [['Fecha', 'Vendió', 'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Total de la venta'],
      ...D.ventas.flatMap((v) => (v.productos || []).map((p, i) => [new Date(v.fecha).toLocaleString('es-CO'), v.usuarioNombre || '', p.nombre, p.cant || 0, p.precio || 0, (p.cant || 0) * (p.precio || 0), i === 0 ? v.total || 0 : '']))]);
    if (b.dataset.csv === 'inventario') csv(`inventario-${hoy}.csv`, [['Producto', 'Costo', 'Precio', 'Stock'], ...D.catalogo.map((p) => [p.name || p.nombre, p.costo ?? p.cost ?? '', p.price ?? p.precio ?? '', D.inventario[p.id] || 0])]);
    if (b.dataset.csv === 'clientes') csv(`clientes-por-cobrar-${hoy}.csv`, [['Cliente', 'Teléfono', 'Saldo por cobrar'], ...D.clientes.map((c) => [c.nombre, c.telefono || '', saldoCli(c.id)])]);
  });

  // Se pinta después de que dashboard.js carga los datos
  const base = window.__dashInit;
  window.__dashInit = async function (user) { await base(user); try { pintar(); } catch (e) { console.error(e); } };
})();
