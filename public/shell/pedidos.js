// Ayudas del Inicio de Pedidos. El panel común (shell) ya trae el menú; aquí solo van los datos propios.
// window.DW_KEEP_APP evita pisar el App común del Dashboard.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
  const bloque = async (clave, vacio) => {
    const r = await fetch(`/api/bloque?key=${encodeURIComponent(clave)}`, { credentials: 'same-origin' });
    if (!r.ok) return vacio;
    try { return JSON.parse((await r.json()).value) ?? vacio; } catch { return vacio; }
  };
  window.Ped = { esc, money, bloque };
})();
