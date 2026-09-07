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
