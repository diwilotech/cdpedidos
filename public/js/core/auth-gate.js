/* ============================================================================
   js/core/auth-gate.js — Portón de acceso (login / registro / setup)
   ----------------------------------------------------------------------------
   Se carga ÚLTIMO. Antes de mostrar la app:
     · si hay backend (Worker): pide GET /api/me
         - con sesión  -> arranca la app en modo REMOTO (datos en D1)
         - sin sesión  -> muestra login / setup / registro (según la URL)
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
      #cdpAuth .cdp-pin{letter-spacing:.35em;text-align:center;font-weight:700}
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
      <p class="text-muted small mb-3">Ingresá con tu correo y PIN.</p>
      ${msg ? `<div class="alert alert-danger py-2 small mb-3">${msg}</div>` : ''}
      <input id="cdpEmail" type="email" class="form-control mb-2" placeholder="correo@ejemplo.com" autocomplete="username">
      <input id="cdpPin" type="password" inputmode="numeric" maxlength="8" class="form-control cdp-pin mb-3" placeholder="PIN" autocomplete="current-password">
      <button id="cdpEntrar" class="btn btn-primary w-100 fw-bold">Entrar</button>
      <button id="cdpIrSignup" class="btn btn-link btn-sm w-100 mt-2 text-muted text-decoration-none">¿Restaurante nuevo? · Crear mi cuenta</button>
    `);
    const entrar = async () => {
      const b = document.getElementById('cdpEntrar');
      b.disabled = true;
      const { ok, data } = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: val('cdpEmail'), pin: val('cdpPin') }),
      });
      if (ok) return iniciarSesion(data.user);
      b.disabled = false;
      pantallaLogin(data.error || 'No se pudo entrar');
    };
    document.getElementById('cdpEntrar').onclick = entrar;
    document.getElementById('cdpPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    document.getElementById('cdpIrSignup').onclick = () => pantallaSignup();
    setTimeout(() => document.getElementById('cdpEmail').focus(), 60);
  }

  // Auto-registro: crea el restaurante + su administrador.
  function pantallaSignup(msg) {
    vista(`
      <h5 class="fw-bold mb-1"><i class="bi bi-shop me-2 text-primary"></i>Crear mi restaurante</h5>
      <p class="text-muted small mb-3">Con esto quedás como administrador y ya podés invitar a tu personal.</p>
      ${msg ? `<div class="alert alert-danger py-2 small mb-3">${msg}</div>` : ''}
      <label class="form-label small mb-1">Nombre del restaurante</label>
      <input id="cdpNegocio" type="text" class="form-control mb-2" maxlength="60" placeholder="Ej. La Esquina">
      <label class="form-label small mb-1">Tu correo</label>
      <input id="cdpEmail" type="email" class="form-control mb-2" placeholder="correo@ejemplo.com" autocomplete="username">
      <input id="cdpPin" type="password" inputmode="numeric" maxlength="8" class="form-control cdp-pin mb-1" placeholder="PIN (4 a 8 dígitos)" autocomplete="new-password">
      <input id="cdpPin2" type="password" inputmode="numeric" maxlength="8" class="form-control cdp-pin mb-3" placeholder="Repetir PIN" autocomplete="new-password">
      <button id="cdpCrearNeg" class="btn btn-primary w-100 fw-bold">Crear y entrar</button>
      <button id="cdpVolver" class="btn btn-link btn-sm w-100 mt-2 text-muted text-decoration-none">Volver</button>
    `);
    document.getElementById('cdpCrearNeg').onclick = async () => {
      if (val('cdpPin') !== val('cdpPin2')) return pantallaSignup('Los PIN no coinciden');
      const b = document.getElementById('cdpCrearNeg');
      b.disabled = true;
      const { ok, data } = await api('/api/signup', {
        method: 'POST',
        body: JSON.stringify({ email: val('cdpEmail'), pin: val('cdpPin'), negocio: val('cdpNegocio') }),
      });
      if (ok) return iniciarSesion(data.user);
      b.disabled = false;
      pantallaSignup(data.error || 'No se pudo crear la cuenta');
    };
    document.getElementById('cdpVolver').onclick = () => pantallaLogin();
    setTimeout(() => document.getElementById('cdpNegocio').focus(), 60);
  }

  async function pantallaRegistro(token) {
    const { ok, data } = await api('/api/registro?token=' + encodeURIComponent(token));
    if (!ok) return pantallaLogin(data.error || 'Invitación inválida');
    vista(`
      <h5 class="fw-bold mb-1"><i class="bi bi-person-badge me-2 text-primary"></i>Crear tu acceso</h5>
      <p class="text-muted small mb-3">Invitación para <strong>${data.email}</strong>${data.negocio ? ` · <span class="text-primary">${data.negocio}</span>` : ''}. Elegí tu PIN.</p>
      <div id="cdpMsg"></div>
      <label class="form-label small mb-1">Tu nombre</label>
      <input id="cdpNombre" type="text" class="form-control mb-2" value="${(data.nombre || '').replace(/"/g, '&quot;')}">
      <input id="cdpPin" type="password" inputmode="numeric" maxlength="8" class="form-control cdp-pin mb-1" placeholder="PIN (4 a 8 dígitos)">
      <input id="cdpPin2" type="password" inputmode="numeric" maxlength="8" class="form-control cdp-pin mb-3" placeholder="Repetir PIN">
      <button id="cdpCrear" class="btn btn-primary w-100 fw-bold">Crear acceso y entrar</button>
    `);
    document.getElementById('cdpCrear').onclick = async () => {
      const msg = document.getElementById('cdpMsg');
      if (val('cdpPin') !== val('cdpPin2')) { msg.innerHTML = '<div class="alert alert-danger py-2 small">Los PIN no coinciden</div>'; return; }
      const b = document.getElementById('cdpCrear');
      b.disabled = true;
      const r = await api('/api/registro', {
        method: 'POST',
        body: JSON.stringify({ token, pin: val('cdpPin'), nombre: val('cdpNombre') }),
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
    iniciarSesion(data.user);
  }

  async function iniciarSesion(user) {
    window.__CDP_USER__ = user;
    window.__CDP_BACKEND__ = 'remote';
    document.body.dataset.rol = user.rol;
    cerrarVista();
    pintarChip(user);
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
      if (ok) return iniciarSesion(data.user);
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
