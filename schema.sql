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
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
--  NEGOCIOS (restaurantes / tenants)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                   TEXT PRIMARY KEY,   -- uuid
  nombre               TEXT NOT NULL,      -- nombre del restaurante
  creado_en            INTEGER NOT NULL,
  gracia_hasta         INTEGER,            -- epoch ms; hasta cuándo puede usar sin pagar (signup: +15 días)
  bloqueo_manual_hasta INTEGER             -- epoch ms; si > ahora, el super-admin la mantiene habilitada aunque deba
);

-- ---------------------------------------------------------------------------
--  USUARIOS y SESIONES
--  · Cada usuario pertenece a UN negocio (org_id).
--  · rol: 'admin' (el que crea el negocio + los que él ascienda) | 'personal'
--  · estado: 'pendiente' (invitado, sin PIN) | 'activo' | 'inactivo'
--  · el PIN se guarda hasheado (PBKDF2-SHA256) con salt por usuario; nunca en claro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,            -- uuid
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,        -- login global (una persona = un negocio)
  nombre          TEXT NOT NULL,
  rol             TEXT NOT NULL DEFAULT 'personal',
  es_super        INTEGER NOT NULL DEFAULT 0,  -- 1 = super-admin de la plataforma (ve /admin, cobra)
  pin_hash        TEXT,                        -- NULL hasta que la persona se registra
  pin_salt        TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente',
  invite_token    TEXT,                        -- token del link de invitación; se borra al usarlo
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

-- ---------------------------------------------------------------------------
--  SUSCRIPCIONES (panel /admin del super-admin)
--  · precio mensual global en plataforma_config
--  · un pago por (negocio, año, mes): la FILA existe = ese mes está pagado
--  · negocio "al día" si el mes en curso está pagado, o está en gracia, o el
--    super-admin puso bloqueo_manual_hasta en el futuro. Si no -> SOLO LECTURA.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plataforma_config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
INSERT OR IGNORE INTO plataforma_config (clave, valor) VALUES ('precio_mensual', '0');

CREATE TABLE IF NOT EXISTS suscripcion_pagos (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  anio       INTEGER NOT NULL,
  mes        INTEGER NOT NULL,                 -- 1..12
  monto      INTEGER,                          -- COP cobrado ese mes
  fecha_pago TEXT,                             -- ISO 8601
  nota       TEXT,
  PRIMARY KEY (org_id, anio, mes)
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
