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

  // Banner de Diwilo (izquierda) + tarjeta de ingreso con los colores de la app (derecha).
  // Estilos en assets/css/diwilo-login.css (el mismo diseño en todas las apps de Diwilo).
  const LOGO_DIWILO = '<svg viewBox="18 14 168 172" aria-hidden="true"><defs><linearGradient id="dwl" gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="170" y2="180"><stop offset="0" stop-color="#F3E8FF"/><stop offset="1" stop-color="#A78BFA"/></linearGradient></defs><g fill="none" stroke="url(#dwl)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><path d="M48 72V146Q48 170 72 170H84"/><path d="M156.6 135A70 70 0 0 0 96 30H86"/><path d="M84 134V124Q84 108 100 108H124"/></g><g fill="url(#dwl)"><circle cx="48" cy="34" r="13"/><circle cx="112" cy="72" r="13"/><circle cx="125.6" cy="163.4" r="13"/></g></svg>';
  const BANNER = `
    <aside class="dl-brand">
      <a class="dl-logo" href="https://diwilo.com" target="_blank" rel="noopener">${LOGO_DIWILO}Diwilo</a>
      <div class="dl-hero">
        <span class="dl-chip"><i class="bi bi-box-seam"></i>Control de Pedidos · una app de Diwilo</span>
        <h1>Tu restaurante, ordenado y en un solo lugar.</h1>
        <p>Mesas, cuentas, inventario y clientes en tiempo real, desde cualquier dispositivo.</p>
        <ul class="dl-points"><li>Cada persona entra con su propio usuario</li><li>Todo queda registrado a su nombre</li><li>Funciona en el celular como una app</li></ul>
      </div>
      <div class="dl-foot">¿Necesitás ayuda? <a href="https://wa.me/573053840193" target="_blank" rel="noopener">Escribinos por WhatsApp</a><br>© Diwilo · <a href="https://diwilo.com" target="_blank" rel="noopener">diwilo.com</a></div>
      <span class="dl-m">una app de Diwilo</span>
    </aside>`;

  function vista(html) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'cdpAuth';
      overlay.className = 'dl-shell';
      overlay.style.cssText = '--dl-accent:#0d6efd;--dl-accent-2:#3dd5f3;--dl-m1:hsla(270,50%,72%,1);--dl-m2:hsla(215,85%,68%,1);--dl-m3:hsla(190,80%,70%,1);--dl-m4:hsla(35,100%,70%,1);z-index:20000';
      document.documentElement.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="dl-box">${BANNER}
      <main class="dl-side"><div class="dl-card">
        <div class="dl-icon"><i class="bi bi-box-seam"></i></div>
        ${html}
        <p class="dl-powered">Control de Pedidos · por <a href="https://diwilo.com" target="_blank" rel="noopener">Diwilo</a></p>
      </div></main></div>`;
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
      <p class="dl-kicker">¡Centro de control!</p>
      <h2 class="dl-title">Ingresa</h2>
      <p class="dl-sub">Con tu correo y contraseña</p>
      ${msg ? `<div class="dl-alert bad">${msg}</div>` : ''}
      <div class="dl-form">
        <input id="cdpEmail" type="email" class="dl-in" placeholder="Tu correo electrónico" aria-label="Correo" autocomplete="username">
        <input id="cdpClave" type="password" class="dl-in" placeholder="Tu contraseña" aria-label="Contraseña" autocomplete="current-password">
        <button id="cdpEntrar" class="dl-btn">Ingresar</button>
      </div>
      <p class="dl-help">¿Olvidaste tu contraseña? Pedile al administrador un link nuevo.</p>
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
      <p class="dl-kicker">${data.negocio ? data.negocio : '¡Bienvenido!'}</p>
      <h2 class="dl-title">${data.restablecer ? 'Nueva contraseña' : 'Crea tu acceso'}</h2>
      <p class="dl-sub">${data.email}</p>
      ${aviso ? `<div class="dl-alert warn">${aviso}</div>` : ''}
      <div id="cdpMsg"></div>
      <div class="dl-form">
        <input id="cdpNombre" type="text" class="dl-in" placeholder="Tu nombre" aria-label="Tu nombre" value="${(data.nombre || '').replace(/"/g, '&quot;')}">
        <input type="email" class="d-none" value="${data.email}" autocomplete="username">
        <input id="cdpClave" type="password" class="dl-in" placeholder="Contraseña (mínimo 8 caracteres)" aria-label="Contraseña" autocomplete="new-password">
        <input id="cdpClave2" type="password" class="dl-in" placeholder="Repetí la contraseña" aria-label="Repetí la contraseña" autocomplete="new-password">
        <button id="cdpCrear" class="dl-btn">Guardar y entrar</button>
      </div>
    `);
    document.getElementById('cdpCrear').onclick = async () => {
      const msg = document.getElementById('cdpMsg');
      const clave = document.getElementById('cdpClave').value;
      if (clave.length < 8) { msg.innerHTML = '<div class="dl-alert bad">La contraseña debe tener al menos 8 caracteres</div>'; return; }
      if (clave !== document.getElementById('cdpClave2').value) { msg.innerHTML = '<div class="dl-alert bad">Las contraseñas no coinciden</div>'; return; }
      const b = document.getElementById('cdpCrear');
      b.disabled = true;
      const r = await api('/api/registro', {
        method: 'POST',
        body: JSON.stringify({ token, password: clave, nombre: val('cdpNombre') }),
      });
      if (r.ok) { limpiarUrl(); return arrancarRemoto(); }
      b.disabled = false;
      msg.innerHTML = `<div class="dl-alert bad">${r.data.error || 'No se pudo registrar'}</div>`;
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
