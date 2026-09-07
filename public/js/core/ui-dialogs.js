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

// Apilado correcto de modales anidados (p.ej. Cuentas + Catálogo, o el
// diálogo de confirmación abierto desde otro modal). Bootstrap no lo maneja
// bien "de fábrica": sin esto el segundo modal (y/o su fondo oscuro) queda
// por detrás y todo se ve gris e inutilizable.
//
// Enfoque: al ABRIR un modal, si ya hay otro(s) abierto(s), a ESTE se le
// sube el z-index por encima; a su backdrop (el último agregado) también.
// Los modales de más abajo se dejan como están.
document.addEventListener('show.bs.modal', function (e) {
  const yaAbiertos = document.querySelectorAll('.modal.show').length;
  if (yaAbiertos === 0) return; // modal simple: valores por defecto de Bootstrap

  const z = 1055 + yaAbiertos * 20;
  e.target.style.zIndex = z + 5;

  // El backdrop de este modal se inserta justo después de este evento.
  setTimeout(function () {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    const ultimo = backdrops[backdrops.length - 1];
    if (ultimo) ultimo.style.zIndex = z;
  }, 0);
});

// Bootstrap quita "modal-open" del <body> al cerrar CUALQUIER modal; si
// todavía queda otro abierto, se repone para no perder el bloqueo de scroll.
document.addEventListener('hidden.bs.modal', function () {
  if (document.querySelectorAll('.modal.show').length > 0) {
    document.body.classList.add('modal-open');
  }
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
