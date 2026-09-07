/* ============================================================================
   js/modules/usuarios.js — Usuario en sesión
   ----------------------------------------------------------------------------
   Ya NO hay una lista local de "usuarios de este dispositivo". Hay un único
   sistema de acceso (js/core/auth-gate.js + Worker): quien inició sesión ES
   el operador, y todo lo que hace (ventas, movimientos de inventario, fiados,
   cuentas por pagar, cambios en las mesas) queda registrado a su nombre.

   El admin gestiona quién puede entrar desde  Personal · Accesos
   (js/modules/personal-accesos.js).
   ========================================================================== */

// Nombre del operador actual. Viene de window.__CDP_USER__ (lo fija auth-gate
// al iniciar sesión). En "modo local" (sin backend / archivo abierto directo)
// no hay sesión -> 'Sin asignar'.
function obtenerNombreUsuarioActivo() {
  return (window.__CDP_USER__ && window.__CDP_USER__.nombre) || 'Sin asignar';
}

function obtenerRolUsuarioActivo() {
  return (window.__CDP_USER__ && window.__CDP_USER__.rol) || null;
}

function esAdminActivo() {
  return obtenerRolUsuarioActivo() === 'admin';
}

// Compat: varios módulos todavía llaman a esto tras cambios de estado.
// El nombre del operador ya se muestra en el "chip" de la barra superior
// (lo pinta auth-gate), así que aquí no hay nada que actualizar.
function actualizarIndicadorUsuarioActivo() {}
