/* ============================================================================
   js/modules/plano.js — Plano interactivo de mesas (GridStack)
   ----------------------------------------------------------------------------
   Pisos dinámicos, cuadrícula, zoom, modo edición, creación/duplicado/
   eliminado de mesas y zonas, badges de cuentas y panel lateral flotante.
   ========================================================================== */

/* --- CUADRÍCULA / GRIDSTACK --- */
// GridStack solo trae CSS para grids de hasta 12 columnas. Como usamos 20
// (para que quepan 10 mesas de 2x2 por fila), generamos aquí las reglas
// de ancho/posición para las columnas 13-20.
const GRID_COLUMNS = 20;
(function inyectarCSSColumnasExtra(cols) {
  let css = `.gs-${cols}>.grid-stack-item{width:${100 / cols}%}`;
  for (let i = 1; i < cols; i++) {
    css += `.gs-${cols}>.grid-stack-item[gs-x="${i}"]{left:${(100 / cols) * i}%}`;
  }
  for (let i = 2; i <= cols; i++) {
    css += `.gs-${cols}>.grid-stack-item[gs-w="${i}"]{width:${(100 / cols) * i}%}`;
  }
  const style = document.createElement('style');
  style.id = 'gs-extra-columns-css';
  style.textContent = css;
  document.head.appendChild(style);
})(GRID_COLUMNS);

const gridOptions = {
  column: GRID_COLUMNS,
  cellHeight: 60,
  margin: 0,
  float: true,
  animate: true,
  disableResize: false,
  staticGrid: true,            /* Bloqueado hasta pulsar Editar */
  autoFit: false,
  resizable: {
    handles: 'all'
  }
};

// Sincroniza el tamaño del fondo cuadriculado con el ancho REAL de cada
// columna del grid (el contenedor es fluido, así que se recalcula).
function sincronizarFondoCuadricula() {
  document.querySelectorAll('.grid-container').forEach(el => {
    const anchoColumna = el.clientWidth / GRID_COLUMNS;
    el.style.backgroundSize = `${anchoColumna}px ${gridOptions.cellHeight}px`;
  });
}
sincronizarFondoCuadricula();
window.addEventListener('resize', sincronizarFondoCuadricula);

/* --- ZOOM DEL PLANO --- */
// Se usa la propiedad CSS "zoom" (no transform: scale) porque "zoom" sí
// recalcula el layout real, de modo que GridStack sigue detectando bien
// tamaños/posiciones al arrastrar o redimensionar.
const ZOOM_INICIAL = 0.55; // zoom óptimo de arranque: se ven todos los cuadros
let nivelZoom = ZOOM_INICIAL;
let zoomManual = false; // true en cuanto el usuario toca algún botón de zoom
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const ZOOM_PASO = 0.1;

function aplicarNivelZoom() {
  const wrapper = document.getElementById('zoomWrapper');
  wrapper.style.zoom = nivelZoom;
  document.getElementById('zoomPct').innerText = Math.round(nivelZoom * 100) + '%';
  requestAnimationFrame(sincronizarFondoCuadricula);
}

function ajustarZoom(delta, resetear = false) {
  zoomManual = true;
  if (resetear) {
    nivelZoom = 1;
  } else {
    nivelZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(nivelZoom + delta).toFixed(2)));
  }
  aplicarNivelZoom();
}

// Calcula el zoom para que las mesas ocupen TODO EL ANCHO disponible
// (sin scroll horizontal). No se toma en cuenta el alto: el contenedor
// ya tiene su propio scroll vertical.
function calcularZoomDeAjuste() {
  const gridEl = document.getElementById('grid-piso' + pisoActual);
  const scrollArea = document.querySelector('.zoom-scroll-area');
  if (!gridEl || !scrollArea) return null;

  const anchoDisponible = scrollArea.clientWidth - 6;
  const anchoNatural = gridEl.scrollWidth / (nivelZoom || 1);
  if (!anchoNatural) return null;

  const nuevoZoom = anchoDisponible / anchoNatural;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +nuevoZoom.toFixed(2)));
}

// Botón "Ajustar el plano al ancho de la pantalla": acción explícita.
function ajustarZoomAjustar() {
  const nuevoZoom = calcularZoomDeAjuste();
  if (nuevoZoom === null) return;
  zoomManual = true;
  nivelZoom = nuevoZoom;
  aplicarNivelZoom();
}

// Zoom de arranque silencioso al cargar / cambiar de piso / redimensionar,
// mientras el usuario no haya tocado manualmente el zoom. Se deja fijo en
// ZOOM_INICIAL (55%), que es donde se ven todos los cuadros del plano.
// Para encajar exactamente al ancho de la pantalla está el botón
// "Ajustar el plano al ancho" (ajustarZoomAjustar).
function autoAjustarZoomSiCorresponde() {
  if (zoomManual) return;
  nivelZoom = ZOOM_INICIAL;
  aplicarNivelZoom();
}

window.addEventListener('resize', () => {
  requestAnimationFrame(autoAjustarZoomSiCorresponde);
});

/* --- PALETA DE COLORES --- */
const coloresPaleta = ['#0d6efd','#198754','#6f42c1','#fd7e14','#dc3545','#0dcaf0','#d63384','#20c997','#ffc107','#6610f2'];
function renderPaletaColores(){return coloresPaleta.map(c=>`<button type="button" class="color-dot" style="background:${hexToRgba(c,.72)}" title="${c}" onclick="seleccionarColorElemento(this,'${c}',event)"></button>`).join('');}

// Color seleccionado para la próxima mesa/zona a crear.
let colorNuevoSeleccionado = coloresPaleta[0];

function renderPaletaColorNuevo() {
  const cont = document.getElementById('paletaColorNuevo');
  if (!cont) return;
  cont.innerHTML = coloresPaleta.map(c => `
    <button type="button"
      class="color-dot ${c === colorNuevoSeleccionado ? 'selected' : ''}"
      style="background:${hexToRgba(c, .85)}"
      title="${c}"
      onclick="seleccionarColorNuevo('${c}')"></button>
  `).join('');
}

function seleccionarColorNuevo(color) {
  colorNuevoSeleccionado = color;
  renderPaletaColorNuevo();
}

document.addEventListener('DOMContentLoaded', renderPaletaColorNuevo);

/* --- MODO EDICIÓN --- */
function toggleModoEdicion(){
  modoEdicion=!modoEdicion;
  document.body.classList.toggle('edit-mode-active', modoEdicion);
  Object.values(grids).forEach(grid=>{grid.setStatic(!modoEdicion);grid.el.classList.toggle('edit-mode',modoEdicion);});
  const btn=document.getElementById('btn-editar'), status=document.getElementById('edit-status');
  btn.classList.toggle('active',modoEdicion);btn.classList.toggle('btn-primary',modoEdicion);btn.classList.toggle('btn-outline-primary',!modoEdicion);
  btn.innerHTML=modoEdicion?'<i class="bi bi-check2-square me-1"></i> Listo':'<i class="bi bi-pencil-square me-1"></i> Editar';
  status.classList.toggle('active',modoEdicion);status.innerHTML=modoEdicion?'<i class="bi bi-unlock me-1"></i> Edición activa':'<i class="bi bi-lock me-1"></i> Edición desactivada';
  if(!modoEdicion){document.querySelectorAll('.color-palette.show').forEach(p=>p.classList.remove('show'));deseleccionarTodos();}

  // Con el plano con zoom distinto de 100%, el mouse queda desincronizado
  // de la mesa que se arrastra o redimensiona. Por eso, mientras se edita,
  // se fuerza el zoom a 100% y se bloquean los botones de zoom.
  const toolbarZoom = document.querySelector('.zoom-toolbar-flotante');
  if (modoEdicion) {
    if (nivelZoom !== 1) { nivelZoom = 1; aplicarNivelZoom(); }
    if (toolbarZoom) {
      toolbarZoom.querySelectorAll('button').forEach(b => b.disabled = true);
      toolbarZoom.title = 'El zoom se bloquea en 100% mientras editas, para que arrastrar las mesas funcione bien';
    }
  } else if (toolbarZoom) {
    toolbarZoom.querySelectorAll('button').forEach(b => b.disabled = false);
    toolbarZoom.title = '';
  }
}
function verificarModoEdicion(){return modoEdicion;}

/* --- PISOS (cambiar, crear, renombrar, eliminar) --- */
function cambiarPiso(pisoId) {
  pisoActual = pisoId;
  deseleccionarTodos();

  document.querySelectorAll('.piso-panel').forEach(panel => {
    panel.classList.toggle('d-none', panel.id !== 'panel-piso' + pisoId);
  });

  document.querySelectorAll('.btn-piso-item').forEach(btn => {
    const activo = Number(btn.dataset.pisoId) === Number(pisoId);
    btn.classList.toggle('active', activo);
    btn.classList.toggle('btn-primary', activo);
    btn.classList.toggle('btn-outline-primary', !activo);
  });

  sincronizarFondoCuadricula();
  actualizarSidebar();
  requestAnimationFrame(autoAjustarZoomSiCorresponde);
}

// Crea el botón de pestaña + el panel (título y grid) de un piso e
// inicializa su GridStack. Se usa en la carga inicial y al agregar un piso.
function crearPisoDOM(piso) {
  const btnGroup = document.getElementById('pisoTabsGroup');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-outline-primary btn-piso-item';
  btn.id = 'btn-piso' + piso.id;
  btn.dataset.pisoId = piso.id;
  btn.innerHTML = `<span class="piso-btn-label">${piso.nombre}</span>`;
  btn.onclick = () => cambiarPiso(piso.id);
  btnGroup.appendChild(btn);

  const panelsContainer = document.getElementById('pisosPanelsContainer');
  const panel = document.createElement('div');
  panel.id = 'panel-piso' + piso.id;
  panel.className = 'piso-panel d-none';
  panel.innerHTML = `
    <div class="piso-titulo-row mb-2">
      <h5 class="text-secondary mb-0"><i class="bi bi-building me-1"></i> Plano - <span class="piso-titulo">${piso.nombre}</span></h5>
      <button class="btn btn-sm btn-outline-secondary edit-only" onclick="renombrarPiso(${piso.id})" title="Cambiar el nombre de este piso">
        <i class="bi bi-pencil"></i>
      </button>
      <button class="btn btn-sm btn-outline-danger edit-only" onclick="eliminarPiso(${piso.id})" title="Eliminar este piso">
        <i class="bi bi-trash3"></i>
      </button>
    </div>
    <div id="grid-piso${piso.id}" class="grid-stack grid-container"></div>
  `;
  panelsContainer.appendChild(panel);

  grids[piso.id] = GridStack.init(gridOptions, '#grid-piso' + piso.id);
  grids[piso.id].on('change added removed', () => actualizarSidebar());
  new ResizeObserver(sincronizarFondoCuadricula).observe(document.getElementById('grid-piso' + piso.id));
}

function agregarPiso() {
  if (!verificarModoEdicion()) return;
  pedirTexto('Nombre del nuevo piso:', `Piso ${pisosData.length + 1}`, (nombre) => {
    contadorPisos++;
    const piso = { id: contadorPisos, nombre };
    pisosData.push(piso);
    crearPisoDOM(piso);
    cambiarPiso(piso.id);
    guardarEstado();
  });
}

function renombrarPiso(pisoId) {
  if (!verificarModoEdicion()) return;
  const piso = pisosData.find(p => p.id === pisoId);
  if (!piso) return;
  pedirTexto('Nuevo nombre para este piso:', piso.nombre, (nuevoNombre) => {
    piso.nombre = nuevoNombre;
    const label = document.querySelector(`#btn-piso${pisoId} .piso-btn-label`);
    const titulo = document.querySelector(`#panel-piso${pisoId} .piso-titulo`);
    if (label) label.innerText = nuevoNombre;
    if (titulo) titulo.innerText = nuevoNombre;
    guardarEstado();
  });
}

function eliminarPiso(pisoId) {
  if (!verificarModoEdicion()) return;
  if (pisosData.length <= 1) {
    mostrarNotificacion('Debe existir al menos un piso.', 'danger', 'bi-exclamation-triangle-fill');
    return;
  }
  pedirConfirmacion('¿Eliminar este piso y todas sus mesas? Esta acción no se puede deshacer.', () => {
    const grid = grids[pisoId];
    if (grid) {
      grid.engine.nodes.forEach(node => {
        const content = node.el ? node.el.querySelector('[data-mesaid]') : null;
        if (content) delete mesasData[content.dataset.mesaid];
      });
      grid.destroy(false);
    }
    document.getElementById('panel-piso' + pisoId)?.remove();
    document.getElementById('btn-piso' + pisoId)?.remove();
    delete grids[pisoId];
    pisosData = pisosData.filter(p => p.id !== pisoId);

    if (pisoActual === pisoId) {
      cambiarPiso(pisosData[0].id);
    }
    guardarEstado();
  });
}

/* --- MESAS / ZONAS --- */
function crearElemento({ id, nombre, cuentas = [], colorHex, w, h, x = undefined, y = undefined, piso = pisoActual }) {
  const mesaId = id || 'mesa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

  // Copia profunda para desacoplar las cuentas entre mesas.
  mesasData[mesaId] = JSON.parse(JSON.stringify(cuentas));

  const colorRgba = hexToRgba(colorHex, 0.8);

  const contenidoHTML = `
    <div class="grid-stack-item-content" style="background-color: ${colorRgba};" data-colorhex="${colorHex}" data-mesaid="${mesaId}">
      <div class="edit-toolbar">
        <button class="edit-mini-btn" onclick="accionRenombrarElemento(this)" title="Cambiar nombre"><i class="bi bi-pencil"></i></button>
        <button class="edit-mini-btn color" onclick="togglePaletaColor(this,event)" title="Cambiar color"><i class="bi bi-palette"></i></button>
        <button class="edit-mini-btn duplicate" onclick="duplicarElementoEspecifico(this,${piso})" title="Duplicar"><i class="bi bi-copy"></i></button>
        <button class="edit-mini-btn danger" onclick="eliminarElementoEspecifico(this,${piso})" title="Eliminar"><i class="bi bi-trash3"></i></button>
        <div class="color-palette">${renderPaletaColores()}</div>
      </div>
      <div class="mesa-nombre-row fw-bold text-shadow">
        <span class="nombre-label fs-6 text-truncate">${nombre}</span>
      </div>
      <div class="mesa-badge-row">
        <div class="table-actions-container d-flex align-items-center gap-1">
          <div class="cuentas-badge-wrapper">${renderMesaBadge(mesaId)}</div>
        </div>
      </div>
    </div>
  `;

  const widget = grids[piso].addWidget({
    w: w, h: h, x: x, y: y,
    content: contenidoHTML
  });

  // En GridStack 9.x, addWidget() devuelve directamente el elemento del DOM.
  const el = widget.el || widget;

  el.addEventListener('click', (e) => {
    if (e.target.closest('.badge-cuentas-btn') || e.target.closest('.btn-close-custom')) return;
    deseleccionarTodos();
    elementosSeleccionados.add(el);
    el.classList.add('selected');
  });

  el.addEventListener('contextmenu', (e) => {
    if(!modoEdicion) return;
    e.preventDefault();
    e.stopPropagation();

    itemMenuContextual = el;
    deseleccionarTodos();
    elementosSeleccionados.add(el);
    el.classList.add('selected');

    const menu = document.getElementById('context-menu');
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.style.display = 'block';
  });

  actualizarSidebar();
}

function renderMesaBadge(mesaId) {
  const cuentas = mesasData[mesaId] || [];

  // Un ícono de "persona" por cada cuenta abierta, con su total chiquito
  // abajo, y cada ícono lleva directo a SU cuenta al hacer clic.
  const iconosPersonas = cuentas.map((c, idx) => {
    const total = c.productos.reduce((sum, p) => sum + (p.cant * p.precio), 0);
    return `<span class="persona-badge badge-cuentas-btn" onclick="abrirModalCuentas('${mesaId}', ${idx})" title="${c.nombreCuenta} · ${formatMoney(total)}">
      <i class="bi bi-person-fill"></i>
      <span class="persona-total">${formatMoneyCorto(total)}</span>
    </span>`;
  }).join('');

  const botonExtra = cuentas.length === 0
    ? `<span class="persona-badge persona-add badge-cuentas-btn" onclick="abrirModalCuentas('${mesaId}')" title="Abrir cuenta"><i class="bi bi-person-plus-fill"></i></span>`
    : `<span class="persona-badge persona-add badge-cuentas-btn" onclick="agregarCuentaRapida('${mesaId}')" title="Agregar otra cuenta"><i class="bi bi-plus-lg"></i></span>`;

  return `<div class="d-flex align-items-center gap-1 flex-wrap justify-content-center">${iconosPersonas}${botonExtra}</div>`;
}

function actualizarBadgeMesa(mesaId) {
  const el = document.querySelector(`[data-mesaid="${mesaId}"]`);
  if (el) {
    const wrapper = el.querySelector('.cuentas-badge-wrapper');
    if (wrapper) wrapper.innerHTML = renderMesaBadge(mesaId);
  }
}

// Abre el modal de cuentas y, si ya tenía cuentas, dispara el flujo de
// "Nueva Cuenta" para que el ícono "+" agregue una cuenta sin pasos extra.
function agregarCuentaRapida(mesaId) {
  const teniaCuentas = (mesasData[mesaId] || []).length > 0;
  abrirModalCuentas(mesaId, (mesasData[mesaId] || []).length);
  if (teniaCuentas) {
    crearNuevaCuentaEnModal();
  }
}

/* --- PANEL LATERAL FLOTANTE DE CUENTAS ACTIVAS --- */
function actualizarSidebar() {
  const listaContainer = document.getElementById('lista-mesas-sidebar');
  const totalCount = document.getElementById('total-cuentas-count');
  const filtro = document.getElementById('filtroSidebar').value;

  listaContainer.innerHTML = '';
  const items = grids[pisoActual].engine.nodes;

  let sumaTotalCuentas = 0;
  let mesasMostradas = 0;

  items.forEach(node => {
    const el = node.el;
    const mesaContent = el.querySelector('[data-mesaid]');
    if (!mesaContent) return;

    const mesaId = mesaContent.dataset.mesaid;
    const nombreMesa = el.querySelector('.nombre-label').innerText;
    const colorHex = mesaContent.dataset.colorhex || '#0d6efd';

    const cuentas = mesasData[mesaId] || [];
    sumaTotalCuentas += cuentas.length;

    if (filtro === 'ocupadas' && cuentas.length === 0) return;

    mesasMostradas++;

    const li = document.createElement('li');
    li.className = 'list-group-item p-3';

    let cuentasChipsHTML = '';
    if (cuentas.length === 0) {
      cuentasChipsHTML = `<span class="text-muted small fst-italic">Sin cuentas abiertas</span>`;
    } else {
      cuentasChipsHTML = cuentas.map((c, idx) => {
        const total = c.productos.reduce((sum, p) => sum + (p.cant * p.precio), 0);
        return `
          <div class="cuenta-chip d-flex justify-content-between align-items-center bg-light p-2 rounded border mb-1" onclick="abrirModalCuentas('${mesaId}', ${idx})">
            <span class="fw-bold text-dark"><i class="bi bi-receipt me-1 text-primary"></i>${c.nombreCuenta}</span>
            <span class="badge bg-success">${formatMoney(total)}</span>
          </div>
        `;
      }).join('');
    }

    li.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="d-flex align-items-center gap-2" style="cursor: pointer;" onclick="resaltarMesaDesdeSidebar('${node.id}')">
          <span style="width: 12px; height: 12px; background-color: ${colorHex}; border-radius: 50%; display: inline-block;"></span>
          <span class="fw-bold text-dark">${nombreMesa}</span>
        </div>
        <button class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size: 0.75rem;" onclick="abrirModalCuentas('${mesaId}')">
          <i class="bi bi-plus"></i> Cuenta
        </button>
      </div>
      <div>
        ${cuentasChipsHTML}
      </div>
    `;

    listaContainer.appendChild(li);
  });

  if (mesasMostradas === 0) {
    listaContainer.innerHTML = `<li class="list-group-item text-center text-muted py-4 small">No hay mesas con cuentas abiertas en este piso</li>`;
  }

  totalCount.innerText = `${sumaTotalCuentas} ${sumaTotalCuentas === 1 ? 'cuenta' : 'cuentas'}`;

  const fabBadge = document.getElementById('fabCuentasBadge');
  if (fabBadge) {
    fabBadge.innerText = sumaTotalCuentas;
    fabBadge.classList.toggle('d-none', sumaTotalCuentas === 0);
  }

  // actualizarSidebar() se llama tras casi cualquier cambio del plano,
  // así que es el punto ideal para disparar el guardado automático.
  guardarEstado();
}

// Oculto por defecto; se muestra/oculta con el botón flotante (FAB).
function toggleCuentasFlotante() {
  const panel = document.getElementById('panelCuentasFlotante');
  if (!panel) return;
  panel.classList.toggle('oculto');
  if (!panel.classList.contains('oculto')) {
    actualizarSidebar();
  }
}

function resaltarMesaDesdeSidebar(nodeId) {
  const items = grids[pisoActual].engine.nodes;
  const targetNode = items.find(n => n.id === nodeId);

  if (targetNode && targetNode.el) {
    deseleccionarTodos();
    elementosSeleccionados.add(targetNode.el);
    targetNode.el.classList.add('selected');
    targetNode.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function deseleccionarTodos() {
  elementosSeleccionados.forEach(item => item.classList.remove('selected'));
  elementosSeleccionados.clear();
}

document.addEventListener('click', (e) => {
  if(!e.target.closest('.edit-toolbar')) document.querySelectorAll('.color-palette.show').forEach(p=>p.classList.remove('show'));
  if (!e.target.closest('#context-menu')) {
    document.getElementById('context-menu').style.display = 'none';
  }
});

/* --- MENÚ CONTEXTUAL (clic derecho sobre una mesa en modo edición) --- */
function accionDuplicar() {
  if(!verificarModoEdicion()) return;
  document.getElementById('context-menu').style.display = 'none';
  if (!itemMenuContextual) return;

  const content = itemMenuContextual.querySelector('[data-mesaid]');
  const mesaId = content ? content.dataset.mesaid : null;
  const label = itemMenuContextual.querySelector('.nombre-label');
  const node = itemMenuContextual.gridstackNode;
  if (!mesaId || !node) return;

  let x = node.x + 1, y = node.y, w = node.w, h = node.h;
  if (x + w > GRID_COLUMNS) { x = Math.max(0, node.x - 1); y = (node.y || 0) + h; }

  crearElemento({
    id: 'mesa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    nombre: `${label ? label.innerText : 'Mesa'} (copia)`,
    cuentas: JSON.parse(JSON.stringify(mesasData[mesaId] || [])),
    colorHex: content.dataset.colorhex || '#0d6efd',
    w, h, x, y, piso: pisoActual
  });
}

function accionRenombrar() {
  if(!verificarModoEdicion()) return;
  document.getElementById('context-menu').style.display = 'none';
  if (!itemMenuContextual) return;

  const label = itemMenuContextual.querySelector('.nombre-label');
  pedirTexto('Ingresa el nuevo nombre:', label.innerText, (nuevoNombre) => {
    label.innerText = nuevoNombre;
    actualizarSidebar();
  });
}

function accionCambiarColor() {
  if(!verificarModoEdicion()) return;
  document.getElementById('context-menu').style.display = 'none';
  if (!itemMenuContextual) return;

  pedirColor('#198754', (nuevoColor) => {
    elementosSeleccionados.forEach(item => {
      const content = item.querySelector('[data-mesaid]');
      if (!content) return;
      content.style.backgroundColor = hexToRgba(nuevoColor, 0.8);
      content.dataset.colorhex = nuevoColor;
    });
    actualizarSidebar();
  });
}

function accionEliminar() {
  if(!verificarModoEdicion()) return;
  document.getElementById('context-menu').style.display = 'none';
  elementosSeleccionados.forEach(item => {
    const mesaContent = item.querySelector('[data-mesaid]');
    if (!mesaContent) return;
    const mesaId = mesaContent.dataset.mesaid;
    delete mesasData[mesaId];
    grids[pisoActual].removeWidget(item);
  });
  elementosSeleccionados.clear();
  actualizarSidebar();
}

function accionRenombrarElemento(btn){
  if(!verificarModoEdicion()) return; const item=btn.closest('.grid-stack-item'), label=item?.querySelector('.nombre-label'); if(!label)return;
  pedirTexto('Ingresa el nuevo nombre:', label.innerText, (nuevo) => {
    label.innerText = nuevo;
    actualizarSidebar();
  });
}
function togglePaletaColor(btn,event){
  if(!verificarModoEdicion()) return; event.stopPropagation(); const palette=btn.parentElement.querySelector('.color-palette'); document.querySelectorAll('.color-palette.show').forEach(p=>{if(p!==palette)p.classList.remove('show')}); palette.classList.toggle('show');
}
function seleccionarColorElemento(dot,nuevoColor,event){
  if(!verificarModoEdicion()) return; event.stopPropagation(); const item=dot.closest('.grid-stack-item'),content=item?.querySelector('[data-mesaid]'); if(!content)return;
  content.style.backgroundColor=hexToRgba(nuevoColor,.72);content.dataset.colorhex=nuevoColor;dot.closest('.color-palette')?.classList.remove('show');actualizarSidebar();
}
function duplicarElementoEspecifico(btn,piso){
  if(!verificarModoEdicion()) return; const item=btn.closest('.grid-stack-item'),content=item?.querySelector('[data-mesaid]'); if(!content)return;
  const mesaId=content.dataset.mesaid,label=item.querySelector('.nombre-label'),node=item.gridstackNode;
  let x=node?node.x+1:undefined,y=node?node.y:undefined,w=node?node.w:2,h=node?node.h:2;
  if(x!==undefined&&x+w>GRID_COLUMNS){x=Math.max(0,node.x-1);y=(node.y||0)+h;}
  crearElemento({id:'mesa_'+Date.now()+'_'+Math.random().toString(36).substr(2,5),nombre:`${label?label.innerText:'Mesa'} (copia)`,cuentas:JSON.parse(JSON.stringify(mesasData[mesaId]||[])),colorHex:content.dataset.colorhex||'#0d6efd',w,h,x,y,piso});
}

function agregarElementoDesdeFormulario() {
  const nombreInput = document.getElementById('nombreItem').value.trim();
  const tipo = document.getElementById('tipoItem').value;
  const colorHex = colorNuevoSeleccionado;

  let w = 2, h = 2;
  let nombre = nombreInput;

  if (tipo === 'bar') {
    w = 6; h = 2;
    if (!nombre) nombre = 'Bar Principal';
  } else if (tipo === 'mesa_grande') {
    w = 4; h = 2;
    if (!nombre) nombre = `Mesa Grande ${contadorMesas++}`;
  } else if (tipo === 'zona_vip') {
    w = 8; h = 4;
    if (!nombre) nombre = 'Zona VIP';
  } else {
    w = 2; h = 2;
    if (!nombre) nombre = `Mesa ${contadorMesas++}`;
  }

  crearElemento({ nombre, cuentas: [], colorHex, w, h, piso: pisoActual });
  document.getElementById('nombreItem').value = '';
}

function eliminarElementoEspecifico(btn, piso) {
  if(!verificarModoEdicion()) return;
  const item = btn.closest('.grid-stack-item');
  const mesaContent = item.querySelector('[data-mesaid]');
  if (!mesaContent) return;
  const mesaId = mesaContent.dataset.mesaid;
  delete mesasData[mesaId];
  grids[piso].removeWidget(item);
  elementosSeleccionados.delete(item);
  actualizarSidebar();
}
