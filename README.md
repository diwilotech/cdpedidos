# Control de Pedidos (`cdpedidos`)

Sistema para **restaurantes, bares y negocios de mostrador** con:

- **Multiusuario / personal** — cada caja opera con su usuario activo; las ventas se imputan a esa persona.
- **Ventas** — plano interactivo de mesas/zonas por pisos, cuentas y comandas por mesa, liquidación y reporte por usuario.
- **Inventario** — stock por producto, baja automática al vender, reposición y **historial de entradas/salidas**.
- **Fiados a clientes** — cuentas por cobrar: cargos, abonos, saldo por cliente y "cargar una cuenta directo al fiado".
- **Cuentas por pagar a proveedores** — facturas, pagos y saldo por proveedor.

## Arquitectura

**Jamstack desacoplada, servida por un Cloudflare Worker.**

| Capa | Hoy | Mañana |
|------|-----|--------|
| **Frontend** | SPA estática en `public/`: HTML + CSS (Bootstrap 5 + Icons) + JavaScript puro (Vanilla JS). Render 100% en cliente. | igual |
| **Hosting / Backend** | Cloudflare Worker (`src/worker.js`) + Static Assets. Sirve `public/` y expone rutas dinámicas (`/api/*`). | igual Worker, con más rutas |
| **Persistencia** | `window.storage` → `localStorage` del dispositivo (`public/js/core/storage.js`). | Worker + **KV** o **D1**: el Worker responde `/api/estado` y `storage.js` lo llama en vez de `localStorage` → datos compartidos entre dispositivos |

La regla clave: **ningún módulo habla con el almacenamiento directamente**.
Todo pasa por `public/js/data/repositories.js`, que usa la API asíncrona de
`window.storage` (`get` / `set` / `remove`). Cambiar de `localStorage` a un
backend real **no obliga a tocar los módulos**, solo `storage.js`.

## Estructura de carpetas

```
cdpedidos/
├── public/                     ← ÚNICO contenido publicado (assets.directory)
│   ├── index.html              Marcado + carga ordenada de scripts
│   ├── 404.html                Página "no encontrado"
│   ├── assets/css/styles.css   Estilos propios
│   └── js/
│       ├── core/
│       │   ├── storage.js      window.storage: adaptador de persistencia
│       │   ├── config.js       APP_CONFIG, claves de almacenamiento, límites
│       │   ├── format.js       Helpers puros: moneda (COP), fecha, color
│       │   ├── state.js        Estado en memoria + modales Bootstrap
│       │   └── ui-dialogs.js   pedirTexto / pedirConfirmacion / toast
│       ├── data/
│       │   ├── seed.js         dbJSON: categorías, productos y plano de ejemplo
│       │   └── repositories.js Única capa que toca window.storage
│       ├── modules/
│       │   ├── plano.js        Pisos, GridStack, zoom, edición, mesas, sidebar
│       │   ├── cuentas.js      Cuentas/comandas por mesa, liquidación
│       │   ├── catalogo.js     Catálogo de productos
│       │   ├── inventario.js   Stock, movimientos, modal de inventario
│       │   ├── usuarios.js     Personal + usuario activo del dispositivo
│       │   ├── ventas.js       Registro de ventas + reporte por usuario
│       │   ├── clientes-fiados.js  Clientes + fiados (cuentas por cobrar)
│       │   └── proveedores-cxp.js  Proveedores + cuentas por pagar
│       └── app.js              Arranque: hidrata estado y monta el plano
├── src/
│   └── worker.js               Cloudflare Worker: rutas /api/* + fallback a assets
├── wrangler.jsonc              Config del Worker (assets.directory = ./public)
├── package.json                wrangler (devDependency) + scripts
├── .gitignore
└── README.md
```

### Sobre el "split" de JS

Los scripts se cargan como **scripts clásicos** (no ES modules) en orden de
dependencia dentro de `public/index.html`. Comparten un único ámbito global,
así que los `onclick="..."` del HTML funcionan sin cambios. Ver el bloque
comentado al final de `index.html` para el orden exacto.

## Cómo ejecutar

**Rápido, sin nada instalado:** abrir `public/index.html` en el navegador
(doble clic). Funciona en `file://`; los datos van al `localStorage`.

**Con el Worker (como en producción):**

```bash
npm install                 # trae wrangler (dev dependency)
npx wrangler login          # autoriza tu cuenta Cloudflare (una vez)
npx wrangler dev            # http://localhost:8787  — recarga en caliente
#   /            -> la app (public/index.html)
#   /api/health  -> JSON generado por src/worker.js
```

**Publicar:**

```bash
npx wrangler deploy         # -> https://cdpedidos.<tu-subdominio>.workers.dev
```

O automático: cada `git push` a `main` dispara un build en
**Workers & Pages → cdpedidos** (deploy command: `npx wrangler deploy`).

### Empezar de cero (borrar datos locales)

Consola del navegador:

```js
Object.keys(localStorage)
  .filter(k => k.startsWith('cdp:') || k.startsWith('plano-restaurante-'))
  .forEach(k => localStorage.removeItem(k));
```

## Próximos pasos sugeridos

- **Datos compartidos entre dispositivos:** crear un KV namespace (o D1),
  agregarlo como binding en `wrangler.jsonc`, responder `GET/POST /api/estado`
  en `src/worker.js` y apuntar `storage.js` a esa API.
- Autenticación real de usuarios (hoy el "usuario activo" es solo local).
- Rol/permisos por usuario (mesero vs. administrador).
- Cierre de caja diario y arqueo.
- Vincular reposición de inventario con una factura de proveedor.
