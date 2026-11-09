// Herramientas de IA de Pedidos (de lectura): leen los bloques JSON del negocio (ventas, catálogo, inventario). El cobro y la edición
// se hacen desde la app. Las de los módulos centrales llegan de Diwilo Modulos (src/shell/lib/central.js → centralTools).
import { db } from '../lib/db.js';

const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const CLAVES = { ventas: 'plano-restaurante-ventas-v1', inventario: 'plano-restaurante-inventario-v1', productos: 'plano-restaurante-productos-v1' };

async function bloque(c, clave, vacio) {
  const r = await db(c.env).first('SELECT valor FROM bloques WHERE org_id = ? AND clave = ?', c.businessId, clave);
  try { return r ? JSON.parse(r.valor) ?? vacio : vacio; } catch { return vacio; }
}
const diaCO = (iso) => new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10);
const hoyCO = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const suma = (l) => l.reduce((t, v) => t + (Number(v.total) || 0), 0);

export const TOOLS = [
  {
    name: 'ventas.resumen_en_vivo', modulo: 'ventas', rol: 'staff', tipo: 'lectura',
    description: 'Resumen en vivo del negocio: lo vendido hoy (cobrado y por cobrar), número de ventas, lo vendido en los últimos 7 días y quién vendió más hoy.',
    inputSchema: S({}),
    run: async (c) => {
      const ventas = await bloque(c, CLAVES.ventas, []);
      const hoy = ventas.filter((v) => diaCO(v.fecha) === hoyCO()), semana = ventas.filter((v) => new Date(v.fecha).getTime() >= Date.now() - 7 * 86400000);
      const porPersona = {};
      hoy.forEach((v) => { const n = v.usuarioNombre || 'Sin asignar'; porPersona[n] = (porPersona[n] || 0) + (Number(v.total) || 0); });
      return { hoy: hoyCO(), ventas_hoy: hoy.length, vendido_hoy: suma(hoy), cobrado_hoy: suma(hoy.filter((v) => !v.clienteId)), por_cobrar_hoy: suma(hoy.filter((v) => v.clienteId)), vendido_7_dias: suma(semana),
        vendio_mas_hoy: Object.entries(porPersona).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nombre, total]) => ({ nombre, total })) };
    },
  },
  {
    name: 'ventas.productos_mas_vendidos', modulo: 'ventas', rol: 'staff', tipo: 'lectura',
    description: 'Los productos que más se venden (unidades y valor) en los últimos días.',
    inputSchema: S({ dias: { type: 'integer', description: 'Cuántos días mirar (por defecto 30)' } }),
    run: async (c, a) => {
      const desde = Date.now() - Math.min(365, Math.max(1, Number(a.dias) || 30)) * 86400000, por = {};
      (await bloque(c, CLAVES.ventas, [])).filter((v) => new Date(v.fecha).getTime() >= desde).forEach((v) => (v.productos || []).forEach((p) => {
        const x = (por[p.productId || p.nombre] ||= { producto: p.nombre, unidades: 0, valor: 0 }); x.unidades += p.cant || 0; x.valor += (p.cant || 0) * (p.precio || 0);
      }));
      return { productos: Object.values(por).sort((x, y) => y.unidades - x.unidades).slice(0, 15) };
    },
  },
  {
    name: 'ventas.stock_bajo', modulo: 'ventas', rol: 'staff', tipo: 'lectura',
    description: 'Productos con 3 unidades o menos en inventario.',
    inputSchema: S({}),
    run: async (c) => {
      const [inv, cat] = await Promise.all([bloque(c, CLAVES.inventario, {}), bloque(c, CLAVES.productos, [])]);
      return { productos: cat.filter((p) => (inv[p.id] ?? p.stock ?? 0) <= 3).map((p) => ({ producto: p.name, stock: inv[p.id] ?? p.stock ?? 0 })).sort((x, y) => x.stock - y.stock).slice(0, 30) };
    },
  },
];
