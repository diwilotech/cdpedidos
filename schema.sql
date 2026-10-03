-- ===========================================================================
--  schema.sql — Base D1 "cdpedidos-db"  ·  multi-restaurante
-- ---------------------------------------------------------------------------
--  Aplicar:
--    npx wrangler d1 execute cdpedidos-db --file=schema.sql            (LOCAL)
--    npx wrangler d1 execute cdpedidos-db --file=schema.sql --remote   (NUBE)
--
--  Idempotente (IF NOT EXISTS). Para EMPEZAR LIMPIO, correr antes reset.sql
--  (borra todas las tablas), luego este archivo.
--
--  Modelo: un solo negocio = una fila en `organizations`. Toda la data lleva
--  `org_id`; el Worker lo toma de la sesión y NUNCA lo acepta del cliente.
--  Los negocios y sus suscripciones se crean desde Diwilo Web (/api/platform).
--  Base que ya existía antes de eso: correr migraciones/0001_plataforma_diwilo.sql
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
--  NEGOCIOS (restaurantes / tenants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                   TEXT PRIMARY KEY,   -- uuid
  nombre               TEXT NOT NULL,      -- nombre del restaurante
  creado_en            INTEGER NOT NULL,
  pagado_hasta         TEXT                -- 'YYYY-MM-DD' inclusive, lo fija Diwilo Web; NULL = sin límite.
                                           -- Vencido -> la app queda en solo lectura (402 en escrituras)
);

-- ---------------------------------------------------------------------------
--  USUARIOS y SESIONES
--  · Cada usuario pertenece a UN negocio (org_id).
--  · rol: 'admin' (dueño, lo invita Diwilo Web) | 'personal'
--  · estado: 'pendiente' (invitado, sin contraseña) | 'activo' | 'inactivo'
--  · la contraseña se guarda hasheada (PBKDF2-SHA256) con salt por usuario en
--    pin_hash/pin_salt (nombre histórico: antes era un PIN); nunca en claro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,            -- uuid
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,        -- login global (una persona = un negocio)
  nombre          TEXT NOT NULL,
  rol             TEXT NOT NULL DEFAULT 'personal',
  pin_hash        TEXT,                        -- contraseña; NULL hasta que la persona se registra
  pin_salt        TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente',
  invite_token    TEXT,                        -- link para crear/restablecer la contraseña; se borra al usarlo
  fallos          INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER,
  creado_en       INTEGER NOT NULL,
  registrado_en   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_org    ON users (org_id);
CREATE INDEX IF NOT EXISTS idx_users_invite ON users (invite_token);

CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,                  -- token aleatorio opaco (cookie HttpOnly)
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creado_en INTEGER NOT NULL,
  expira_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- ---------------------------------------------------------------------------
--  BLOQUES JSON por negocio (reemplaza la vieja tabla `estado`).
--  Guardan lo que NO se consulta por SQL: geometría del plano (pisos, mesas,
--  posiciones, colores, comandas abiertas) y configuración.
--  El resto de dominios (ventas, clientes, proveedores, inventario, caja) van
--  a tablas relacionales — ver Fase 3.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bloques (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clave  TEXT NOT NULL,                        -- ej. "plano-restaurante-estado-v3"
  valor  TEXT NOT NULL,                        -- JSON serializado
  ts     INTEGER NOT NULL,                     -- Date.now() de la última escritura
  PRIMARY KEY (org_id, clave)
);

-- ===========================================================================
--  FASE 3 — Tablas relacionales por dominio (para reportes/saldos/filtros).
--  Todas llevan org_id; el Worker lo inyecta desde la sesión.
-- ===========================================================================

-- ---- Dominio: clientes + cuentas por cobrar (fiados) ----
CREATE TABLE IF NOT EXISTS clientes (
  id          TEXT PRIMARY KEY,               -- uuid
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  telefono    TEXT,
  descripcion TEXT,
  creado_en   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clientes_org ON clientes (org_id);

CREATE TABLE IF NOT EXISTS mov_fiado (
  id             TEXT PRIMARY KEY,             -- uuid
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cliente_id     TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha          TEXT NOT NULL,                -- ISO 8601
  tipo           TEXT NOT NULL,                -- 'cargo' | 'abono'
  monto          INTEGER NOT NULL,            -- COP sin decimales
  concepto       TEXT,
  venta_id       TEXT,                         -- liga un cargo con su venta (dominio 4)
  usuario_id     TEXT,
  usuario_nombre TEXT,
  creado_en      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movfiado_org_cli   ON mov_fiado (org_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_movfiado_org_venta ON mov_fiado (org_id, venta_id);

-- ---- Códigos de descuento (los gestiona el admin desde el Dashboard) ----
CREATE TABLE IF NOT EXISTS codigos_descuento (
  id          TEXT PRIMARY KEY,               -- uuid
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL,                  -- lo escribe el mesero al cobrar; se guarda en mayúsculas
  tipo        TEXT NOT NULL DEFAULT 'porcentaje', -- 'porcentaje' (0-100) | 'monto' (COP fijo)
  valor       INTEGER NOT NULL,
  activo      INTEGER NOT NULL DEFAULT 1,
  descripcion TEXT,
  creado_en   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_descuentos_org ON codigos_descuento (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_descuentos_org_codigo ON codigos_descuento (org_id, codigo);
