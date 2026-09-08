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

// Apilado correcto de modales anidados (Cuentas + Catálogo, un diálogo de
// confirmación/entrada de texto abierto desde otro modal, etc.). Bootstrap
// no lo maneja bien "de fábrica": sin esto el segundo modal y/o su fondo
// oscuro quedan por detrás y todo se ve gris e inutilizable.
//
// Se lleva la lista de modales abiertos EN ORDEN DE APERTURA (no de DOM) y
// se reasigna el z-index a partir de eso. Se recalcula tanto al 'show'
// (con un tick de margen para que el backdrop ya exista) como al 'shown',
// así también funciona cuando dos modales se abren en el mismo instante
// (p. ej. abrir Cuentas y pedir el nombre de la cuenta seguido).
(function () {
  const abiertos = []; // elementos .modal, en orden de apertura

  function restackear() {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    abiertos.forEach(function (modal, i) {
      if (i === 0) return; // el primero queda con los valores por defecto de Bootstrap
      const z = 1055 + i * 20;
      modal.style.zIndex = (z + 5);
      if (backdrops[i]) backdrops[i].style.zIndex = z;
    });
  }

  document.addEventListener('show.bs.modal', function (e) {
    if (abiertos.indexOf(e.target) === -1) abiertos.push(e.target);
    setTimeout(restackear, 0);
  });
  document.addEventListener('shown.bs.modal', restackear);

  document.addEventListener('hidden.bs.modal', function (e) {
    const i = abiertos.indexOf(e.target);
    if (i > -1) abiertos.splice(i, 1);
    e.target.style.zIndex = '';
    // Bootstrap quita "modal-open" del <body> al cerrar CUALQUIER modal; si
    // todavía queda otro abierto, se repone para no perder el bloqueo de scroll.
    if (abiertos.length > 0) {
      document.body.classList.add('modal-open');
      restackear();
    }
  });
})();

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
