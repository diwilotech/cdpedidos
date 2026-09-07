-- ===========================================================================
--  schema.sql — Tablas de la base D1 "cdpedidos-db"
-- ---------------------------------------------------------------------------
--  Ejecutar:
--    npx wrangler d1 execute cdpedidos-db --file=schema.sql            (LOCAL:  para `wrangler dev`)
--    npx wrangler d1 execute cdpedidos-db --file=schema.sql --remote   (NUBE:   la base de producción)
--
--  Es idempotente (IF NOT EXISTS): se puede correr varias veces sin romper nada.
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  Tabla clave/valor: refleja el modelo actual de window.storage.
--  Cada fila es un "bloque" del negocio guardado como JSON:
--    plano-restaurante-estado-v3, plano-restaurante-inventario-v1,
--    plano-restaurante-ventas-v1, cdp-clientes-v1, cdp-proveedores-v1, ...
--  Con esto, migrar de localStorage al Worker NO obliga a reescribir los
--  repositorios: solo cambia el backend interno de storage.js.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estado (
  clave  TEXT PRIMARY KEY,   -- ej. "plano-restaurante-ventas-v1"
  valor  TEXT NOT NULL,      -- JSON serializado (lo que hoy va a localStorage)
  ts     INTEGER NOT NULL    -- Date.now() de la última escritura
);


-- ---------------------------------------------------------------------------
--  AUTENTICACIÓN: usuarios y sesiones
--  · rol: 'admin' | 'personal'
--  · estado: 'pendiente' (invitado, sin PIN) | 'activo' | 'inactivo'
--  · el PIN se guarda hasheado (PBKDF2-SHA256) con salt por usuario; NUNCA en claro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,           -- uuid
  email           TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  rol             TEXT NOT NULL DEFAULT 'personal',
  pin_hash        TEXT,                        -- NULL hasta que la persona se registra
  pin_salt        TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente',
  invite_token    TEXT,                        -- token del link de invitación; se borra al usarlo
  fallos          INTEGER NOT NULL DEFAULT 0,  -- intentos de login fallidos seguidos
  bloqueado_hasta INTEGER,                     -- epoch ms; bloqueo temporal tras 5 fallos
  creado_en       INTEGER NOT NULL,
  registrado_en   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_invite ON users (invite_token);

CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,                  -- token aleatorio opaco (va en cookie HttpOnly)
  user_id   TEXT NOT NULL,
  creado_en INTEGER NOT NULL,
  expira_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Admin sembrado SIN PIN: se define en el primer arranque desde la pantalla
-- "configurar administrador" (endpoint /api/setup), que solo funciona una vez.
INSERT OR IGNORE INTO users (id, email, nombre, rol, estado, creado_en)
VALUES ('usr-admin', 'yomar006@gmail.com', 'Yomar', 'admin', 'pendiente', 0);


-- ===========================================================================
--  (MÁS ADELANTE) Tablas "de verdad", una por entidad.
--  Sirven para CONSULTAR: reportes por fecha/usuario, saldos, filtros...
--  Descomentar cuando quieras dar ese paso; conviven con la tabla `estado`.
-- ===========================================================================

-- CREATE TABLE IF NOT EXISTS ventas (
--   id             TEXT PRIMARY KEY,
--   fecha          TEXT NOT NULL,          -- ISO 8601
--   mesa_id        TEXT,
--   mesa_nombre    TEXT,
--   cuenta_nombre  TEXT,
--   usuario_id     INTEGER,
--   usuario_nombre TEXT,
--   total          INTEGER NOT NULL,       -- COP sin decimales
--   productos_json TEXT NOT NULL           -- detalle como JSON
-- );
-- CREATE INDEX IF NOT EXISTS idx_ventas_fecha   ON ventas (fecha);
-- CREATE INDEX IF NOT EXISTS idx_ventas_usuario ON ventas (usuario_nombre);

-- CREATE TABLE IF NOT EXISTS clientes (
--   id       INTEGER PRIMARY KEY,
--   nombre   TEXT NOT NULL,
--   telefono TEXT
-- );

-- CREATE TABLE IF NOT EXISTS fiados (
--   id             TEXT PRIMARY KEY,
--   fecha          TEXT NOT NULL,
--   cliente_id     INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
--   tipo           TEXT NOT NULL CHECK (tipo IN ('cargo','abono')),
--   monto          INTEGER NOT NULL,
--   concepto       TEXT,
--   usuario_nombre TEXT
-- );
-- CREATE INDEX IF NOT EXISTS idx_fiados_cliente ON fiados (cliente_id);

-- CREATE TABLE IF NOT EXISTS proveedores (
--   id       INTEGER PRIMARY KEY,
--   nombre   TEXT NOT NULL,
--   telefono TEXT
-- );

-- CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
--   id             TEXT PRIMARY KEY,
--   fecha          TEXT NOT NULL,
--   proveedor_id   INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
--   tipo           TEXT NOT NULL CHECK (tipo IN ('factura','pago')),
--   monto          INTEGER NOT NULL,
--   concepto       TEXT,
--   usuario_nombre TEXT
-- );
-- CREATE INDEX IF NOT EXISTS idx_cxp_proveedor ON cuentas_por_pagar (proveedor_id);
