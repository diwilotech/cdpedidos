# Control de Pedidos

Sistema para **restaurantes, bares y negocios de mostrador** con:

- **Multiusuario / personal** — cada caja opera con su usuario activo; las ventas se imputan a esa persona.
- **Ventas** — plano interactivo de mesas/zonas por pisos, cuentas y comandas por mesa, liquidación y reporte por usuario.
- **Inventario** — stock por producto, baja automática al vender, reposición y **historial de entradas/salidas**.
- **Fiados a clientes** — cuentas por cobrar: cargos, abonos, saldo por cliente y "cargar una cuenta directo al fiado".
- **Cuentas por pagar a proveedores** — facturas, pagos y saldo por proveedor.

## Arquitectura

**Full-Stack Jamstack / Serverless — desacoplada.**

| Capa | Hoy | Mañana |
|------|-----|--------|
| **Frontend** | SPA estática: HTML + CSS (Bootstrap 5 + Bootstrap Icons) + JavaScript puro (Vanilla JS). Renderizado 100% en cliente. | igual |
| **Persistencia** | `window.storage` → `localStorage` (base de datos "de muestra", ver `js/core/storage.js`). Datos semilla en `js/data/seed.js`. | BaaS (Supabase / Firebase / Cloudflare) — **se cambia solo `js/core/storage.js`** |
| **Backend** | *(no hay)* | Funciones serverless en `api/` para lógica que no debe vivir en el cliente |

La regla clave: **ningún módulo habla con el almacenamiento directamente**.
Todo pasa por los repositorios (`js/data/repositories.js`), que a su vez
usan la API asíncrona de `window.storage` (`get` / `set` / `remove`).
Migrar a un backend real **no obliga a tocar los módulos**.

## Estructura de carpetas

```
Control de Pedidos/
├── index.html                  Marcado + carga ordenada de scripts
├── README.md
├── assets/
│   ├── css/styles.css          Estilos propios (extraídos del <style> embebido)
│   └── img/
├── js/
│   ├── core/
│   │   ├── storage.js          window.storage: adaptador de persistencia (BaaS-ready)
│   │   ├── config.js           APP_CONFIG, claves de almacenamiento, límites
│   │   ├── format.js           Helpers puros: moneda (COP), fecha, color
│   │   ├── state.js            Estado en memoria + instancias de modales Bootstrap
│   │   └── ui-dialogs.js       pedirTexto / pedirConfirmacion / pedirColor / toast
│   ├── data/
│   │   ├── seed.js             dbJSON: categorías, productos y plano de ejemplo
│   │   └── repositories.js     Única capa que toca window.storage (guardar*/cargar*)
│   ├── modules/
│   │   ├── plano.js            Pisos, GridStack, zoom, edición, mesas, sidebar
│   │   ├── cuentas.js          Cuentas/comandas por mesa, liquidación
│   │   ├── catalogo.js         Catálogo de productos para agregar a la cuenta
│   │   ├── inventario.js       Stock, movimientos, modal de inventario
│   │   ├── usuarios.js         Personal + usuario activo del dispositivo
│   │   ├── ventas.js           Registro de ventas + reporte por usuario
│   │   ├── clientes-fiados.js  Clientes + fiados (cuentas por cobrar)
│   │   └── proveedores-cxp.js  Proveedores + cuentas por pagar
│   └── app.js                  Arranque: hidrata estado y monta el plano
├── api/                        Funciones serverless (PLANTILLA, aún no conectadas)
│   ├── README.md
│   └── estado.js
└── index.html.bak              Copia del archivo monolítico original (respaldo)
```

### Sobre el "split" de JS

Los scripts se cargan como **scripts clásicos** (no ES modules) en orden de
dependencia dentro de `index.html`. Comparten un único ámbito global, por lo
que los `onclick="..."` del HTML siguen funcionando sin cambios y **no hace
falta servidor** para abrir el proyecto. Ver el bloque comentado al final de
`index.html` para el orden exacto.

## Cómo ejecutar

- **Directo:** abrir `index.html` en el navegador (doble clic). Funciona en `file://`.
- **Con servidor estático (recomendado para desarrollo):**
  ```bash
  npx serve .    # o:  python3 -m http.server
  ```

Los datos quedan en el `localStorage` del navegador. Para empezar de cero:
consola del navegador → `Object.keys(localStorage).filter(k=>k.startsWith('cdp:')).forEach(k=>localStorage.removeItem(k))`
(y las claves `plano-restaurante-*`).

## Próximos pasos sugeridos

- Conectar Supabase siguiendo `api/README.md`.
- Autenticación real de usuarios (hoy el "usuario activo" es solo local).
- Rol/permisos por usuario (mesero vs. administrador).
- Cierre de caja diario y arqueo.
- Vincular reposición de inventario con una factura de proveedor (cuenta por pagar).
