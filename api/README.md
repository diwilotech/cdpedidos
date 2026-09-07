# `api/` — Funciones Serverless (todavía NO conectadas)

Esta carpeta es el lugar reservado para el **backend serverless** de la
arquitectura Jamstack. Hoy la app funciona 100% en el cliente con
`localStorage` (ver `js/core/storage.js`), así que **estos archivos no se
usan aún**: son la plantilla para cuando se conecte un BaaS.

## Plan de migración (sin tocar los módulos)

1. Crear proyecto en un BaaS (Supabase recomendado) con tablas equivalentes
   a las claves de `js/core/config.js`:
   `plano_estado`, `inventario`, `productos`, `usuarios`, `ventas`,
   `movimientos_inventario`, `clientes`, `fiados`, `proveedores`,
   `cuentas_por_pagar`.
2. Rellenar `APP_CONFIG.baas` en `js/core/config.js` y poner
   `storageMode: 'remote'`.
3. Reemplazar **solo** el backend interno de `js/core/storage.js` para que
   `get/set/remove` hablen con el BaaS (directo desde el cliente con la
   `anonKey`, o a través de estas funciones `/api/*` si se necesita lógica
   de servidor o esconder credenciales).
4. El resto del proyecto (repositorios y módulos) queda igual: la firma
   `await window.storage.get(key, shared)` no cambia.

## Convención de las funciones

Estilo handler estándar (Vercel / Netlify / Cloudflare Pages Functions):

```
GET  /api/estado?scope=shared&key=plano-restaurante-estado-v3
POST /api/estado   { scope, key, value }
```

- `scope`: `shared` (negocio) | `local` (dispositivo — normalmente NO llega al servidor).
- Autenticación: pendiente (JWT del BaaS / sesión).
