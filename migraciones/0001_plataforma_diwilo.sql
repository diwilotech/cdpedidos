-- ===========================================================================
--  0001_plataforma_diwilo.sql — Suscripciones manejadas desde Diwilo Web
-- ---------------------------------------------------------------------------
--  Correr UNA vez sobre la base que ya existía:
--    npx wrangler d1 execute cdpedidos-db --file=migraciones/0001_plataforma_diwilo.sql --remote
--
--  · Agrega organizations.pagado_hasta ('YYYY-MM-DD'; NULL = sin límite).
--  · Lo calcula con lo que había: la fecha más lejana entre el fin de la
--    prueba, el desbloqueo manual y el último día del último mes pagado.
--  · El negocio del super-admin queda sin límite (NULL), como antes (exento).
--  · Las tablas viejas (suscripcion_pagos, plataforma_config) y las columnas
--    gracia_hasta / bloqueo_manual_hasta / es_super quedan como historial;
--    el Worker ya no las usa.
-- ===========================================================================

ALTER TABLE organizations ADD COLUMN pagado_hasta TEXT;

UPDATE organizations SET pagado_hasta = MAX(
  COALESCE(date(gracia_hasta / 1000, 'unixepoch'), '1970-01-01'),
  COALESCE(date(bloqueo_manual_hasta / 1000, 'unixepoch'), '1970-01-01'),
  COALESCE((SELECT MAX(date(printf('%04d-%02d-01', p.anio, p.mes), '+1 month', '-1 day'))
              FROM suscripcion_pagos p WHERE p.org_id = organizations.id), '1970-01-01')
);

UPDATE organizations SET pagado_hasta = NULL
 WHERE id IN (SELECT org_id FROM users WHERE es_super = 1);
