# Control de Pedidos (`cdpedidos`)

Sistema para **restaurantes, bares y negocios de mostrador** con:

- **Acceso multiusuario** — un **único login** por correo + PIN para todos (admin y personal). El admin agrega al personal por correo y cada uno se auto-registra con un link de invitación. Todo lo que hace cada persona (ventas, inventario, fiados, proveedores, mesas) queda **registrado a su nombre**; el operador de cada sesión es quien inició sesión (no hay lista de usuarios "por dispositivo").
- **Ventas** — plano interactivo de mesas/zonas por pisos, cuentas y comandas por mesa, liquidar o **guardar la cuenta para pago después** (a nombre de un cliente).
- **Inventario** — stock por producto, baja automática al vender, reposición e historial.
- **Clientes** — cuentas por cobrar: cargos (consumos), abonos (pagos) y saldo por cliente.
- **Dashboard (solo admin, `/dashboard.html`)** — KPIs del día, ventas del día por personal, movimientos de cada producto (quién vendió / sacó / ajuste de pérdida), gráfico de ventas de la semana y por categoría, edición del **catálogo** (precio/categoría/nombre) y **proveedores / cuentas por pagar**.
- **Instalable (PWA)** — se agrega a la pantalla de inicio en Android e iPhone y funciona offline.

## Arquitectura

**Jamstack desacoplada, servida por un Cloudflare Worker + base D1.**

| Capa | Detalle |
|------|---------|
| **Frontend** | SPA estática en `public/`: HTML + CSS (Bootstrap 5 + Icons) + JavaScript puro (Vanilla JS). Render 100% en cliente. |
| **Worker** | `src/worker.js` — sirve `public/` y expone `/api/*`: autenticación, gestión de personal y `/api/estado` (datos del negocio). |
| **Base de datos** | Cloudflare **D1** (`cdpedidos-db`). Tablas: `users`, `sessions`, `estado` (ver `schema.sql`). |
| **Persistencia del negocio** | `window.storage` → si hay sesión, `POST/GET /api/estado` → tabla `estado` (clave/valor JSON) → **compartido entre todos los dispositivos**. Sin backend (abrir el archivo directo), cae a `localStorage`. |

La regla clave: **ningún módulo habla con el almacenamiento directamente**.
Todo pasa por `public/js/data/repositories.js` → `window.storage` (`get`/`set`/`remove`).
Cambiar el backend **no obliga a tocar los módulos**, solo `public/js/core/storage.js`.

### Autenticación (resumen)

- PIN de 4 a 8 dígitos, guardado **hasheado** (PBKDF2-SHA256 + salt por usuario). Nunca en claro.
- Sesión = token aleatorio en tabla `sessions`, cookie `HttpOnly; Secure; SameSite=Lax` (30 días).
- 5 intentos fallidos → bloqueo temporal de 15 min.
- **Admin sembrado:** `yomar006@gmail.com`, sin PIN. Se define en el primer arranque desde la pantalla *"Primera vez · configurar administrador"* (endpoint `/api/setup`, funciona una sola vez).
- **Alta de personal:** el admin abre *Personal · Accesos* → agrega nombre + correo → obtiene un **link de invitación** (`/?registro=<token>`) → se lo pasa a la persona → esta lo abre en su teléfono, elige su PIN y queda activa.

## Estructura de carpetas

```
cdpedidos/
├── public/                     ← ÚNICO contenido publicado (assets.directory)
│   ├── index.html
│   ├── 404.html
│   ├── manifest.webmanifest    PWA
│   ├── sw.js                   Service Worker (offline + instalación)
│   ├── assets/
│   │   ├── css/styles.css
│   │   └── img/icon.svg        Ícono de la app
│   └── js/
│       ├── core/
│       │   ├── storage.js       window.storage: local (localStorage) | remoto (/api/estado)
│       │   ├── auth-gate.js     Portón: login / setup / registro; luego dispara el arranque
│       │   ├── config.js        APP_CONFIG, claves, límites
│       │   ├── format.js        moneda (COP), fecha, color
│       │   ├── state.js         Estado en memoria + modales Bootstrap
│       │   └── ui-dialogs.js    pedirTexto / pedirConfirmacion / toast
│       ├── data/
│       │   ├── seed.js          dbJSON: datos de ejemplo
│       │   └── repositories.js  Única capa que toca window.storage
│       ├── modules/
│       │   ├── plano.js  cuentas.js  catalogo.js  inventario.js
│       │   ├── ventas.js  clientes-fiados.js  proveedores-cxp.js
│       │   ├── usuarios.js           Operador actual = quien inició sesión (helpers)
│       │   └── personal-accesos.js   Gestión de accesos del personal (solo admin)
│       └── app.js              Define window.__cdpArrancar (NO arranca solo)
├── src/worker.js               Worker: /api/auth, /api/personal, /api/estado + assets
├── schema.sql                  DDL de la base D1 (estado, users, sessions + seed admin)
├── wrangler.jsonc              Config del Worker (assets = ./public, binding DB)
├── package.json                wrangler + scripts
└── README.md
```

## Cómo ejecutar

**Sin instalar nada:** abrir `public/index.html` (doble clic). Modo local con
`localStorage`, **sin login** (no hay Worker). Sirve para probar la UI.

**Con el Worker + D1 (como en producción):**

```bash
npm install                 # trae wrangler
npx wrangler login          # autoriza tu cuenta Cloudflare (una vez)

# crear las tablas en la copia LOCAL que usa wrangler dev:
npx wrangler d1 execute cdpedidos-db --file=schema.sql

npx wrangler dev            # http://localhost:8787
```

**Publicar:** `npx wrangler deploy`, o `git push` a `main` (build automático en
Workers & Pages con deploy command `npx wrangler deploy`).

Cuando cambie `schema.sql`, aplicarlo también a producción:

```bash
npx wrangler d1 execute cdpedidos-db --file=schema.sql --remote
```

### Primer uso

1. Abrí la app publicada → pantalla de login → **"Primera vez · configurar administrador"**.
2. Correo `yomar006@gmail.com` + un PIN → entrás como admin.
3. Botón **Personal** (arriba a la derecha) → agregá al personal por correo → pasales el link.

### Instalar en el teléfono

- **Android/Chrome:** aparece "Instalar app" o Menú ⋮ → *Agregar a pantalla de inicio*.
- **iPhone/Safari:** Compartir → *Agregar a inicio*.

## Próximos pasos sugeridos

- Tablas D1 "de verdad" (`ventas`, `clientes`…) para reportes con SQL (ver bloque comentado en `schema.sql`).
- Cierre de caja diario y arqueo.
- Vincular reposición de inventario con una factura de proveedor.
- Bajar el PIN a hash con más iteraciones / migrar a WebAuthn si hace falta más seguridad.
