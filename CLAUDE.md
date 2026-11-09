# CD Pedidos — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
App `cdpedidos` (cdpedidos.diwilo.com) para restaurantes, bares y mostrador: punto de venta con plano de mesas, inventario, clientes por cobrar, proveedores, descuentos y dashboard. Cloudflare Worker + D1 `cdpedidos-db`; el estado vive en bloques JSON (`bloques`) y unas pocas tablas. Ver README.md para el detalle de Pedidos.

## Arquitectura común de las apps Diwilo (capa `src/shell/`)
Pedidos conserva su modelo (usuarios por negocio `users.org_id`, rol `admin` = propietario / `personal`, sesión `cdp_sesion`, API `/api/*`) y le suma una capa que lo envuelve sin tocar sus rutas:
- `src/shell/index.js` (`shellFetch`, se llama primero en `src/worker.js`): `/api/me` (respuesta compatible con el front de Pedidos: `user.nombre/rol/negocio`, `suscripcion`), `/api/settings/*` (tema y logo), `/api/ia/*` (conexiones MCP), módulos centrales (`/api/<modulo>/…`, `/staff/<modulo>`, `/m/*`, `/chat`, `/wa`, `/l`, `/c`, `/validar`), `/mcp`, `/api/auth/logout|password` (van a `/api/logout|password`) y el panel común en `/panel`.
- `src/shell/lib/auth.js` adapta la sesión de Pedidos a lo que esperan los módulos comunes (`authenticate(c, 'tenant:<modulo>')`, rol owner/staff, `users.modulos`, solo lectura por `pagado_hasta`). Las tablas `organizations` hacen de «negocio» (`slug` se crea la primera vez que hace falta).
- `modulos.app.json`: módulos propios `ventas` (el punto de venta de siempre) y `tablero` (dashboard, solo propietario) y centrales (`finanzas`, `marketing`, `nomina`, `whatsapp`, `marca`, `ai`, `dashboard`=Inicio) de Diwilo Modulos por binding `MODULOS`.
- Panel: el **propietario** que entra a `/` va a `/panel` (shell común: menú + marco); el **personal** sigue en el punto de venta (`/`). `/staff/ventas` y `/staff/tablero` sirven `index.html` / `dashboard.html` con `<base href="/">` dentro del marco. Los archivos del shell están en `public/shell/` (no en `/js`, que es del punto de venta). Inicio: `public/staff/index.html` + `public/shell/inicio.js`.
- IA: `src/shell/ia/index.js` (herramientas de lectura `ventas.*` sobre los bloques JSON). Cobrar y editar se hace desde la app.
- Contrato con Diwilo (NO tocar): `src/platform-rpc.js`, `src/platform-tools.js`, `export class Platform`, `pagado_hasta`, invitación por `/?registro=<token>`.

## Base de datos
Las migraciones se aplican a mano. **Antes de publicar** esta versión: `npx wrangler d1 execute cdpedidos-db --file=migraciones/0003_modulos_comunes.sql --remote`. `schema.sql` ya incluye lo nuevo para bases nuevas.

## Pruebas
- `npm run db:migrate:local && npm test` → «Todo bien» (levanta la app + Diwilo Modulos de la carpeta hermana; wrangler ≥ 4.151). `node scripts/ui-check.mjs` recorre el panel en Chrome (CHROME=…).
- Si dan 500 en `/m/*`: wrangler viejo o `pkill -f workerd`.

## Reglas
- Toda consulta filtra por `org_id` de la sesión. Vencida = solo lectura. Publicar Diwilo Modulos antes que esta app.
