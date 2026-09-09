/* ============================================================================
   js/admin/admin.js — Panel del super-admin: suscripciones de los negocios
   ----------------------------------------------------------------------------
   Solo lo ve quien tenga `users.es_super = 1` (lo revisa admin-gate.js).
   Hace de cliente de /api/admin/*:
       GET  /api/admin/config            -> { precio_mensual }
       POST /api/admin/config            -> { precio_mensual }   ({ precio_mensual })
       GET  /api/admin/negocios?anio=Y   -> { anio, anio_actual, mes_actual, precio_mensual, negocios:[...] }
       POST /api/admin/pago              -> 204  ({ org_id, anio, mes, pagado, monto?, nota? })
       POST /api/admin/bloqueo           -> 204  ({ org_id, hasta })   hasta = epoch ms | null

   "Mapa del año": 12 celdas por negocio. Verde ✓ = mes pagado · rojo ✗ = debe ·
   gris = mes futuro. Si el mes en curso no está pagado (y no hay prueba ni
   desbloqueo), el negocio queda en SOLO LECTURA — el super-admin lo desbloquea
   a mano desde acá.
   ========================================================================== */
(function () {
  'use strict';

  var MES_MS = 30 * 24 * 3600 * 1000;
  var MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  var fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  function money(v) { return fmtCOP.format(Number(v) || 0); }
  function fmtDia(ms) {
    if (!ms) return '—';
    return new Date(Number(ms)).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  var S = { anio: null, anioActual: null, mesActual: null, precio: 0, negocios: [] };

  /* ---------------- red ---------------- */

  async function pedir(metodo, ruta, body) {
    var r = await fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (r.status === 401) { location.replace('/'); throw new Error('sin sesión'); }
    if (r.status === 403) { location.replace('/'); throw new Error('no es super-admin'); }
    var txt = await r.text();
    var data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) throw new Error((data && data.error) || (metodo + ' ' + ruta + ' → ' + r.status));
    return data;
  }

  /* ---------------- toast ---------------- */

  var toastTimer = null;
  function toast(msg, malo) {
    var el = document.getElementById('admToast');
    var txt = document.getElementById('admToastTxt');
    if (!el || !txt) return;
    txt.textContent = msg;
    el.classList.toggle('bg-danger', !!malo);
    el.classList.toggle('bg-dark', !malo);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------------- carga / render ---------------- */

  async function cargar() {
    var d = await pedir('GET', '/api/admin/negocios?anio=' + (S.anio || ''));
    S.anio = d.anio;
    S.anioActual = d.anio_actual;
    S.mesActual = d.mes_actual;
    S.precio = d.precio_mensual;
    S.negocios = d.negocios || [];
    render();
  }

  function badgeEstado(o) {
    var mapa = {
      exento:       ['secondary', 'Exento (super-admin)'],
      al_dia:       ['success',   'Al día'],
      gracia:       ['info',      'En prueba'],
      desbloqueada: ['warning',   'Desbloqueada'],
      solo_lectura: ['danger',    'Solo lectura · debe']
    };
    var m = mapa[o.estado] || ['secondary', o.estado];
    return '<span class="badge text-bg-' + m[0] + '">' + m[1] + '</span>';
  }

  function celdaMes(o, mes) {
    var esFuturo = S.anio > S.anioActual || (S.anio === S.anioActual && mes > S.mesActual);
    var pago = o.pagos && o.pagos[mes];
    var cls = 'mes ' + (esFuturo ? 'futuro' : (pago ? 'pagado' : 'debe'));
    if (S.anio === S.anioActual && mes === S.mesActual) cls += ' actual';
    var ico = esFuturo ? 'bi-dash' : (pago ? 'bi-check-lg' : 'bi-x-lg');
    var titulo = esFuturo
      ? 'Mes futuro'
      : (pago
          ? ('Pagado' + (pago.monto ? ' · ' + money(pago.monto) : '') + (pago.fecha_pago ? ' · ' + fmtDia(Date.parse(pago.fecha_pago)) : ''))
          : 'Sin pagar — tocá para marcar pagado');
    var onclick = esFuturo ? '' : ' onclick="admToggleMes(\'' + o.id + '\',' + mes + ',' + (pago ? 1 : 0) + ')"';
    return '<div class="' + cls + '" title="' + titulo + '"' + onclick + '>' +
             '<span class="m-nom">' + MESES[mes - 1] + '</span>' +
             '<i class="bi ' + ico + ' m-ico"></i>' +
           '</div>';
  }

  function accionesBloqueo(o) {
    if (o.esSuper) return '';
    if (o.estado === 'solo_lectura') {
      return '<button class="btn btn-sm btn-warning" onclick="admDesbloquear(\'' + o.id + '\')">' +
               '<i class="bi bi-unlock-fill me-1"></i>Desbloquear</button>';
    }
    if (o.estado === 'desbloqueada') {
      return '<span class="small text-muted me-2">Desbloqueada hasta <strong>' + fmtDia(o.bloqueo_manual_hasta) + '</strong></span>' +
             '<button class="btn btn-sm btn-outline-danger" onclick="admQuitarDesbloqueo(\'' + o.id + '\')">' +
               '<i class="bi bi-lock-fill me-1"></i>Quitar</button>';
    }
    if (o.estado === 'gracia') {
      return '<span class="small text-muted">Prueba hasta <strong>' + fmtDia(o.gracia_hasta) + '</strong></span>';
    }
    return '';
  }

  function render() {
    document.getElementById('admAnio').textContent = S.anio;
    var pr = document.getElementById('admPrecio');
    if (document.activeElement !== pr) pr.value = S.precio;

    var cont = document.getElementById('admLista');
    if (!S.negocios.length) {
      cont.innerHTML = '<div class="text-center text-muted py-5">Todavía no hay negocios registrados.</div>';
      return;
    }

    // El "estado" (badge, resumen y acciones de bloqueo) es el de HOY; solo
    // aplica cuando estás mirando el año en curso. En años pasados/futuros se
    // muestra únicamente el mapa de meses.
    var esAnioActual = S.anio === S.anioActual;
    var html = '';

    if (esAnioActual) {
      var resumen = { al_dia: 0, gracia: 0, desbloqueada: 0, solo_lectura: 0, exento: 0 };
      S.negocios.forEach(function (o) { resumen[o.estado] = (resumen[o.estado] || 0) + 1; });
      html += '<div class="d-flex flex-wrap gap-2 mb-2 small">' +
        '<span class="badge text-bg-success">Al día: ' + resumen.al_dia + '</span>' +
        '<span class="badge text-bg-info">En prueba: ' + resumen.gracia + '</span>' +
        '<span class="badge text-bg-warning">Desbloqueadas: ' + resumen.desbloqueada + '</span>' +
        '<span class="badge text-bg-danger">Solo lectura: ' + resumen.solo_lectura + '</span>' +
        '</div>';
    }

    S.negocios.forEach(function (o) {
      var celdas = '';
      for (var mes = 1; mes <= 12; mes++) celdas += celdaMes(o, mes);
      var acc = esAnioActual ? accionesBloqueo(o) : '';
      html +=
        '<div class="card-adm mb-2">' +
          '<div class="hd d-flex flex-wrap align-items-center gap-2">' +
            '<strong>' + escapar(o.nombre) + '</strong>' +
            (esAnioActual ? badgeEstado(o) : '') +
            '<span class="small text-muted"><i class="bi bi-people me-1"></i>' + o.usuarios + '</span>' +
            '<span class="small text-muted"><i class="bi bi-calendar3 me-1"></i>' + fmtDia(o.creado_en) + '</span>' +
            (acc ? '<span class="ms-auto d-flex align-items-center gap-2">' + acc + '</span>' : '') +
          '</div>' +
          '<div class="bd"><div class="mapa">' + celdas + '</div></div>' +
        '</div>';
    });

    cont.innerHTML = html;
  }

  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- acciones (globales para los onclick) ---------------- */

  window.admGuardarPrecio = async function () {
    var v = Math.max(0, parseInt(document.getElementById('admPrecio').value, 10) || 0);
    try {
      var d = await pedir('POST', '/api/admin/config', { precio_mensual: v });
      S.precio = d.precio_mensual;
      toast('Precio guardado: ' + money(S.precio));
      render();
    } catch (e) { toast('No se pudo guardar el precio', true); }
  };

  window.admCambiarAnio = async function (delta) {
    S.anio = (S.anio || S.anioActual) + delta;
    try { await cargar(); } catch (e) { toast('No se pudo cargar el año', true); }
  };

  window.admToggleMes = async function (orgId, mes, pagado) {
    var neg = S.negocios.find(function (n) { return n.id === orgId; });
    var nombre = neg ? neg.nombre : 'el negocio';
    if (pagado && !confirm('Quitar el pago de ' + MESES[mes - 1] + ' ' + S.anio + ' para "' + nombre + '"?')) return;
    try {
      await pedir('POST', '/api/admin/pago', { org_id: orgId, anio: S.anio, mes: mes, pagado: !pagado });
      await cargar();
      toast(pagado ? 'Pago quitado' : (MESES[mes - 1] + ' ' + S.anio + ' marcado pagado'));
    } catch (e) { toast('No se pudo actualizar el pago', true); }
  };

  window.admDesbloquear = async function (orgId) {
    try {
      await pedir('POST', '/api/admin/bloqueo', { org_id: orgId, hasta: Date.now() + MES_MS });
      await cargar();
      toast('Negocio desbloqueado por 30 días');
    } catch (e) { toast('No se pudo desbloquear', true); }
  };

  window.admQuitarDesbloqueo = async function (orgId) {
    if (!confirm('Quitar el desbloqueo manual? Si el mes en curso no está pagado, el negocio vuelve a solo lectura.')) return;
    try {
      await pedir('POST', '/api/admin/bloqueo', { org_id: orgId, hasta: null });
      await cargar();
      toast('Desbloqueo quitado');
    } catch (e) { toast('No se pudo quitar el desbloqueo', true); }
  };

  /* ---------------- arranque (lo llama admin-gate.js) ---------------- */

  window.admIniciar = async function (user) {
    var chip = document.getElementById('admUser');
    if (chip) chip.textContent = (user && user.nombre) || 'super-admin';
    try {
      await cargar();
      document.getElementById('admCargando').classList.add('d-none');
      document.getElementById('admContenido').classList.remove('d-none');
    } catch (e) {
      document.getElementById('admCargando').innerHTML =
        '<div class="text-danger">No se pudo cargar el panel.<br><span class="small">' + escapar(e.message) + '</span></div>';
    }
  };
})();
