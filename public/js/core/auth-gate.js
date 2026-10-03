/* ============================================================================
   js/core/auth-gate.js — Portón de acceso (login / registro por invitación)
   ----------------------------------------------------------------------------
   Se carga ÚLTIMO. Antes de mostrar la app:
     · si hay backend (Worker): pide GET /api/me
         - con sesión  -> arranca la app en modo REMOTO (datos en D1)
         - sin sesión  -> muestra login, o registro si la URL trae ?registro=
     · Los negocios nuevos se crean desde Diwilo Web, no desde acá.
     · si NO hay backend (abriste el index.html directo, o el Worker no
       responde): arranca en modo LOCAL (localStorage), sin login.
   Dispara window.__cdpArrancar() (definido en app.js) cuando corresponde.
   ========================================================================== */
(function () {
  'use strict';

  let overlay;

  function css() {
    if (document.getElementById('cdp-auth-css')) return;
    const s = document.createElement('style');
    s.id = 'cdp-auth-css';
    s.textContent = `
      #cdpAuth{position:fixed;inset:0;z-index:20000;background:#f8f9fa;
        display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}
      #cdpAuth .cdp-card{max-width:390px;width:100%}
    `;
    document.head.appendChild(s);
  }

  function vista(html) {
    css();
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cdpAuth';
      document.documentElement.appendChild(overlay);
    }
    overlay.innerHTML =
      `<div class="card shadow-sm cdp-card"><div class="card-body p-4">${html}</div></div>`;
  }
  function cerrarVista() { if (overlay) { overlay.remove(); overlay = null; } }

  const val = (id) => (document.getElementById(id).value || '').trim();

  async function api(path, opts) {
    const r = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...(opts || {}),
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, data };
  }

  /* ---------------- pantallas ---------------- */

  function pantallaLogin(msg) {
    vista(`
      <h5 class="fw-bold mb-1"><i class="bi bi-box-seam me-2 text-primary"></i>Control de Pedidos</h5>
      <p class="text-muted small mb-3">Ingresá con tu correo y contraseña.</p>
      ${msg ? `<div class="alert alert-danger py-2 small mb-3">${msg}</div>` : ''}
      <input id="cdpEmail" type="email" class="form-control mb-2" placeholder="correo@ejemplo.com" autocomplete="username">
      <input id="cdpClave" type="password" class="form-control mb-3" placeholder="Contraseña" autocomplete="current-password">
      <button id="cdpEntrar" class="btn btn-primary w-100 fw-bold">Entrar</button>
      <p class="text-muted small text-center mt-3 mb-0">¿Olvidaste tu contraseña? Pedile al administrador un link nuevo.</p>
    `);
    const entrar = async () => {
      const b = document.getElementById('cdpEntrar');
      b.disabled = true;
      const { ok, data } = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: val('cdpEmail'), password: document.getElementById('cdpClave').value }),
      });
      if (ok && data.crearClave) return pantallaRegistro(data.token, 'El PIN ya no se usa: elegí una contraseña para seguir.');
      if (ok) return iniciarSesion(data.user, data.suscripcion);
      b.disabled = false;
      pantallaLogin(data.error || 'No se pudo entrar');
    };
    document.getElementById('cdpEntrar').onclick = entrar;
    document.getElementById('cdpClave').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    setTimeout(() => document.getElementById('cdpEmail').focus(), 60);
  }

  async function pantallaRegistro(token, aviso) {
    const { ok, data } = await api('/api/registro?token=' + encodeURIComponent(token));
    if (!ok) return pantallaLogin(data.error || 'Invitación inválida');
    vista(`
      <h5 class="fw-bold mb-1"><i class="bi bi-person-badge me-2 text-primary"></i>${data.restablecer ? 'Nueva contraseña' : 'Crear tu acceso'}</h5>
      <p class="text-muted small mb-3">${data.restablecer ? 'Cuenta' : 'Invitación para'} <strong>${data.email}</strong>${data.negocio ? ` · <span class="text-primary">${data.negocio}</span>` : ''}. Elegí tu contraseña.</p>
      ${aviso ? `<div class="alert alert-warning py-2 small mb-3">${aviso}</div>` : ''}
      <div id="cdpMsg"></div>
      <label class="form-label small mb-1">Tu nombre</label>
      <input id="cdpNombre" type="text" class="form-control mb-2" value="${(data.nombre || '').replace(/"/g, '&quot;')}">
      <input type="email" class="d-none" value="${data.email}" autocomplete="username">
      <input id="cdpClave" type="password" class="form-control mb-1" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="new-password">
      <input id="cdpClave2" type="password" class="form-control mb-3" placeholder="Repetir contraseña" autocomplete="new-password">
      <button id="cdpCrear" class="btn btn-primary w-100 fw-bold">Guardar y entrar</button>
    `);
    document.getElementById('cdpCrear').onclick = async () => {
      const msg = document.getElementById('cdpMsg');
      const clave = document.getElementById('cdpClave').value;
      if (clave.length < 8) { msg.innerHTML = '<div class="alert alert-danger py-2 small">La contraseña debe tener al menos 8 caracteres</div>'; return; }
      if (clave !== document.getElementById('cdpClave2').value) { msg.innerHTML = '<div class="alert alert-danger py-2 small">Las contraseñas no coinciden</div>'; return; }
      const b = document.getElementById('cdpCrear');
      b.disabled = true;
      const r = await api('/api/registro', {
        method: 'POST',
        body: JSON.stringify({ token, password: clave, nombre: val('cdpNombre') }),
      });
      if (r.ok) { limpiarUrl(); return arrancarRemoto(); }
      b.disabled = false;
      msg.innerHTML = `<div class="alert alert-danger py-2 small">${r.data.error || 'No se pudo registrar'}</div>`;
    };
  }

  /* ---------------- arranque ---------------- */

  function limpiarUrl() {
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  }

  async function arrancarRemoto() {
    const { ok, data } = await api('/api/me');
    if (!ok) return pantallaLogin();
    iniciarSesion(data.user, data.suscripcion);
  }

  async function iniciarSesion(user, suscripcion) {
    window.__CDP_USER__ = user;
    window.__CDP_SUSCRIPCION__ = suscripcion || null;
    window.__CDP_BACKEND__ = 'remote';
    document.body.dataset.rol = user.rol;
    cerrarVista();
    pintarChip(user);
    pintarBannerSuscripcion(suscripcion);
    if (typeof window.__cdpArrancar === 'function') await window.__cdpArrancar();

    // Vengo del Dashboard ("Factura" de un proveedor) -> abrir Inventario
    // en modo reposición con ese proveedor listo.
    try {
      const rep = new URLSearchParams(location.search).get('reponer');
      if (rep) {
        limpiarUrl();
        if (typeof abrirModalInventarioParaReponer === 'function') abrirModalInventarioParaReponer(rep);
      }
    } catch (e) {}
  }

  // Rellena #authUserSlot, que ahora vive dentro del dropup "Usuario" del
  // menú inferior. Se pinta como lista vertical (el contenedor es d-grid).
  function pintarChip(user) {
    const slot = document.getElementById('authUserSlot');
    if (!slot) return;
    const admin = user.rol === 'admin';
    slot.innerHTML = `
      ${user.negocio ? `<div class="small fw-bold text-primary"><i class="bi bi-shop me-1"></i>${user.negocio}</div>` : ''}
      <span class="badge ${admin ? 'text-bg-primary' : 'text-bg-secondary'} py-2">
        <i class="bi bi-person-fill me-1"></i>${user.nombre}${admin ? ' · admin' : ''}
      </span>
      ${admin
        ? `<a class="btn btn-sm btn-outline-dark" href="/dashboard.html" title="Panel de administración"><i class="bi bi-speedometer2 me-1"></i>Dashboard</a>
           <button class="btn btn-sm btn-outline-primary" onclick="cdpCerrarMenus(); abrirModalPersonal()" title="Gestionar accesos del personal"><i class="bi bi-people-fill me-1"></i>Personal</button>`
        : `<button class="btn btn-sm btn-outline-dark" onclick="cdpCerrarMenus(); abrirModalMovimientos()" title="Ver mis movimientos de inventario"><i class="bi bi-arrow-down-up me-1"></i>Mis movimientos</button>`}
      <button class="btn btn-sm btn-outline-danger" onclick="cdpCerrarSesion()" title="Cerrar sesión"><i class="bi bi-box-arrow-right me-1"></i>Cerrar sesión</button>
    `;
  }

  // Barra fija arriba cuando la suscripción del negocio está vencida: la app
  // sigue abriendo pero en SOLO LECTURA (el Worker rechaza las escrituras con
  // 402). Se reactiva cuando Diwilo Web registra el pago.
  function pintarBannerSuscripcion(s) {
    const previo = document.getElementById('cdpBannerSusc');
    if (previo) previo.remove();
    if (!s || s.estado !== 'solo_lectura') return;

    const admin = window.__CDP_USER__ && window.__CDP_USER__.rol === 'admin';
    const b = document.createElement('div');
    b.id = 'cdpBannerSusc';
    b.style.cssText = 'background:#dc3545;color:#fff;padding:8px 14px;font-size:.85rem;font-weight:600;' +
      'text-align:center;position:relative;z-index:1080';
    b.innerHTML =
      `<i class="bi bi-lock-fill me-1"></i>Suscripción vencida — la app quedó en <u>solo lectura</u>. ` +
      (admin ? 'Ponete al día para reactivar los cambios.' : 'Avisale al administrador.');
    document.body.insertAdjacentElement('afterbegin', b);
  }

  window.cdpCerrarSesion = async function () {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
  };

  async function iniciar() {
    const params = new URLSearchParams(location.search);
    const token = params.get('registro');

    try {
      if (token) return await pantallaRegistro(token);
      const { ok, status, data } = await api('/api/me');
      if (ok) return iniciarSesion(data.user, data.suscripcion);
      if (status === 401) return pantallaLogin();
      throw new Error('me ' + status);
    } catch (e) {
      // Sin backend: modo local con localStorage (p. ej. abriste el archivo directo).
      console.warn('[auth] sin backend -> modo local:', e && e.message);
      window.__CDP_BACKEND__ = 'local';
      if (typeof window.__cdpArrancar === 'function') window.__cdpArrancar();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
