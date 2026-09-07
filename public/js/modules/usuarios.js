/* ============================================================================
   js/modules/usuarios.js — Usuarios / Personal (multiusuario)
   ----------------------------------------------------------------------------
   Lista de personal COMPARTIDA por todo el local. El "usuario activo" es
   una preferencia LOCAL de cada dispositivo/caja: es a quién se le imputan
   las ventas hechas desde esa terminal.
   ========================================================================== */

function obtenerNombreUsuarioActivo() {
  if (!usuarioActivoId) return 'Sin asignar';
  const u = usuariosData.find(u => u.id === usuarioActivoId);
  return u ? u.nombre : 'Sin asignar';
}

function actualizarIndicadorUsuarioActivo() {
  const span = document.getElementById('usuarioActivoTexto');
  if (!span) return;
  span.innerText = usuarioActivoId ? obtenerNombreUsuarioActivo() : 'Sin usuario';
}

function abrirModalUsuarios() {
  document.getElementById('nuevoUsuarioNombre').value = '';
  renderListaUsuarios();
  modalUsuariosBS.show();
}

function renderListaUsuarios() {
  const cont = document.getElementById('listaUsuarios');
  cont.innerHTML = '';

  if (usuariosData.length === 0) {
    cont.innerHTML = `<div class="text-center text-muted py-4 small">Todavía no hay usuarios. Agrega el primero arriba.</div>`;
    return;
  }

  usuariosData.forEach(u => {
    const esActivo = u.id === usuarioActivoId;
    const row = document.createElement('div');
    row.className = `d-flex justify-content-between align-items-center border rounded-3 p-2 mb-2 ${esActivo ? 'border-success bg-success-subtle' : ''}`;
    row.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <i class="bi ${esActivo ? 'bi-person-check-fill text-success' : 'bi-person-fill text-secondary'} fs-5"></i>
        <span class="fw-bold">${u.nombre}</span>
        ${esActivo ? '<span class="badge bg-success">Activo</span>' : ''}
      </div>
      <div class="d-flex gap-2">
        ${esActivo ? '' : `<button class="btn btn-sm btn-outline-success" onclick="activarUsuario(${u.id})" title="Usar este usuario en este dispositivo"><i class="bi bi-check-lg"></i></button>`}
        <button class="btn btn-sm btn-outline-secondary" onclick="renombrarUsuario(${u.id})" title="Cambiar nombre"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="eliminarUsuario(${u.id})" title="Eliminar usuario"><i class="bi bi-trash3"></i></button>
      </div>
    `;
    cont.appendChild(row);
  });
}

function agregarUsuario() {
  const input = document.getElementById('nuevoUsuarioNombre');
  const nombre = input.value.trim();
  if (!nombre) {
    mostrarNotificacion('Ponle un nombre al usuario.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  contadorUsuarios++;
  const nuevoUsuario = { id: contadorUsuarios, nombre };
  usuariosData.push(nuevoUsuario);

  // Si es el primer usuario que se crea, se activa automáticamente.
  if (usuariosData.length === 1) {
    usuarioActivoId = nuevoUsuario.id;
    guardarUsuarioActivo();
    actualizarIndicadorUsuarioActivo();
  }

  guardarUsuarios();
  input.value = '';
  renderListaUsuarios();
  mostrarNotificacion(`"${nombre}" se agregó a la lista de usuarios`, 'success', 'bi-person-plus-fill');
}

function activarUsuario(id) {
  usuarioActivoId = id;
  guardarUsuarioActivo();
  actualizarIndicadorUsuarioActivo();
  renderListaUsuarios();
}

function renombrarUsuario(id) {
  const usuario = usuariosData.find(u => u.id === id);
  if (!usuario) return;
  pedirTexto('Nuevo nombre del usuario:', usuario.nombre, (nuevoNombre) => {
    usuario.nombre = nuevoNombre;
    guardarUsuarios();
    renderListaUsuarios();
    actualizarIndicadorUsuarioActivo();
  });
}

function eliminarUsuario(id) {
  pedirConfirmacion('¿Eliminar este usuario? Las ventas ya registradas a su nombre no se modifican.', () => {
    usuariosData = usuariosData.filter(u => u.id !== id);
    if (usuarioActivoId === id) {
      usuarioActivoId = null;
      guardarUsuarioActivo();
      actualizarIndicadorUsuarioActivo();
    }
    guardarUsuarios();
    renderListaUsuarios();
  });
}
