-- ===========================================================================
--  0003_modulos_comunes.sql — Base común de las apps de Diwilo para CD Pedidos
-- ---------------------------------------------------------------------------
--  Correr UNA vez sobre la base que ya existía (antes de publicar el Worker):
--    npx wrangler d1 execute cdpedidos-db --file=migraciones/0003_modulos_comunes.sql --remote
--  Solo agrega: no borra ni cambia lo existente.
--  · organizations.slug / logo_key: dirección corta y logo del negocio (chats, tarjetas y links públicos de los módulos centrales)
--  · users.modulos: módulos que puede abrir cada persona del equipo (NULL = los de su rol)
--  · business_settings / business_modules / audit_log / mcp_tokens: tema por negocio, módulos que asigna Diwilo, bitácora y conexiones MCP
-- ===========================================================================
ALTER TABLE organizations ADD COLUMN slug TEXT;
ALTER TABLE organizations ADD COLUMN logo_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug) WHERE slug IS NOT NULL;
ALTER TABLE users ADD COLUMN modulos TEXT;

CREATE TABLE IF NOT EXISTS business_settings (
  business_id  TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  tema         TEXT NOT NULL DEFAULT 'turquesa',
  modo         TEXT NOT NULL DEFAULT 'light',
  logo_key     TEXT,
  updated_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS business_modules (
  business_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  modulo       TEXT NOT NULL,
  activo       INTEGER NOT NULL DEFAULT 1,
  desde        TEXT,
  hasta        TEXT,
  synced_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (business_id, modulo)
);
CREATE TABLE IF NOT EXISTS business_modules_sync (
  business_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      TEXT,
  origen       TEXT NOT NULL DEFAULT 'app',
  modulo       TEXT,
  accion       TEXT NOT NULL,
  detalle      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_log_business ON audit_log (business_id, created_at);
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at  TEXT,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS mcp_tokens_business ON mcp_tokens (business_id);
