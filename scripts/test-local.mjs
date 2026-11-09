// Prueba de punta a punta en local: Diwilo (simulado) crea negocios por RPC y se recorre la app con la capa común.
// Uso: npm run db:migrate:local && npm test   (usa Diwilo Modulos de la carpeta hermana para los módulos centrales)
import { startApp, check, failures, diwilo, client, newBusiness, newMember } from './test-helpers.mjs';

await startApp();

try {
  const A = await newBusiness('Restaurante A', { login: true });
  const app = A.app, bid = A.id;
  check('Diwilo crea un negocio por RPC', A.created.status === 201 && A.created.data.invite_path, JSON.stringify(A.created.data).slice(0, 200));
  check('Desde internet /api/platform da 401', (await client()('/api/platform/businesses')).status === 401);
  check('Desde internet /api/platform/modules da 401', (await client()('/api/platform/modules')).status === 401);
  const cat = await diwilo('GET', '/modules');
  check('Diwilo lee el catálogo de módulos', cat.status === 200 && cat.data.modulos?.some((m) => m.id === 'ventas') && cat.data.modulos.some((m) => m.id === 'finanzas'), JSON.stringify(cat.data).slice(0, 200));

  // --- Shell ---
  const me = await app('/api/me');
  check('/api/me trae rol, tema, módulos y lo que lee el front de Pedidos', me.data.role === 'owner' && me.data.settings?.tema && me.data.modules?.some((m) => m.id === 'ventas') && me.data.user?.rol === 'admin' && me.data.suscripcion?.estado === 'ok', JSON.stringify(me.data).slice(0, 300));
  check('Los módulos centrales base aparecen siempre', ['dashboard', 'marca', 'ai'].every((id) => me.data.modules.some((m) => m.id === id)));
  check('/api/me sin sesión da 401', (await client()('/api/me')).status === 401);
  const raiz = await app('/');
  check('El propietario con sesión entra al panel común desde la raíz', raiz.status === 302 && raiz.headers.get('location')?.endsWith('/panel'), String(raiz.status));
  const anon = await client()('/');
  check('Sin sesión la raíz sigue siendo el ingreso/punto de venta', anon.status === 200 && anon.data.text?.includes('<html'));
  const panel = await app('/panel');
  check('/panel con sesión sirve el panel común', panel.status === 200 && panel.data.text?.includes('id="dw-frame"'), String(panel.status));
  check('/panel sin sesión lleva al ingreso', (await client()('/panel')).status === 302);
  check('/staff/ sin sesión redirige al ingreso', (await client()('/staff/')).status === 302);
  const doc = await app('/staff/ventas.html', { headers: { 'sec-fetch-dest': 'document' } });
  check('Una página abierta directo lleva al panel con ?go=', doc.status === 302 && doc.headers.get('location')?.includes('/panel?go='), doc.headers.get('location'));
  const ventas = await app('/staff/ventas', { headers: { 'sec-fetch-dest': 'iframe' } });
  check('/staff/ventas trae el punto de venta con <base href="/">', ventas.status === 200 && ventas.data.text?.includes('<base href="/">'), String(ventas.status));
  const tab = await app('/staff/tablero', { headers: { 'sec-fetch-dest': 'iframe' } });
  check('/staff/tablero trae el tablero', tab.status === 200 && tab.data.text?.includes('<base href="/">'), String(tab.status));
  const ini = await app('/staff/', { headers: { 'sec-fetch-dest': 'iframe' } });
  check('El Inicio trae el shell y la ayuda de Pedidos', ini.data.text?.includes('id="dw-shell"') && ini.data.text.includes('/shell/pedidos.js'));
  for (const m of ['finanzas', 'marketing', 'marca', 'ai', 'whatsapp']) {
    const r = await app(`/staff/${m}`, { headers: { 'sec-fetch-dest': 'iframe' } });
    check(`Página central /staff/${m} sirve`, r.status === 200, String(r.status));
  }
  check('Escritura de la capa común sin encabezado de seguridad se rechaza', (await app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'rojo' }, headers: { 'x-app': '' } })).status === 403);
  const ap = await app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'rojo', modo: 'light' } });
  check('Cambia el tema del negocio', ap.status === 200 && ap.data.tema === 'rojo', JSON.stringify(ap.data));
  const fin = await app('/api/finanzas/summary');
  check('La API de un módulo central responde por la capa común', fin.status < 500, String(fin.status));

  // --- Lo propio de Pedidos sigue funcionando ---
  const w = await app('/api/bloque', { method: 'POST', body: { key: 'plano-restaurante-ventas-v1', value: JSON.stringify([{ fecha: new Date().toISOString(), total: 25000, usuarioNombre: 'Propietario', productos: [{ nombre: 'Cerveza', cant: 2, precio: 12500 }] }]) } });
  check('Guarda un bloque (ventas) como siempre', w.status === 204 || w.status === 200, String(w.status));
  const g = await app('/api/bloque?key=plano-restaurante-ventas-v1');
  check('Lee el bloque', g.status === 200 && g.data.value?.includes('Cerveza'));
  const tok = (await app('/api/ia/tokens', { method: 'POST', body: { name: 'prueba' } })).data.token;
  check('Crea una conexión MCP', typeof tok === 'string' && tok.startsWith('dwm_'), String(tok));
  const { mcp } = await import('./test-helpers.mjs');
  const lst = await mcp(tok, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  check('El MCP lista las herramientas de Pedidos', lst.data.result?.tools?.some((t) => t.name === 'ventas_resumen_en_vivo'), JSON.stringify(lst.data).slice(0, 200));
  const call = await mcp(tok, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ventas.resumen_en_vivo', arguments: {} } });
  check('La herramienta de IA lee las ventas del día', JSON.stringify(call.data).includes('25000'), JSON.stringify(call.data).slice(0, 250));
  const logout = await app('/api/auth/logout', { method: 'POST' });
  check('Salir desde el panel común cierra la sesión', logout.status === 200 && (await app('/api/me')).status === 401, String(logout.status));

  // --- Módulos por plan y por persona ---
  const B = await newBusiness('Restaurante B', { login: true });
  const off = await diwilo('PUT', `/businesses/${B.id}/modules`, { modules: [{ modulo: 'finanzas', activo: true }], version: 'v1' });
  check('Diwilo asigna módulos al negocio', off.status === 200, JSON.stringify(off.data).slice(0, 200));
  const meB = await B.app('/api/me');
  check('Con Ventas fuera del plan no aparece en el menú', !meB.data.modules.some((m) => m.id === 'ventas') && meB.data.modules.some((m) => m.id === 'finanzas'), meB.data.modules?.map((m) => m.id).join(','));
  const C = await newBusiness('Restaurante C', { login: true });
  const ST = await newMember(C.app);
  const meS = await ST.app('/api/me');
  check('El personal ve Ventas y no ve Finanzas por defecto', meS.data.role === 'staff' && meS.data.modules.some((m) => m.id === 'ventas') && !meS.data.modules.some((m) => m.id === 'finanzas'));
  check('El personal no entra al tablero (solo propietario)', !meS.data.modules.some((m) => m.id === 'tablero'));
  const rs = await ST.app('/');
  check('El personal sigue entrando al punto de venta (raíz)', rs.status === 200, String(rs.status));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
console.log(failures() ? `\n✗ ${failures()} falla(s)` : '\nTodo bien');
process.exit(failures() ? 1 : 0);
