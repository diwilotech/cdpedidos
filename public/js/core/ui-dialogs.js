/* ============================================================================
   js/core/ui-dialogs.js — Diálogos propios y notificaciones
   ----------------------------------------------------------------------------
   Reemplazos de prompt()/confirm() con modales de Bootstrap (los nativos
   quedan bloqueados en varios navegadores/entornos de vista previa) +
   apilado correcto de modales anidados + toast de avisos.
   ========================================================================== */

function pedirTexto(titulo, valorInicial, onConfirmar) {
  document.getElementById('modalPromptTitulo').innerText = titulo;
  const input = document.getElementById('modalPromptInput');
  input.value = valorInicial || '';

  const btnConfirmar = document.getElementById('modalPromptConfirmarBtn');
  const modalEl = document.getElementById('modalPromptTexto');

  const limpiar = () => {
    btnConfirmar.removeEventListener('click', onAceptar);
    input.removeEventListener('keydown', onEnter);
    modalEl.removeEventListener('hidden.bs.modal', limpiar);
  };
  const onAceptar = () => {
    const valor = input.value.trim();
    limpiar();
    modalPromptBS.hide();
    if (valor) onConfirmar(valor);
  };
  const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); onAceptar(); } };

  btnConfirmar.addEventListener('click', onAceptar);
  input.addEventListener('keydown', onEnter);
  modalEl.addEventListener('hidden.bs.modal', limpiar);

  modalPromptBS.show();
  setTimeout(() => { input.focus(); input.select(); }, 300);
}

function pedirConfirmacion(mensaje, onConfirmar) {
  document.getElementById('modalConfirmarTexto').innerText = mensaje;
  const btnAceptar = document.getElementById('modalConfirmarAceptarBtn');

  const onAceptar = () => {
    btnAceptar.removeEventListener('click', onAceptar);
    modalConfirmarBS.hide();
    onConfirmar();
  };
  btnAceptar.addEventListener('click', onAceptar, { once: true });

  modalConfirmarBS.show();
}

function pedirColor(colorInicial, onConfirmar) {
  const picker = document.getElementById('colorPickerOculto');
  picker.value = colorInicial || '#0d6efd';
  const onChange = () => {
    picker.removeEventListener('input', onChange);
    onConfirmar(picker.value);
  };
  picker.addEventListener('input', onChange, { once: true });
  picker.click();
}

// Apilado correcto de modales (p.ej. Cuentas + Catálogo abierto encima).
// Bootstrap no soporta modales anidados "de fábrica"; sin esto, el fondo
// oscuro (backdrop) del segundo modal puede quedar con un z-index más alto
// que el propio modal y tapar todo en gris.
document.addEventListener('shown.bs.modal', function () {
  const modalesAbiertos = document.querySelectorAll('.modal.show');
  const backdrops = document.querySelectorAll('.modal-backdrop');

  backdrops.forEach((bd, i) => {
    bd.style.zIndex = 1050 + (i * 20);
  });

  modalesAbiertos.forEach((modalEl, i) => {
    modalEl.style.zIndex = 1055 + (i * 20) + 10;
  });
});

// Notificación flotante genérica y reutilizable (éxito, error, aviso).
function mostrarNotificacion(mensaje, tipo = 'success', icono = 'bi-check-circle-fill') {
  const el = document.getElementById('toastNotificacion');
  el.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'text-dark');
  el.classList.add(`bg-${tipo}`);
  if (tipo === 'warning') el.classList.add('text-dark');
  document.getElementById('toastNotificacionTexto').innerHTML = `<i class="bi ${icono} me-1"></i> ${mensaje}`;
  toastNotificacionBS.show();
}

function notificarProductoAgregado(nombre, cant) {
  mostrarNotificacion(`${nombre} agregado (x${cant})`, 'success', 'bi-check-circle-fill');
}

function notificarSinStock(nombre) {
  mostrarNotificacion(`Sin stock disponible de "${nombre}"`, 'danger', 'bi-exclamation-triangle-fill');
}
