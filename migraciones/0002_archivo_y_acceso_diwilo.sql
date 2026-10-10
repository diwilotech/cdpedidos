-- ===========================================================================
--  0002_archivo_y_acceso_diwilo.sql — Archivar negocios y entrar como el dueño desde Diwilo Web
-- ---------------------------------------------------------------------------
--  Correr UNA vez sobre la base que ya existía:
--    npx wrangler d1 execute cdpedidos-db --file=migraciones/0002_archivo_y_acceso_diwilo.sql --remote
--
--  · organizations.archivado_en (ISO): archivado desde Diwilo. Nadie entra; a los 20 días se borra por lotes.
--  · sso_tickets: pases de un solo uso (2 minutos) para entrar como el dueño. Solo se guarda el SHA-256.
-- ===========================================================================

ALTER TABLE organizations ADD COLUMN archivado_en TEXT;

CREATE TABLE IF NOT EXISTS sso_tickets (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
