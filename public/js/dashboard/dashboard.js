/* ============================================================================
   js/dashboard/dashboard.js — Panel de administración
   ----------------------------------------------------------------------------
   Lee los mismos datos que la app de venta (window.storage -> D1) y muestra:
     · KPIs del día
     · Ventas del día por personal
     · Movimientos de cada producto (quién lo vendió / sacó / ajuste de pérdida)
     · Gráfico de ventas de la semana  +  gráfico de ventas por categoría
     · Catálogo (editar precio / categoría / nombre, nuevo, registrar pérdida)
     · Proveedores y cuentas por pagar
   Lo dispara js/dashboard/gate.js una vez confirmado que el usuario es admin.
   ========================================================================== */

/* ---------- estado local ---------- */
const D = {
  usuario: null,
  ventas: [],
  movimientos: [],
  inventario: {},
  catalogo: [],          // lista completa de productos {id,name,price,code,categoryId,stock}
  clientes: [],
  fiados: [],
  proveedores: [],
  contadorProveedores: 0,
  cxp: []
};
let chartSemana = null;
let chartCategoria = null;

/* ---------- helpers de datos ---------- */
async function leer(key) {
  const r = await window.storage.get(key, true);
  if (!r || r.value == null) return null;
  try { return JSON.parse(r.value); } catch (e) { return null; }
}
async function escribir(key, valor) {
  await window.storage.set(key, JSON.stringify(valor), true);
}

const catById = {};
dbJSON.categories.forEach(c => { catById[c.id] = c.name; });
const nombreCategoria = (id) => catById[id] || 'Sin categoría';

function esHoy(iso) {
  const d = new Date(iso), h = new Date();
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}
const uid = (p) => p + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

/* ---------- carga ---------- */
window.__dashInit = async function (user) {
  D.usuario = user;

  const [ventas, movs, inv, cat, cli, fdo, prov, cxp] = await Promise.all([
    leer(STORAGE_KEY_VENTAS), leer(STORAGE_KEY_MOVIMIENTOS), leer(STORAGE_KEY_INVENTARIO),
    leer(STORAGE_KEY_PRODUCTOS), leer(STORAGE_KEY_CLIENTES), leer(STORAGE_KEY_FIADOS),
    leer(STORAGE_KEY_PROVEEDORES), leer(STORAGE_KEY_CXP)
  ]);

  D.ventas = Array.isArray(ventas) ? ventas : [];
  D.movimientos = Array.isArray(movs) ? movs : [];
  D.inventario = inv && typeof inv === 'object' ? inv : {};
  D.catalogo = (Array.isArray(cat) && cat.length) ? cat.map(p => ({ ...p })) : dbJSON.products.map(p => ({ ...p }));
  D.clientes = (cli && Array.isArray(cli.clientes)) ? cli.clientes : [];
  D.fiados = Array.isArray(fdo) ? fdo : [];
  D.proveedores = (prov && Array.isArray(prov.proveedores)) ? prov.proveedores : [];
  D.contadorProveedores = (prov && typeof prov.contadorProveedores === 'number') ? prov.contadorProveedores : D.proveedores.length;
  D.cxp = Array.isArray(cxp) ? cxp : [];

  // stock efectivo: lo guardado tiene prioridad sobre el del catálogo
  D.catalogo.forEach(p => { if (D.inventario[p.id] === undefined) D.inventario[p.id] = p.stock || 0; });

  document.getElementById('dashCargando').classList.add('d-none');
  document.getElementById('dashContenido').classList.remove('d-none');

  // select de categoría del formulario "nuevo producto"
  document.getElementById('nvProdCat').innerHTML = dbJSON.categories
    .filter(c => c.id !== 'cat-all')
    .map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  renderKPIs();
  renderVentasPorPersonal();
  renderMovimientos();
  renderCatalogo();
  renderProveedores();
  renderGraficoSemana();
  renderGraficoCategoria();
};

/* ---------- KPIs ---------- */
function renderKPIs() {
  const hoy = D.ventas.filter(v => esHoy(v.fecha));
  const totalHoy = hoy.reduce((s, v) => s + (v.total || 0), 0);
  const porCobrar = D.clientes.reduce((s, c) => {
    const saldo = D.fiados.filter(m => m.clienteId === c.id)
      .reduce((a, m) => a + (m.tipo === 'cargo' ? m.monto : -m.monto), 0);
    return s + Math.max(0, saldo);
  }, 0);
  const porPagar = D.proveedores.reduce((s, p) => {
    const saldo = D.cxp.filter(m => m.proveedorId === p.id)
      .reduce((a, m) => a + (m.tipo === 'factura' ? m.monto : -m.monto), 0);
    return s + Math.max(0, saldo);
  }, 0);

  document.getElementById('kpiVentasHoy').textContent = formatMoney(totalHoy);
  document.getElementById('kpiCuentasHoy').textContent = hoy.length + (hoy.length === 1 ? ' venta' : ' ventas');
  document.getElementById('kpiPorCobrar').textContent = formatMoney(porCobrar);
  document.getElementById('kpiPorPagar').textContent = formatMoney(porPagar);
}

/* ---------- ventas del día por personal ---------- */
function renderVentasPorPersonal() {
  const hoy = D.ventas.filter(v => esHoy(v.fecha));
  const porPersona = {};
  hoy.forEach(v => {
    const n = v.usuarioNombre || 'Sin asignar';
    if (!porPersona[n]) porPersona[n] = { total: 0, ventas: 0, unidades: 0 };
    porPersona[n].total += v.total || 0;
    porPersona[n].ventas += 1;
    porPersona[n].unidades += (v.productos || []).reduce((s, p) => s + (p.cant || 0), 0);
  });
  const filas = Object.keys(porPersona).sort((a, b) => porPersona[b].total - porPersona[a].total);
  const tb = document.getElementById('tbodyPersonal');
  tb.innerHTML = filas.length === 0
    ? `<tr><td colspan="4" class="text-center text-muted py-3 small">Sin ventas hoy.</td></tr>`
    : filas.map(n => `
      <tr>
        <td class="fw-bold">${n}</td>
        <td class="text-end">${porPersona[n].ventas}</td>
        <td class="text-end">${porPersona[n].unidades}</td>
        <td class="text-end fw-bold text-success">${formatMoney(porPersona[n].total)}</td>
      </tr>`).join('');
}

/* ---------- movimientos de producto ---------- */
function motivoBadge(m) {
  const mot = (m.motivo || '').toLowerCase();
  if (m.tipo === 'entrada') return '<span class="badge text-bg-success">Entrada</span>';
  if (mot.includes('pérdida') || mot.includes('perdida')) return '<span class="badge text-bg-dark">Pérdida</span>';
  if (mot.includes('devol')) return '<span class="badge text-bg-warning">Devolución</span>';
  if (mot.includes('venta')) return '<span class="badge text-bg-danger">Venta</span>';
  return '<span class="badge text-bg-secondary">Salida</span>';
}
function renderMovimientos() {
  const filtro = document.getElementById('filtroMov').value;
  let movs = [...D.movimientos].reverse();
  if (filtro === 'salidas') movs = movs.filter(m => m.tipo === 'salida');
  else if (filtro === 'entradas') movs = movs.filter(m => m.tipo === 'entrada');
  else if (filtro === 'perdidas') movs = movs.filter(m => (m.motivo || '').toLowerCase().includes('rdida'));
  movs = movs.slice(0, 200);

  const tb = document.getElementById('tbodyMov');
  tb.innerHTML = movs.length === 0
    ? `<tr><td colspan="6" class="text-center text-muted py-3 small">Sin movimientos.</td></tr>`
    : movs.map(m => `
      <tr>
        <td class="small text-muted text-nowrap">${formatFecha(m.fecha)}</td>
        <td class="fw-bold">${m.productName || m.productId || '—'}</td>
        <td>${motivoBadge(m)}</td>
        <td class="text-end fw-bold ${m.tipo === 'entrada' ? 'text-success' : 'text-danger'}">${m.tipo === 'entrada' ? '+' : '−'}${m.cantidad}</td>
        <td class="small">${m.motivo || ''}</td>
        <td class="small"><i class="bi bi-person-fill me-1"></i>${m.usuarioNombre || 'Sin asignar'}</td>
      </tr>`).join('');
}

/* ---------- catálogo ---------- */
function renderCatalogo() {
  const tb = document.getElementById('tbodyCatalogo');
  const cats = dbJSON.categories.filter(c => c.id !== 'cat-all');
  tb.innerHTML = D.catalogo.map((p, i) => `
    <tr>
      <td><input class="form-control form-control-sm" value="${(p.name || '').replace(/"/g, '&quot;')}" onchange="catEditar(${i},'name',this.value)"></td>
      <td>
        <select class="form-select form-select-sm" onchange="catEditar(${i},'categoryId',this.value)">
          ${cats.map(c => `<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </td>
      <td style="width:120px"><input type="number" min="0" step="500" class="form-control form-control-sm text-end" value="${p.price || 0}" onchange="catEditar(${i},'price',this.value)"></td>
      <td class="text-end">${D.inventario[p.id] ?? 0}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-dark" title="Registrar pérdida / merma" onclick="catPerdida(${i})"><i class="bi bi-dash-circle"></i></button>
        <button class="btn btn-sm btn-outline-danger" title="Eliminar del catálogo" onclick="catBorrar(${i})"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`).join('');
}

async function guardarCatalogo() {
  await escribir(STORAGE_KEY_PRODUCTOS, D.catalogo);
  await escribir(STORAGE_KEY_INVENTARIO, D.inventario);
}

async function catEditar(i, campo, valor) {
  const p = D.catalogo[i];
  if (!p) return;
  if (campo === 'price') p.price = Math.max(0, parseFloat(valor) || 0);
  else p[campo] = valor;
  await guardarCatalogo();
  toast(`"${p.name}" actualizado`);
}

async function catBorrar(i) {
  const p = D.catalogo[i];
  if (!p || !confirm(`¿Eliminar "${p.name}" del catálogo? No borra las ventas ya hechas.`)) return;
  D.catalogo.splice(i, 1);
  delete D.inventario[p.id];
  await guardarCatalogo();
  renderCatalogo();
  toast('Producto eliminado');
}

async function catNuevo() {
  const name = document.getElementById('nvProdNombre').value.trim();
  const categoryId = document.getElementById('nvProdCat').value;
  const price = parseFloat(document.getElementById('nvProdPrecio').value) || 0;
  const stock = parseInt(document.getElementById('nvProdStock').value, 10) || 0;
  if (!name || price <= 0) { alert('Poné nombre y un precio válido.'); return; }
  const id = 'custom-' + Date.now();
  D.catalogo.push({ id, categoryId, name, price, code: (name.slice(0, 3).toUpperCase() + '-' + String(D.catalogo.length + 1).padStart(2, '0')), stock });
  D.inventario[id] = stock;
  if (stock > 0) registrarMov(id, name, stock, 'Alta de producto');
  await guardarCatalogo();
  await escribir(STORAGE_KEY_MOVIMIENTOS, D.movimientos);
  ['nvProdNombre', 'nvProdPrecio', 'nvProdStock'].forEach(x => document.getElementById(x).value = '');
  renderCatalogo(); renderMovimientos();
  toast(`"${name}" agregado`);
}

async function catPerdida(i) {
  const p = D.catalogo[i];
  if (!p) return;
  const n = parseInt(prompt(`Unidades de "${p.name}" a descontar por pérdida / merma:`, ''), 10);
  if (isNaN(n) || n <= 0) return;
  D.inventario[p.id] = Math.max(0, (D.inventario[p.id] ?? 0) - n);
  registrarMov(p.id, p.name, -n, 'Ajuste de pérdida');
  await guardarCatalogo();
  await escribir(STORAGE_KEY_MOVIMIENTOS, D.movimientos);
  renderCatalogo(); renderMovimientos();
  toast(`Pérdida registrada: ${n} × ${p.name}`, 'warning');
}

function registrarMov(productId, productName, delta, motivo) {
  D.movimientos.push({
    id: uid('mov'),
    fecha: new Date().toISOString(),
    productId, productName,
    tipo: delta > 0 ? 'entrada' : 'salida',
    cantidad: Math.abs(delta),
    motivo,
    usuarioNombre: D.usuario ? D.usuario.nombre : 'admin'
  });
}

/* ---------- proveedores ---------- */
function saldoProv(id) {
  return D.cxp.filter(m => m.proveedorId === id)
    .reduce((a, m) => a + (m.tipo === 'factura' ? m.monto : -m.monto), 0);
}
async function guardarProv() {
  await escribir(STORAGE_KEY_PROVEEDORES, { proveedores: D.proveedores, contadorProveedores: D.contadorProveedores });
}
async function guardarCxp() { await escribir(STORAGE_KEY_CXP, D.cxp); }

function renderProveedores() {
  const cont = document.getElementById('listaProv');
  if (D.proveedores.length === 0) {
    cont.innerHTML = `<div class="text-muted small py-2">Sin proveedores todavía.</div>`;
    return;
  }
  cont.innerHTML = [...D.proveedores].sort((a, b) => saldoProv(b.id) - saldoProv(a.id)).map(p => {
    const s = saldoProv(p.id);
    const txt = s > 0 ? formatMoney(s) + ' por pagar' : s < 0 ? formatMoney(-s) + ' a favor' : 'Al día';
    return `
      <div class="border rounded-3 p-2 mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <div class="fw-bold"><i class="bi bi-truck me-1 text-primary"></i>${p.nombre}</div>
          <div class="small ${s > 0 ? 'text-danger' : s < 0 ? 'text-success' : 'text-muted'} fw-bold">${txt}</div>
        </div>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-danger" onclick="provFactura(${p.id})"><i class="bi bi-receipt"></i> Factura</button>
          <button class="btn btn-sm btn-outline-success" onclick="provPago(${p.id})"><i class="bi bi-cash-coin"></i> Pago</button>
          <button class="btn btn-sm btn-outline-danger" onclick="provBorrar(${p.id})"><i class="bi bi-trash3"></i></button>
        </div>
      </div>`;
  }).join('');
}

async function provNuevo() {
  const nombre = document.getElementById('nvProvNombre').value.trim();
  if (!nombre) { alert('Poné el nombre del proveedor.'); return; }
  D.contadorProveedores++;
  D.proveedores.push({ id: D.contadorProveedores, nombre, telefono: document.getElementById('nvProvTel').value.trim() });
  await guardarProv();
  document.getElementById('nvProvNombre').value = '';
  document.getElementById('nvProvTel').value = '';
  renderProveedores(); toast(`Proveedor "${nombre}" agregado`);
}
async function provBorrar(id) {
  const p = D.proveedores.find(x => x.id === id);
  if (!p || !confirm(`¿Eliminar "${p.nombre}" y su historial de cuentas por pagar?`)) return;
  D.proveedores = D.proveedores.filter(x => x.id !== id);
  D.cxp = D.cxp.filter(m => m.proveedorId !== id);
  await guardarProv(); await guardarCxp();
  renderProveedores(); renderKPIs();
}
function movCxp(proveedorId, tipo, monto, concepto) {
  D.cxp.push({ id: uid('cxp'), fecha: new Date().toISOString(), proveedorId, tipo, monto: Math.abs(monto), concepto, usuarioNombre: D.usuario ? D.usuario.nombre : 'admin' });
}
async function provFactura(id) {
  const m = parseFloat(String(prompt('Monto de la factura / compra (COP):', '')).replace(/[^\d.-]/g, ''));
  if (isNaN(m) || m <= 0) return;
  movCxp(id, 'factura', m, 'Factura de compra');
  await guardarCxp(); renderProveedores(); renderKPIs(); toast('Factura registrada');
}
async function provPago(id) {
  const m = parseFloat(String(prompt('Monto del pago al proveedor (COP):', '')).replace(/[^\d.-]/g, ''));
  if (isNaN(m) || m <= 0) return;
  movCxp(id, 'pago', m, 'Pago a proveedor');
  await guardarCxp(); renderProveedores(); renderKPIs(); toast('Pago registrado');
}

/* ---------- gráficos ---------- */
function ultimos7Dias() {
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    dias.push({ ini: d.getTime(), fin: d.getTime() + 86400000, label: d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit' }), total: 0 });
  }
  D.ventas.forEach(v => {
    const t = new Date(v.fecha).getTime();
    const dia = dias.find(x => t >= x.ini && t < x.fin);
    if (dia) dia.total += v.total || 0;
  });
  return dias;
}
function renderGraficoSemana() {
  if (typeof Chart === 'undefined') return;
  const dias = ultimos7Dias();
  const ctx = document.getElementById('chartSemana');
  if (chartSemana) chartSemana.destroy();
  chartSemana = new Chart(ctx, {
    type: 'bar',
    data: { labels: dias.map(d => d.label), datasets: [{ label: 'Ventas', data: dias.map(d => d.total), backgroundColor: '#0d6efd' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => formatMoney(v) } } } }
  });
}
function renderGraficoCategoria() {
  if (typeof Chart === 'undefined') return;
  const porCat = {};
  D.ventas.forEach(v => (v.productos || []).forEach(p => {
    let cid = p.categoryId;
    if (!cid) {
      const prod = D.catalogo.find(x => x.id === p.productId) || dbJSON.products.find(x => x.name === p.nombre);
      cid = prod ? prod.categoryId : 'cat-otros';
    }
    porCat[cid] = (porCat[cid] || 0) + (p.cant * p.precio);
  }));
  const labels = Object.keys(porCat);
  const ctx = document.getElementById('chartCategoria');
  if (chartCategoria) chartCategoria.destroy();
  chartCategoria = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.map(nombreCategoria),
      datasets: [{ data: labels.map(l => porCat[l]), backgroundColor: ['#0d6efd', '#198754', '#fd7e14', '#d63384', '#6f42c1', '#0dcaf0', '#ffc107', '#20c997'] }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.label + ': ' + formatMoney(c.parsed) } } } }
  });
}

/* ---------- toast simple ---------- */
function toast(msg, tipo) {
  const el = document.getElementById('dashToast');
  el.className = 'toast align-items-center text-white border-0 show bg-' + (tipo || 'success');
  el.querySelector('.toast-body').textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
