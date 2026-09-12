/* ============================================================================
   js/modules/cuentas.js — Gestión de cuentas / comandas por mesa
   ----------------------------------------------------------------------------
   Modal de cuentas: pestañas por cuenta, operador (quien la abrió), tabla
   de productos consumidos, control de cantidades (con impacto en inventario)
   y liquidación de la cuenta (que registra la venta a nombre del operador).
   ========================================================================== */

// Identificador único y estable de cada cuenta / comanda.
function nuevoIdCuenta() {
  return 'cta-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function abrirModalCuentas(mesaId, cuentaIdxTarget = 0) {
  if (!mesasData[mesaId]) mesasData[mesaId] = [];

  // PRIMERA cuenta de la mesa: se pide el nombre igual que en "Nueva Cuenta"
  // (antes se creaba sola como "Cuenta #1" sin preguntar). Si se cancela, no
  // se crea nada ni se abre el modal.
  if (mesasData[mesaId].length === 0) {
    pedirTexto('¿Cómo quieres llamar a esta nueva cuenta?', 'Cuenta #1', (nombre) => {
      mesasData[mesaId].push({
        idCuenta: nuevoIdCuenta(),
        nombreCuenta: nombre,
        productos: [],
        usuarioNombre: obtenerNombreUsuarioActivo()
      });
      actualizarBadgeMesa(mesaId);
      actualizarSidebar();
      mostrarModalCuentasEnMesa(mesaId, 0);
    });
    return;
  }

  mostrarModalCuentasEnMesa(mesaId, cuentaIdxTarget);
}

function mostrarModalCuentasEnMesa(mesaId, cuentaIdxTarget) {
  mesaActivaId = mesaId;
  const el = document.querySelector(`[data-mesaid="${mesaId}"]`);
  const nombreMesa = el ? el.querySelector('.nombre-label').innerText : 'Mesa';
  document.getElementById('modalTitle').innerHTML = `<i class="bi bi-receipt me-2"></i> Cuentas de ${nombreMesa}`;

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
      idCuenta: nuevoIdCuenta(),
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

      const stockRestante = disponibleParaAgregar(p.productId);  // lo que aún se puede sumar
      const stockBadgeClase = stockRestante <= 0 ? 'bg-danger' : stockRestante <= 5 ? 'bg-warning text-dark' : 'bg-secondary';

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
          <span class="badge stock-badge-min ${stockBadgeClase}" title="Unidades que todavía se pueden agregar (stock físico − reservado en comandas)">${stockRestante} disp.</span>
        </td>
        <td class="text-center text-nowrap">
          <button class="btn btn-sm btn-link text-primary p-0 me-2" onclick="abrirMoverProducto(${idx})" title="Mover a otra cuenta (repartir la cuenta)">
            <i class="bi bi-arrow-left-right"></i>
          </button>
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

  // El stock recién se descuenta al liquidar: acá solo se ajusta la comanda
  // y se controla no reservar más de lo que hay físicamente.
  if (delta > 0 && disponibleParaAgregar(prod.productId) <= 0) {
    notificarSinStock(prod.nombre);
    return;
  }

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
  // El producto todavía no descontó stock (se descuenta al liquidar):
  // basta con quitarlo de la comanda.
  cuenta.productos.splice(prodIndex, 1);

  actualizarBadgeMesa(mesaActivaId);
  actualizarSidebar();
  renderModalTabs();
  renderModalContenidoCuenta();
  refrescarVistasInventarioSiEstanAbiertas();
}

function cerrarCuentaActual() {
  const cuentas = mesasData[mesaActivaId];
  const cuenta = cuentas && cuentas[cuentaActivaIndex];
  if (!cuenta) return;
  const total = cuenta.productos.reduce((s, p) => s + p.cant * p.precio, 0);
  descuentoAplicado = null;

  // Cuenta vacía: no hay pago, se cierra directo.
  if (total <= 0) {
    pedirConfirmacion('La cuenta está vacía. ¿Cerrarla igual?', () => {
      hacerLiquidacion(mesaActivaId, cuentaActivaIndex, null);
    });
    return;
  }

  // Con productos: se elige el medio de pago (efectivo / transferencia /
  // tarjeta), se puede repartir entre dos medios, y opcionalmente aplicar
  // un código de descuento antes de confirmar.
  liquidacionPend = { mesaId: mesaActivaId, cuentaIndex: cuentaActivaIndex };
  liquidacionTotalBase = total;
  prepararModalMedioPago();
  modalMedioPagoBS.show();
}

function prepararModalMedioPago() {
  liquidacionTotalPend = liquidacionTotalBase;
  const codigoInput = document.getElementById('medioPagoCodigoInput');
  if (codigoInput) codigoInput.value = '';
  const info = document.getElementById('medioPagoDescuentoInfo');
  if (info) info.innerHTML = '';
  const mixBox = document.getElementById('medioPagoMixtoBox');
  if (mixBox) mixBox.classList.add('d-none');
  ['mpMixEfectivo', 'mpMixTransferencia', 'mpMixTarjeta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
  actualizarTotalMedioPago();
}

// Recalcula lo que hay que pagar (total − descuento) y refresca lo que se
// ve en el modal: el total grande y, si el pago dividido está abierto, su
// resumen de cuánto falta/sobra.
function actualizarTotalMedioPago() {
  liquidacionTotalPend = Math.max(0, liquidacionTotalBase - (descuentoAplicado ? descuentoAplicado.monto : 0));
  const el = document.getElementById('medioPagoTotal');
  if (el) el.textContent = formatMoney(liquidacionTotalPend);
  const mixBox = document.getElementById('medioPagoMixtoBox');
  if (mixBox && !mixBox.classList.contains('d-none')) actualizarResumenMedioPagoMixto();
}

// Valida (contra el servidor) un código de descuento y lo aplica al total
// que se está por cobrar. Cualquiera con sesión puede leer los códigos
// (hace falta para cobrar); solo el admin los crea/edita desde el Dashboard.
async function aplicarCodigoDescuento() {
  const input = document.getElementById('medioPagoCodigoInput');
  const info = document.getElementById('medioPagoDescuentoInfo');
  const codigo = (input ? input.value : '').trim().toUpperCase();
  if (!codigo) return;
  if (!window.db) { if (info) info.innerHTML = '<span class="text-danger">Sin conexión al servidor.</span>'; return; }
  try {
    const filas = await db.list('codigos_descuento', { codigo });
    const cod = filas.find(c => c.codigo === codigo && c.activo);
    if (!cod) {
      descuentoAplicado = null;
      if (info) info.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>Código inválido o inactivo.</span>';
      actualizarTotalMedioPago();
      return;
    }
    const valor = Math.max(0, cod.valor);
    const monto = cod.tipo === 'porcentaje'
      ? Math.round(liquidacionTotalBase * Math.min(100, valor) / 100)
      : Math.min(liquidacionTotalBase, valor);
    descuentoAplicado = { id: cod.id, codigo: cod.codigo, tipo: cod.tipo, valor, monto };
    actualizarTotalMedioPago();
    const etiqueta = cod.tipo === 'porcentaje' ? (valor + '%') : formatMoney(valor);
    if (info) info.innerHTML = `<span class="text-success"><i class="bi bi-check-circle me-1"></i>${etiqueta} de descuento (−${formatMoney(monto)}) aplicado.</span>`;
  } catch (e) {
    if (info) info.innerHTML = '<span class="text-danger">No se pudo validar el código.</span>';
  }
}

function confirmarMedioPago(medio) {
  modalMedioPagoBS.hide();
  if (!liquidacionPend) return;
  const { mesaId, cuentaIndex } = liquidacionPend;
  liquidacionPend = null;
  hacerLiquidacion(mesaId, cuentaIndex, [{ medio, monto: liquidacionTotalPend }]);
}

// Abre/cierra el bloque para repartir el pago entre dos o más medios.
function toggleMedioPagoMixto() {
  const box = document.getElementById('medioPagoMixtoBox');
  if (!box) return;
  box.classList.toggle('d-none');
  if (!box.classList.contains('d-none')) {
    const efvo = document.getElementById('mpMixEfectivo');
    if (efvo) efvo.value = liquidacionTotalPend;
    ['mpMixTransferencia', 'mpMixTarjeta'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 0; });
    actualizarResumenMedioPagoMixto();
  }
}

function actualizarResumenMedioPagoMixto() {
  const val = (id) => Math.max(0, parseFloat(document.getElementById(id).value) || 0);
  const suma = val('mpMixEfectivo') + val('mpMixTransferencia') + val('mpMixTarjeta');
  const dif = liquidacionTotalPend - suma;
  const el = document.getElementById('mpMixResumen');
  const btn = document.getElementById('mpMixConfirmarBtn');
  if (!el || !btn) return;
  if (dif === 0 && suma > 0) {
    el.textContent = 'Cuadra: ' + formatMoney(suma);
    el.className = 'small mt-2 text-success fw-bold';
    btn.disabled = false;
  } else {
    el.textContent = dif > 0 ? ('Falta ' + formatMoney(dif)) : ('Sobran ' + formatMoney(-dif));
    el.className = 'small mt-2 text-danger';
    btn.disabled = true;
  }
}

function confirmarMedioPagoMixto() {
  const val = (id) => Math.max(0, parseFloat(document.getElementById(id).value) || 0);
  const pagos = [
    { medio: 'efectivo', monto: val('mpMixEfectivo') },
    { medio: 'transferencia', monto: val('mpMixTransferencia') },
    { medio: 'tarjeta', monto: val('mpMixTarjeta') }
  ].filter(p => p.monto > 0);
  if (!pagos.length) return;
  modalMedioPagoBS.hide();
  if (!liquidacionPend) return;
  const { mesaId, cuentaIndex } = liquidacionPend;
  liquidacionPend = null;
  hacerLiquidacion(mesaId, cuentaIndex, pagos);
}

function hacerLiquidacion(mesaId, cuentaIndex, pagos) {
  const cuentas = mesasData[mesaId];
  const cuenta = cuentas && cuentas[cuentaIndex];
  if (!cuenta) return;

  registrarVenta(mesaId, cuenta, pagos, descuentoAplicado);
  descuentoAplicado = null;

  cuentas.splice(cuentaIndex, 1);
  if (cuentaActivaIndex >= cuentas.length) {
    cuentaActivaIndex = Math.max(0, cuentas.length - 1);
  }

  actualizarBadgeMesa(mesaId);
  actualizarSidebar();

  if (cuentas.length === 0) {
    modalCuentasBS.hide();
  } else {
    renderModalTabs();
    renderAtendidoPor();
    renderModalContenidoCuenta();
  }

  if (Array.isArray(pagos) && pagos.length) {
    const rotulo = pagos.length === 1
      ? rotuloMedioPago(pagos[0].medio)
      : pagos.map(p => rotuloMedioPago(p.medio) + ' ' + formatMoney(p.monto)).join(' + ');
    mostrarNotificacion('Cuenta liquidada · ' + rotulo, 'success', 'bi-check-circle-fill');
  }
}

/* ---------------------------------------------------------------------------
   Repartir la cuenta: mover uno o varios productos a otra cuenta de la MISMA
   mesa (o a una cuenta nueva) antes de liquidar. El stock no se toca acá: se
   descuenta recién al liquidar (igual que agregar/quitar productos).
   --------------------------------------------------------------------------- */
function abrirMoverProducto(prodIndex) {
  const cuenta = mesasData[mesaActivaId] ? mesasData[mesaActivaId][cuentaActivaIndex] : null;
  const prod = cuenta ? cuenta.productos[prodIndex] : null;
  if (!prod) return;

  moverProductoPend = { mesaId: mesaActivaId, cuentaIndex: cuentaActivaIndex, prodIndex };

  document.getElementById('moverProdNombre').textContent = prod.nombre;
  const cantInput = document.getElementById('moverProdCant');
  cantInput.max = prod.cant;
  cantInput.value = prod.cant;

  const destinoSel = document.getElementById('moverProdDestino');
  const otras = mesasData[mesaActivaId].filter((_, i) => i !== cuentaActivaIndex);
  destinoSel.innerHTML =
    otras.map(c => `<option value="${c.idCuenta}">${c.nombreCuenta}</option>`).join('') +
    `<option value="__nueva__">+ Nueva cuenta…</option>`;

  modalMoverProductoBS.show();
}

function confirmarMoverProducto() {
  if (!moverProductoPend) return;
  const { mesaId, cuentaIndex, prodIndex } = moverProductoPend;
  const cuentas = mesasData[mesaId];
  const origen = cuentas ? cuentas[cuentaIndex] : null;
  const prod = origen ? origen.productos[prodIndex] : null;
  if (!prod) { modalMoverProductoBS.hide(); moverProductoPend = null; return; }

  const cantidad = Math.max(1, Math.min(prod.cant, parseInt(document.getElementById('moverProdCant').value, 10) || 0));
  const destinoSel = document.getElementById('moverProdDestino').value;
  moverProductoPend = null;
  modalMoverProductoBS.hide();

  const aplicarMovimiento = (destino) => {
    const existente = destino.productos.find(p => p.productId && p.productId === prod.productId);
    if (existente) existente.cant += cantidad;
    else destino.productos.push({ productId: prod.productId, nombre: prod.nombre, precio: prod.precio, cant: cantidad });

    prod.cant -= cantidad;
    if (prod.cant <= 0) origen.productos.splice(prodIndex, 1);

    actualizarBadgeMesa(mesaId);
    actualizarSidebar();
    renderModalTabs();
    renderModalContenidoCuenta();
    mostrarNotificacion(`Movido a "${destino.nombreCuenta}"`, 'success', 'bi-arrow-left-right');
  };

  if (destinoSel === '__nueva__') {
    setTimeout(() => {
      pedirTexto('¿Cómo quieres llamar a la nueva cuenta?', `Cuenta #${cuentas.length + 1}`, (nombre) => {
        const nueva = { idCuenta: nuevoIdCuenta(), nombreCuenta: nombre, productos: [], usuarioNombre: obtenerNombreUsuarioActivo() };
        cuentas.push(nueva);
        aplicarMovimiento(nueva);
      });
    }, 350);
    return;
  }

  const destino = cuentas.find(c => c.idCuenta === destinoSel);
  if (destino) aplicarMovimiento(destino);
}
