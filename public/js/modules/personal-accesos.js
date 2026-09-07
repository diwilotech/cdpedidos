/* ============================================================================
   js/modules/personal-accesos.js — Gestión de accesos del personal (solo admin)
   ----------------------------------------------------------------------------
   Modal donde el administrador:
     · agrega personal por correo -> se genera un LINK de invitación
     · comparte ese link (WhatsApp, etc.); la persona abre el link, elige su
       PIN y queda registrada
     · ve el estado de cada uno (pendiente / activo) y puede eliminarlos
   Habla con el Worker: /api/personal (GET, POST, /reenviar, /eliminar).
   ========================================================================== */

const modalPersonalBS = new bootstrap.Modal(document.getElementById('modalPersonal'));

async function apiPersonal(path, opts) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...(opts || {}),
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(data.error || ('Error ' + r.status));
  return data;
}

function abrirModalPersonal() {
  document.getElementById('nuevoPersonalNombre').value = '';
  document.getElementById('nuevoPersonalEmail').value = '';
  document.getElementById('personalInviteBox').classList.add('d-none');
  renderListaPersonal([]);
  document.getElementById('listaPersonal').innerHTML =
    '<div class="text-center text-muted py-4 small">Cargando…</div>';
  modalPersonalBS.show();
  refrescarPersonal();
}

async function refrescarPersonal() {
  try {
    const { personal } = await apiPersonal('/api/personal');
    renderListaPersonal(personal);
  } catch (e) {
    document.getElementById('listaPersonal').innerHTML =
      `<div class="alert alert-danger py-2 small mb-0">${e.message}</div>`;
  }
}

function renderListaPersonal(lista) {
  const cont = document.getElementById('listaPersonal');
  if (!lista || lista.length === 0) {
    cont.innerHTML = '<div class="text-center text-muted py-4 small">Sin personal todavía.</div>';
    return;
  }
  cont.innerHTML = lista.map((p) => {
    const admin = p.rol === 'admin';
    const pendiente = p.estado === 'pendiente';
    return `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 border rounded-3 p-2 mb-2">
        <div>
          <div class="fw-bold">
            <i class="bi ${admin ? 'bi-shield-lock text-primary' : 'bi-person-fill text-secondary'} me-1"></i>${p.nombre}
            ${admin ? '<span class="badge text-bg-primary ms-1">admin</span>' : ''}
            <span class="badge ${pendiente ? 'text-bg-warning' : 'text-bg-success'} ms-1">${p.estado}</span>
          </div>
          <div class="small text-muted font-monospace">${p.email}</div>
          ${p.invite_url ? `
            <div class="input-group input-group-sm mt-1" style="max-width:420px;">
              <input type="text" class="form-control" readonly value="${p.invite_url}">
              <button class="btn btn-outline-secondary" onclick="copiarTexto('${p.invite_url}')" title="Copiar link"><i class="bi bi-clipboard"></i></button>
            </div>` : ''}
        </div>
        <div class="d-flex gap-1">
          ${pendiente ? `<button class="btn btn-sm btn-outline-secondary" onclick="reenviarInvitacion('${p.id}')" title="Generar un link nuevo"><i class="bi bi-arrow-repeat"></i></button>` : ''}
          ${admin ? '' : `<button class="btn btn-sm btn-outline-danger" onclick="eliminarAcceso('${p.id}','${p.nombre.replace(/'/g, "\\'")}')" title="Eliminar acceso"><i class="bi bi-trash3"></i></button>`}
        </div>
      </div>`;
  }).join('');
}

async function crearAccesoPersonal() {
  const nombre = document.getElementById('nuevoPersonalNombre').value.trim();
  const email = document.getElementById('nuevoPersonalEmail').value.trim();
  if (!nombre || !email) {
    mostrarNotificacion('Completá nombre y correo.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  try {
    const { invite_url } = await apiPersonal('/api/personal', {
      method: 'POST',
      body: JSON.stringify({ nombre, email }),
    });
    const box = document.getElementById('personalInviteBox');
    box.classList.remove('d-none');
    document.getElementById('personalInviteInput').value = invite_url;
    document.getElementById('nuevoPersonalNombre').value = '';
    document.getElementById('nuevoPersonalEmail').value = '';
    mostrarNotificacion('Acceso creado. Compartí el link con la persona.', 'success', 'bi-link-45deg');
    refrescarPersonal();
  } catch (e) {
    mostrarNotificacion(e.message, 'danger', 'bi-exclamation-triangle-fill');
  }
}

async function reenviarInvitacion(id) {
  try {
    const { invite_url } = await apiPersonal('/api/personal/reenviar', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    copiarTexto(invite_url);
    mostrarNotificacion('Link nuevo copiado al portapapeles.', 'success', 'bi-clipboard-check');
    refrescarPersonal();
  } catch (e) {
    mostrarNotificacion(e.message, 'danger', 'bi-exclamation-triangle-fill');
  }
}

function eliminarAcceso(id, nombre) {
  pedirConfirmacion(`¿Eliminar el acceso de "${nombre}"?`, async () => {
    try {
      await apiPersonal('/api/personal/eliminar', { method: 'POST', body: JSON.stringify({ id }) });
      mostrarNotificacion('Acceso eliminado.', 'success', 'bi-check-circle-fill');
      refrescarPersonal();
    } catch (e) {
      mostrarNotificacion(e.message, 'danger', 'bi-exclamation-triangle-fill');
    }
  });
}

function copiarTexto(txt) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(
      () => mostrarNotificacion('Copiado.', 'success', 'bi-clipboard-check'),
      () => {}
    );
  }
}
