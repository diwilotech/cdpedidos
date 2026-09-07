/* ============================================================================
   js/modules/cuentas.js — Gestión de cuentas / comandas por mesa
   ----------------------------------------------------------------------------
   Modal de cuentas: pestañas por cuenta, operador (quien la abrió), tabla
   de productos consumidos, control de cantidades (con impacto en inventario)
   y liquidación de la cuenta (que registra la venta a nombre del operador).
   ========================================================================== */

function abrirModalCuentas(mesaId, cuentaIdxTarget = 0) {
  mesaActivaId = mesaId;
  const el = document.querySelector(`[data-mesaid="${mesaId}"]`);
  const nombreMesa = el ? el.querySelector('.nombre-label').innerText : 'Mesa';

  document.getElementById('modalTitle').innerHTML = `<i class="bi bi-receipt me-2"></i> Cuentas de ${nombreMesa}`;

  if (!mesasData[mesaId]) {
    mesasData[mesaId] = [];
  }

  // Si la mesa no tiene cuentas, inicializa UNA cuenta exclusiva para ESA mesa.
  if (mesasData[mesaId].length === 0) {
    mesasData[mesaId].push({
      idCuenta: Date.now(),
      nombreCuenta: 'Cuenta #1',
      productos: [],
      usuarioNombre: obtenerNombreUsuarioActivo()   // queda a nombre de quien la abre
    });
    actualizarBadgeMesa(mesaId);
    actualizarSidebar();
  }

  cuentaActivaIndex = cuentaIdxTarget < mesasData[mesaId].length ? cuentaIdxTarget : 0;

  renderModalTabs();
  renderAtendidoPor();
  renderModalContenidoCuenta();
  modalCuentasBS.show();
}

function renderModalTabs() {
  const tabsContainer = document.getElementById('cuentasTabs');
  tabsContainer.innerHTML = '';

  const cuentas = mesasData[mesaActivaId] || [];

  cuentas.forEach((cuenta, idx) => {
    const total = cuenta.productos.reduce((acc, p) => acc + (p.cant * p.precio), 0);

    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `
      <button class="nav-link ${idx === cuentaActivaIndex ? 'active' : ''} py-1 px-3 me-1" onclick="seleccionarCuentaTab(${idx})">
        ${cuenta.nombreCuenta} <span class="badge bg-light text-dark ms-1">${formatMoney(total)}</span>
      </button>
    `;
    tabsContainer.appendChild(li);
  });
}

function seleccionarCuentaTab(idx) {
  cuentaActivaIndex = idx;
  renderModalTabs();
  renderAtendidoPor();
  renderModalContenidoCuenta();
}

function crearNuevaCuentaEnModal() {
  const cuentas = mesasData[mesaActivaId];
  const numNueva = cuentas.length + 1;
  const nombreSugerido = `Cuenta #${numNueva}`;

  pedirTexto('¿Cómo quieres llamar a esta nueva cuenta?', nombreSugerido, (nombre) => {
    cuentas.push({
      idCuenta: Date.now(),
      nombreCuenta: nombre,
      productos: [],
      usuarioNombre: obtenerNombreUsuarioActivo()   // queda a nombre de quien la abre
    });

    cuentaActivaIndex = cuentas.length - 1;

    actualizarBadgeMesa(mesaActivaId);
    actualizarSidebar();
    renderModalTabs();
    renderAtendidoPor();
    renderModalContenidoCuenta();
  });
}

// Muestra (solo lectura) a nombre de quién quedó la cuenta activa. Se asigna
// sola a quien inicia sesión; ya no hay selector de mesero.
function renderAtendidoPor() {
  const el = document.getElementById('cuentaAtendidoPor');
  if (!el) return;
  const cuenta = mesasData[mesaActivaId] ? mesasData[mesaActivaId][cuentaActivaIndex] : null;
  el.textContent = (cuenta && cuenta.usuarioNombre) || obtenerNombreUsuarioActivo();
}

function renombrarCuentaActiva() {
  const cuenta = mesasData[mesaActivaId] ? mesasData[mesaActivaId][cuentaActivaIndex] : null;
  if (!cuenta) return;

  pedirTexto('Nombre de la cuenta:', cuenta.nombreCuenta, (nuevoNombre) => {
    cuenta.nombreCuenta = nuevoNombre;
    actualizarSidebar();
    renderModalTabs();
  });
}

function renderModalContenidoCuenta() {
  const cuenta = mesasData[mesaActivaId] ? mesasData[mesaActivaId][cuentaActivaIndex] : null;
  const tbody = document.getElementById('tablaProductosBody');
  tbody.innerHTML = '';

  if (!cuenta) return;

  let totalGlobal = 0;

  if (cuenta.productos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No hay productos añadidos. Utiliza el botón <strong>Catálogo de Productos</strong> para agregar consumos.</td></tr>`;
  } else {
    cuenta.productos.forEach((p, idx) => {
      const subtotal = p.cant * p.precio;
      totalGlobal += subtotal;

      const stockRestante = obtenerStock(p.productId);
      const stockBadgeClase = stockRestante === 0 ? 'bg-danger' : stockRestante <= 5 ? 'bg-warning text-dark' : 'bg-secondary';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-bold">${p.nombre}</td>
        <td class="text-center">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary py-0 px-1" onclick="modificarCantidadProducto(${idx}, -1)">-</button>
            <span class="btn btn-light disabled py-0 px-2 fw-bold text-dark">${p.cant}</span>
            <button class="btn btn-outline-secondary py-0 px-1" onclick="modificarCantidadProducto(${idx}, 1)">+</button>
          </div>
        </td>
        <td class="text-end">${formatMoney(p.precio)}</td>
        <td class="text-end fw-bold">${formatMoney(subtotal)}</td>
        <td class="text-center">
          <span class="badge stock-badge-min ${stockBadgeClase}" title="Unidades disponibles en inventario">${stockRestante} und.</span>
        </td>
        <td class="text-center">
          <button class="btn btn-sm btn-link text-danger p-0" onclick="eliminarProducto(${idx})" title="Eliminar Producto">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('totalCuentaTexto').innerText = formatMoney(totalGlobal);
}

function modificarCantidadProducto(prodIndex, delta) {
  const cuenta = mesasData[mesaActivaId][cuentaActivaIndex];
  const prod = cuenta.productos[prodIndex];

  // Si se sube la cantidad se necesita 1 unidad más del inventario;
  // si ya no queda stock, no se permite subir.
  if (delta > 0 && obtenerStock(prod.productId) <= 0) {
    notificarSinStock(prod.nombre);
    return;
  }

  ajustarStock(prod.productId, -delta, delta > 0 ? 'Venta' : 'Devolución (se bajó cantidad en cuenta)');
  prod.cant += delta;

  if (prod.cant <= 0) {
    cuenta.productos.splice(prodIndex, 1);
  }

  actualizarBadgeMesa(mesaActivaId);
  actualizarSidebar();
  renderModalTabs();
  renderModalContenidoCuenta();
  refrescarVistasInventarioSiEstanAbiertas();
}

function eliminarProducto(prodIndex) {
  const cuenta = mesasData[mesaActivaId][cuentaActivaIndex];
  const prod = cuenta.productos[prodIndex];

  // Al quitar el producto de la cuenta, todas sus unidades vuelven al inventario.
  ajustarStock(prod.productId, prod.cant, 'Devolución (producto quitado de cuenta)');

  cuenta.productos.splice(prodIndex, 1);

  actualizarBadgeMesa(mesaActivaId);
  actualizarSidebar();
  renderModalTabs();
  renderModalContenidoCuenta();
  refrescarVistasInventarioSiEstanAbiertas();
}

function cerrarCuentaActual() {
  pedirConfirmacion('¿Deseas liquidar y cerrar esta cuenta?', () => {
    const cuentas = mesasData[mesaActivaId];
    const cuenta = cuentas[cuentaActivaIndex];

    registrarVenta(mesaActivaId, cuenta);

    cuentas.splice(cuentaActivaIndex, 1);

    if (cuentaActivaIndex >= cuentas.length) {
      cuentaActivaIndex = Math.max(0, cuentas.length - 1);
    }

    actualizarBadgeMesa(mesaActivaId);
    actualizarSidebar();

    if (cuentas.length === 0) {
      modalCuentasBS.hide();
    } else {
      renderModalTabs();
      renderAtendidoPor();
      renderModalContenidoCuenta();
    }
  });
}
