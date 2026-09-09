-- ===========================================================================
--  reset.sql — BORRA TODO. Correr solo para empezar de cero.
--    npx wrangler d1 execute cdpedidos-db --file=reset.sql --remote
--  Después: npx wrangler d1 execute cdpedidos-db --file=schema.sql --remote
-- ===========================================================================
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS estado;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS bloques;
DROP TABLE IF EXISTS organizations;

-- Dominios relacionales (Fase 3) — por si ya existían:
DROP TABLE IF EXISTS venta_items;
DROP TABLE IF EXISTS ventas;
DROP TABLE IF EXISTS comanda_items;
DROP TABLE IF EXISTS comandas;
DROP TABLE IF EXISTS mov_inventario;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS mov_fiado;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS mov_cxp;
DROP TABLE IF EXISTS proveedores;
DROP TABLE IF EXISTS caja_movimientos;
DROP TABLE IF EXISTS caja_turnos;
