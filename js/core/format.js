/* ============================================================================
   js/core/format.js — Helpers de formato (moneda, fecha, color)
   Funciones puras, sin estado. Reutilizadas por todos los módulos.
   ========================================================================== */

// Formato de moneda tipo peso colombiano: sin decimales y con puntos
// como separador de miles (ej. $15.000). Se usa Intl para que el
// separador y el símbolo salgan siempre correctos.
const formatoCOP = new Intl.NumberFormat(APP_CONFIG.moneda.locale, {
  style: 'currency',
  currency: APP_CONFIG.moneda.currency,
  maximumFractionDigits: 0
});
const formatMoney = (val) => formatoCOP.format(Number(val) || 0);

// Versión compacta para espacios muy chicos, como el total dentro del
// círculo de cada persona en la mesa (ej. $15.000 -> $15k).
const formatMoneyCorto = (val) => {
  const num = Number(val) || 0;
  if (num >= 1000) {
    return '$' + Math.round(num / 1000) + 'k';
  }
  return '$' + Math.round(num);
};

function formatFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function hexToRgba(hex, opacity = 0.8) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(char => char + char).join('');
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${opacity})`;
}
