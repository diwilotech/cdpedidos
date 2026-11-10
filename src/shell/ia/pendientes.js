// Pendientes del punto de venta para la IA proactiva (botón «IA Diwilo» → «Lo de hoy»). Los pide el módulo central de IA por
// ctx.propias.pendientes() (src/shell/lib/central.js). Sin IA: usa las mismas herramientas de lectura del MCP (`usar` respeta módulo activo y rol).
// Cada uno: { id, nivel: mala|aviso|info, icono, texto, ruta, pregunta } — `pregunta` es lo que la persona le pediría a la IA para atenderlo.
const peso = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export async function pendientesDe(usar) {
  const [stock, hoy] = await Promise.all([usar('ventas.stock_bajo'), usar('ventas.resumen_en_vivo')]);
  const out = [], bajos = stock?.productos || [];
  // 30 es el tope de la lista: si llega llena, el negocio no lleva inventario por producto y avisar sería ruido
  if (bajos.length && bajos.length < 30) out.push({ id: 'cp-stock', nivel: bajos.some((p) => p.stock <= 0) ? 'mala' : 'aviso', icono: 'bi-box-seam', texto: `${pl(bajos.length, 'producto con poco inventario', 'productos con poco inventario')}: ${bajos.slice(0, 2).map((p) => `${p.producto} (${p.stock})`).join(', ')}`, ruta: '/staff/ventas.html', pregunta: '¿Qué debo pedirle a los proveedores?' });
  if (hoy?.por_cobrar_hoy > 0) out.push({ id: 'cp-fiado', nivel: 'aviso', icono: 'bi-cash-coin', texto: `${peso(hoy.por_cobrar_hoy)} vendidos hoy quedaron por cobrar`, ruta: '/staff/ventas.html', pregunta: '¿Cómo van las ventas de hoy y qué quedó por cobrar?' });
  else if (hoy?.ventas_hoy > 0) out.push({ id: 'cp-hoy', nivel: 'info', icono: 'bi-receipt', texto: `Hoy van ${pl(hoy.ventas_hoy, 'venta', 'ventas')} por ${peso(hoy.vendido_hoy)}`, ruta: '/staff/ventas.html', pregunta: '¿Cómo van las ventas de hoy frente a la semana?' });
  return out;
}
