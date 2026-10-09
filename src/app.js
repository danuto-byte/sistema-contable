/* =========================================================================
   Sistema contable — capa de presentación (Vue 3)
   Módulos: seguridad · catálogo · libro diario · mayorización · estados
   La persistencia definitiva vive en la API (Node + Express + SQL);
   aquí se usa almacenamiento local del navegador como respaldo temporal.
   ========================================================================= */

/* ---------- 1. Clasificación contable por primer dígito (RF10) ---------- */
const TIPOS = [
  { digito:'1', nombre:'Activo',            natural:'Deudora'   },
  { digito:'2', nombre:'Pasivo',            natural:'Acreedora' },
  { digito:'3', nombre:'Capital contable',  natural:'Acreedora' },
  { digito:'4', nombre:'Costos y gastos',   natural:'Deudora'   },
  { digito:'5', nombre:'Ingresos',          natural:'Acreedora' },
];
const tipoDe = cod => TIPOS.find(t => t.digito === String(cod || '')[0]) || null;
const cuentaBase = codigo => {
  const digitos = String(codigo || '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.length > 4 ? digitos.slice(0, 4) : digitos;
};

/* ---------- 2. Utilidades ---------- */
const fmt = new Intl.NumberFormat('es-SV', { style:'currency', currency:'USD', minimumFractionDigits:2 });
const dinero = n => fmt.format(Math.round((Number(n) || 0) * 100) / 100);
const redondear = n => Math.round((Number(n) || 0) * 100) / 100;
const hoyISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const sello = () => new Date().toLocaleString('es-SV', { dateStyle:'short', timeStyle:'short' });

async function hashear(texto, sal) {
  const datos = sal + '::' + texto;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datos));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < datos.length; i++) h = ((h << 5) + h + datos.charCodeAt(i)) | 0;
  return 'x' + Math.abs(h).toString(16);
}

/* ---------- 3. Respaldo local (opcional) ---------- */
const CLAVE = 'contable:v1';
const disco = {
  async leer() {
    try { const r = await window.storage.get(CLAVE); return r ? JSON.parse(r.value) : null; }
    catch (e) { try { const r = localStorage.getItem(CLAVE); return r ? JSON.parse(r) : null; } catch { return null; } }
  },
  async escribir(datos) {
    try { await window.storage.set(CLAVE, JSON.stringify(datos)); }
    catch (e) { try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* sesión en memoria */ } }
  },
  async limpiar() {
    try { if (window.storage?.remove) await window.storage.remove(CLAVE); }
    catch (e) {}
    try { localStorage.removeItem(CLAVE); } catch (e) {}
  }
};

/* ---------- 4. Datos iniciales de ejemplo ---------- */
const CATALOGO = [];

const ASIENTOS = [];

/* ---------- 5. Aplicación ---------- */
Vue.createApp({
  data() {
    return {
      empresa: 'Comercial San Lorenzo, S.A. de C.V.',
      tipos: TIPOS,
      sesion: { id:'local', usuario:'admin', nombre:'Administrador', rol:'admin' },
      vista: 'dashboard',
      splashVisible: true,
      sidebarCollapsed: false,
      cuentas: [],
      asientos: [],
      periodo: { desde:'2026-01-01', hasta:hoyISO() },
      filtros: { cuenta:'', tipo:'', diario:'', numero:'', mayor:'', mayorTipo:'' },
      expandedMayor: {},
      infoConfiguracion: { dbPath:'', existe:false },
      borrador: null,
      borradorEdicionId: null,
      errores: [],
      modalCuenta: null,
      brindis: null,
      titulos: {
        dashboard:'Panel contable', catalogo:'Catálogo de cuentas', nuevo:'Registrar asiento',
        diario:'Libro diario', mayor:'Libro mayor', balance:'Balance general',
        resultados:'Estado de resultados', configuracion:'Configuración del sistema'
      },
      subtitulos: {
        dashboard:'Situación del ejercicio según los asientos registrados',
        catalogo:'La clasificación se asigna con el primer dígito del código',
        nuevo:'El asiento se guarda solo si el debe iguala al haber',
        diario:'Asientos en orden cronológico',
        mayor:'Se construye solo a partir del diario',
        balance:'Activo igual a pasivo más capital contable',
        resultados:'Ingresos menos costos y gastos',
        configuracion:'Copia de seguridad, restauración y rutas de datos del sistema'
      }
    };
  },

  computed: {
    /* --- permisos --- */
    vistaConPeriodo() { return ['dashboard','diario','mayor','balance','resultados'].includes(this.vista); },
    vistaImprimible() { return ['catalogo','diario','mayor','balance','resultados'].includes(this.vista); },
    hoyLargo() { return new Date().toLocaleDateString('es-SV', { day:'numeric', month:'long', year:'numeric' }); },

    cuentasOrdenadas() { return [...this.cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo)); },
    cuentasActivas() { return this.cuentasOrdenadas.filter(c => c.estado === 'Activa'); },
    cuentasFiltradas() {
      const q = this.filtros.cuenta.toLowerCase();
      return this.cuentasOrdenadas.filter(c =>
        (!q || c.codigo.includes(q) || c.nombre.toLowerCase().includes(q)) &&
        (!this.filtros.tipo || c.codigo[0] === this.filtros.tipo));
    },

    /* --- asientos --- */
    asientosOrdenados() {
      return [...this.asientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
    },
    asientosPeriodo() {
      return this.asientosOrdenados.filter(a => a.fecha >= this.periodo.desde && a.fecha <= this.periodo.hasta);
    },
    ultimosAsientos() { return [...this.asientosPeriodo].reverse().slice(0, 6); },
    siguienteNumero() { return this.asientos.reduce((m, a) => Math.max(m, a.numero), 0) + 1; },
    diarioFiltrado() {
      const q = this.filtros.diario.toLowerCase(), n = this.filtros.numero.trim();
      return this.asientosPeriodo.filter(a => {
        const coincideTexto = !q || a.concepto.toLowerCase().includes(q) ||
          a.lineas.some(l => l.codigo.includes(q) || this.nombreCuenta(l.codigo).toLowerCase().includes(q));
        return coincideTexto && (!n || String(a.numero) === n);
      });
    },
    totalDiario() { return redondear(this.diarioFiltrado.reduce((s, a) => s + this.totalAsiento(a), 0)); },

    /* --- borrador --- */
    totBorradorDebe() { return redondear((this.borrador?.lineas || []).reduce((s, l) => s + (Number(l.debe) || 0), 0)); },
    totBorradorHaber() { return redondear((this.borrador?.lineas || []).reduce((s, l) => s + (Number(l.haber) || 0), 0)); },
    borradorCuadra() {
      return this.totBorradorDebe > 0 && Math.abs(this.totBorradorDebe - this.totBorradorHaber) < 0.005;
    },

    /* --- RF07 mayorización automática --- */
    mayor() {
      const libros = {};
      for (const a of this.asientosPeriodo) {
        for (const l of a.lineas) {
          const codigoMayor = cuentaBase(l.codigo);
          const t = tipoDe(codigoMayor); if (!t) continue;
          const lib = libros[codigoMayor] ||= {
            codigo:codigoMayor, nombre:this.nombreCuenta(codigoMayor), tipo:t.nombre, natural:t.natural,
            movimientos:[], totalDebe:0, totalHaber:0, saldo:0
          };
          lib.totalDebe = redondear(lib.totalDebe + (Number(l.debe) || 0));
          lib.totalHaber = redondear(lib.totalHaber + (Number(l.haber) || 0));
          const bruto = t.natural === 'Deudora'
            ? lib.totalDebe - lib.totalHaber
            : lib.totalHaber - lib.totalDebe;
          lib.saldo = redondear(bruto);
          lib.movimientos.push({
            fecha:a.fecha, numero:a.numero, concepto:l.detalle || a.concepto,
            debe:Number(l.debe) || 0, haber:Number(l.haber) || 0, acumulado:lib.saldo
          });
        }
      }
      return Object.values(libros).sort((a, b) => a.codigo.localeCompare(b.codigo));
    },
    mayorFiltrado() {
      const q = this.filtros.mayor.toLowerCase();
      return this.mayor.filter(m =>
        (!q || m.codigo.includes(q) || m.nombre.toLowerCase().includes(q)) &&
        (!this.filtros.mayorTipo || m.codigo[0] === this.filtros.mayorTipo));
    },

    /* --- RF09 estado de resultados --- */
    res() {
      const porGrupo = d => this.mayor.filter(m => m.codigo[0] === d && Math.abs(m.saldo) > 0.004)
                                     .map(m => ({ codigo:m.codigo, nombre:m.nombre, saldo:m.saldo }));
      const detIngresos = porGrupo('5'), detGastos = porGrupo('4');
      const ingresos = redondear(detIngresos.reduce((s, c) => s + c.saldo, 0));
      const costosGastos = redondear(detGastos.reduce((s, c) => s + c.saldo, 0));
      const utilidad = redondear(ingresos - costosGastos);
      return {
        detIngresos, detGastos, ingresos, costosGastos, utilidad,
        margen: ingresos ? (utilidad / ingresos * 100).toFixed(1) + '%' : '—'
      };
    },

    /* --- RF08 balance general --- */
    bal() {
      const porGrupo = d => this.mayor.filter(m => m.codigo[0] === d && Math.abs(m.saldo) > 0.004)
                                     .map(m => ({ codigo:m.codigo, nombre:m.nombre, saldo:m.saldo }));
      const activos = porGrupo('1'), pasivos = porGrupo('2'), capital = porGrupo('3');
      const suma = l => redondear(l.reduce((s, c) => s + c.saldo, 0));
      const activo = suma(activos), pasivo = suma(pasivos);
      const capitalTotal = redondear(suma(capital) + this.res.utilidad);
      return { activos, pasivos, capital, activo, pasivo, capitalTotal,
               cuadra: Math.abs(activo - pasivo - capitalTotal) < 0.01 };
    },
    balComprobacion() {
      const filas = this.mayor.map(c => {
        const saldoDebe = c.natural === 'Deudora' ? Math.max(c.saldo, 0) : Math.min(c.saldo, 0) * -1;
        const saldoHaber = c.natural === 'Acreedora' ? Math.max(c.saldo, 0) : Math.min(c.saldo, 0) * -1;
        return {
          codigo: c.codigo,
          nombre: c.nombre,
          movDebe: redondear(c.totalDebe),
          movHaber: redondear(c.totalHaber),
          saldoDebe: redondear(saldoDebe),
          saldoHaber: redondear(saldoHaber),
        };
      }).filter(c => c.movDebe > 0.004 || c.movHaber > 0.004 || c.saldoDebe > 0.004 || c.saldoHaber > 0.004);

      const total = filas.reduce((s, c) => ({
        movDebe: s.movDebe + c.movDebe,
        movHaber: s.movHaber + c.movHaber,
        saldoDebe: s.saldoDebe + c.saldoDebe,
        saldoHaber: s.saldoHaber + c.saldoHaber,
      }), { movDebe: 0, movHaber: 0, saldoDebe: 0, saldoHaber: 0 });

      return { filas, total };
    },

    /* --- gráficas --- */
    grafMeses() {
      const meses = {};
      for (const a of this.asientosPeriodo) {
        const k = a.fecha.slice(0, 7);
        const m = meses[k] ||= { ing:0, gas:0 };
        for (const l of a.lineas) {
          if (l.codigo[0] === '5') m.ing += (Number(l.haber) || 0) - (Number(l.debe) || 0);
          if (l.codigo[0] === '4') m.gas += (Number(l.debe) || 0) - (Number(l.haber) || 0);
        }
      }
      const claves = Object.keys(meses).sort().slice(-8);
      if (!claves.length) return [];
      const max = Math.max(...claves.map(k => Math.max(meses[k].ing, meses[k].gas)), 1);
      const nombres = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const paso = 460 / claves.length, w = Math.min(22, paso / 2.6);
      return claves.map((k, i) => {
        const m = meses[k], hI = Math.max(0, m.ing / max * 160), hG = Math.max(0, m.gas / max * 160);
        return { x: 50 + i * paso + (paso - w * 2 - 3) / 2, w,
                 hIng:hI, yIng:200 - hI, hGas:hG, yGas:200 - hG,
                 et: nombres[Number(k.slice(5, 7)) - 1] };
      });
    },
    grafEjeY() {
      if (!this.grafMeses.length) return [];
      const tope = this.grafTope;
      return [0, 0.5, 1].map(p => ({
        y: 204 - p * 160,
        et: tope >= 1000 ? Math.round(tope * p / 1000) + 'k' : Math.round(tope * p)
      }));
    },
    grafTope() {
      let max = 0;
      const meses = {};
      for (const a of this.asientosPeriodo) {
        const k = a.fecha.slice(0, 7); const m = meses[k] ||= { ing:0, gas:0 };
        for (const l of a.lineas) {
          if (l.codigo[0] === '5') m.ing += (Number(l.haber) || 0) - (Number(l.debe) || 0);
          if (l.codigo[0] === '4') m.gas += (Number(l.debe) || 0) - (Number(l.haber) || 0);
        }
      }
      for (const k in meses) max = Math.max(max, meses[k].ing, meses[k].gas);
      return max || 1;
    },
    grafResultado() {
      const d = [
        { et:'Ingresos', v:this.res.ingresos, color:'#2f6b46' },
        { et:'Gastos',   v:this.res.costosGastos, color:'#a3321f' },
        { et:'Resultado',v:Math.abs(this.res.utilidad), color:'#123b34' },
      ];
      const max = Math.max(...d.map(x => x.v), 1);
      return d.map((x, i) => {
        const h = x.v / max * 110;
        return { ...x, x: 30 + i * 90, w:58, h, y:135 - h,
                 val: x.v >= 1000 ? '$' + Math.round(x.v / 1000) + 'k' : '$' + Math.round(x.v) };
      });
    }
  },

  methods: {
    dinero, clasificar(c) { return tipoDe(c)?.nombre || ''; },
    naturaleza(c) { return tipoDe(c)?.natural || ''; },
    nombreCuenta(cod) {
      const codigo = cuentaBase(cod);
      return this.cuentas.find(c => c.codigo === cod || c.codigo === codigo)?.nombre || 'Cuenta no catalogada';
    },
    totalAsiento(a) { return redondear(a.lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0)); },
    saldoCuenta(cod) { return this.mayor.find(m => m.codigo === cuentaBase(cod))?.saldo || 0; },
    puede() {
      return true;
    },
    cerrarSplash() {
      this.splashVisible = false;
      this.vista = 'dashboard';
    },
    ir(v) { this.vista = v; if (v === 'nuevo' && !this.borrador) this.nuevoBorrador(); },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      document.body.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
      const app = document.getElementById('app');
      if (app) app.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
    },
    toggleMayorCuenta(codigo) {
      this.expandedMayor[codigo] = !this.expandedMayor[codigo];
    },
    avisar(texto, tipo) {
      this.brindis = { texto, tipo };
      clearTimeout(this._t); this._t = setTimeout(() => this.brindis = null, 3200);
    },
    anotar(accion, detalle) {
      // Se mantiene solo para compatibilidad del flujo contable, sin pantalla de historial.
      return { accion, detalle, cuando: sello(), usuario: this.sesion?.usuario || 'admin' };
    },
    async api(url, opciones = {}) {
      const base = url.startsWith('/api') ? url : '/api' + (url.startsWith('/') ? url : '/' + url);
      const respuesta = await fetch(base, {
        headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
        ...opciones,
      });
      const texto = await respuesta.text();
      const data = texto ? JSON.parse(texto) : null;
      if (!respuesta.ok) throw new Error(data?.error || 'Error del servidor');
      return data;
    },
    async cargarInfoConfiguracion() {
      try {
        const data = await this.api('/configuracion/estado');
        this.infoConfiguracion = data || { dbPath:'', existe:false };
        return this.infoConfiguracion;
      } catch (error) {
        const fallback = { ok: false, error: error.message, dbPath: '', existe: false };
        this.infoConfiguracion = fallback;
        return fallback;
      }
    },
    async descargarRespaldo() {
      try {
        const respuesta = await fetch('/api/configuracion/respaldo');
        if (!respuesta.ok) throw new Error('No se pudo generar el respaldo.');
        const blob = await respuesta.blob();
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `sistema_contable_backup_${new Date().toISOString().slice(0, 10)}.db`;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        URL.revokeObjectURL(url);
        this.avisar('Copia de seguridad descargada.');
      } catch (error) {
        this.avisar(error.message || 'No se pudo crear la copia de seguridad.', 'error');
      }
    },
    async restaurarRespaldo(event) {
      const archivo = event?.target?.files?.[0];
      if (!archivo) return;
      try {
        const archivoBinario = await archivo.arrayBuffer();
        const respuesta = await fetch('/api/configuracion/restaurar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: archivoBinario,
        });
        const data = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(data?.error || 'No se pudo restaurar el respaldo.');
        await this.cargarDatos();
        this.avisar('Base de datos restaurada correctamente.');
      } catch (error) {
        this.avisar(error.message || 'No se pudo restaurar la base de datos.', 'error');
      } finally {
        event.target.value = '';
      }
    },
    async cargarDatos() {
      try {
        const [cuentas, asientos] = await Promise.all([
          this.api('/cuentas'),
          this.api('/asientos')
        ]);
        this.cuentas = cuentas || [];
        this.asientos = asientos || [];
      } catch (error) {
        this.avisar('No se pudieron refrescar los datos en tiempo real.', 'error');
      }
    },

    /* ---- RF03 catálogo ---- */
    abrirCuenta(c) {
      this.modalCuenta = c ? { ...c, error:'' } : { codigo:'', nombre:'', estado:'Activa', error:'' };
    },
    async guardarCuenta() {
      const m = this.modalCuenta;
      m.error = '';
      if (!/^\d{3,8}$/.test(m.codigo)) { m.error = 'El código debe tener de 3 a 8 dígitos, por ejemplo 11010101.'; return; }
      if (!tipoDe(m.codigo)) { m.error = 'El primer dígito debe ser 1, 2, 3, 4 o 5 para poder clasificar la cuenta.'; return; }
      if (!m.nombre || m.nombre.length < 3) { m.error = 'Escribe el nombre de la cuenta.'; return; }
      if (this.cuentas.some(c => c.codigo === m.codigo && c.id !== m.id)) { m.error = 'Ya existe una cuenta con ese código.'; return; }

      try {
        const payload = { codigo:m.codigo, nombre:m.nombre, estado:m.estado };
        const endpoint = m.id ? '/cuentas/' + m.id : '/cuentas';
        const metodo = m.id ? 'PUT' : 'POST';
        await this.api(endpoint, { method:metodo, body:JSON.stringify(payload) });
        await this.cargarDatos();
        if (m.id) {
          this.anotar('Cuenta editada', m.codigo + ' ' + m.nombre);
          this.avisar('Cuenta actualizada');
        } else {
          this.anotar('Cuenta creada', m.codigo + ' ' + m.nombre);
          this.avisar('Cuenta agregada al catálogo');
        }
      } catch (error) {
        if (m.id) {
          const i = this.cuentas.findIndex(c => c.id === m.id);
          if (i >= 0) this.cuentas[i] = { id:m.id, codigo:m.codigo, nombre:m.nombre, estado:m.estado };
          this.anotar('Cuenta editada', m.codigo + ' ' + m.nombre);
          this.avisar('Cuenta actualizada');
        } else {
          this.cuentas.push({ id:uid(), codigo:m.codigo, nombre:m.nombre, estado:m.estado });
          this.anotar('Cuenta creada', m.codigo + ' ' + m.nombre);
          this.avisar('Cuenta agregada al catálogo');
        }
      }
      this.modalCuenta = null;
    },
    async borrarCuenta(c) {
      if (this.asientos.some(a => a.lineas.some(l => l.codigo === c.codigo))) {
        this.avisar('No se puede eliminar: la cuenta tiene movimientos. Márcala como inactiva.', 'error');
        return;
      }
      if (!confirm('¿Eliminar la cuenta ' + c.codigo + ' ' + c.nombre + '?')) return;
      try {
        await this.api('/cuentas/' + c.id, { method: 'DELETE' });
        await this.cargarDatos();
      } catch (error) {}
      this.cuentas = this.cuentas.filter(x => x.id !== c.id);
      this.anotar('Cuenta eliminada', c.codigo + ' ' + c.nombre);
      this.avisar('Cuenta eliminada');
    },

    /* ---- RF04 y RF05 libro diario con partida doble ---- */
    nuevoBorrador() {
      this.errores = [];
      this.borradorEdicionId = null;
      this.borrador = {
        fecha: hoyISO(), concepto: '',
        lineas: [ { codigo:'', detalle:'', debe:'', haber:'' }, { codigo:'', detalle:'', debe:'', haber:'' } ]
      };
    },
    editarAsiento(a) {
      this.borradorEdicionId = a.id;
      this.borrador = {
        fecha: a.fecha,
        concepto: a.concepto,
        lineas: a.lineas.map(l => ({ codigo: l.codigo, detalle: l.detalle || '', debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 }))
      };
      this.vista = 'nuevo';
      this.errores = [];
    },
    agregarLinea() { this.borrador.lineas.push({ codigo:'', detalle:'', debe:'', haber:'' }); },
    quitarLinea(i) { if (this.borrador.lineas.length > 2) this.borrador.lineas.splice(i, 1); },
    asignarMontoLinea(linea, lado, valor) {
      const texto = String(valor ?? '').trim().replace(',', '.');
      if (texto === '') {
        linea.debe = '';
        linea.haber = '';
        this.validarBorrador();
        return;
      }
      if (!/^\d+(\.\d{0,2})?$|^\.\d{0,2}$/.test(texto)) return;
      const numero = Number(texto);
      const limpio = Number.isFinite(numero) ? Math.max(0, redondear(numero)) : 0;
      if (lado === 'debe') {
        linea.debe = texto;
        linea.haber = '';
      } else {
        linea.haber = texto;
        linea.debe = '';
      }
      this.validarBorrador();
    },
    validarBorrador(forzar = false) {
      if (!this.borrador) { this.errores = []; return []; }
      const b = this.borrador, e = [];
      const tieneDatos = !!(
        (b.concepto || '').trim() ||
        b.lineas.some(l => String(l.codigo || '').trim() || Number(l.debe) || Number(l.haber))
      );
      if (!forzar && !tieneDatos) {
        this.errores = [];
        return [];
      }

      if (!b.fecha) e.push('Indica la fecha del asiento.');
      if (!b.concepto || b.concepto.length < 4) e.push('Escribe un concepto que explique la operación.');
      const utiles = b.lineas.filter(l => l.codigo && ((Number(l.debe) || 0) > 0 || (Number(l.haber) || 0) > 0));
      if (utiles.length < 2) e.push('Un asiento necesita al menos dos cuentas con importe.');
      b.lineas.forEach((l, i) => {
        const d = Number(l.debe) || 0, h = Number(l.haber) || 0;
        if (l.codigo && d === 0 && h === 0) e.push('La línea ' + (i + 1) + ' no tiene importe.');
        if (!l.codigo && (d > 0 || h > 0)) e.push('La línea ' + (i + 1) + ' tiene importe pero no tiene cuenta.');
        if (d > 0 && h > 0) e.push('La línea ' + (i + 1) + ' no puede llevar debe y haber a la vez.');
        if (d < 0 || h < 0) e.push('La línea ' + (i + 1) + ' tiene un importe negativo.');
      });
      if (!this.borradorCuadra) {
        e.push('El debe (' + dinero(this.totBorradorDebe) + ') no iguala al haber (' +
          dinero(this.totBorradorHaber) + '). La partida doble no se cumple.');
      }
      this.errores = [...new Set(e)];
      return e;
    },
    async guardarAsiento() {
      const e = this.validarBorrador(true);
      if (e && e.length) { this.avisar('Corrige los datos señalados', 'error'); return; }

      const payload = {
        fecha: this.borrador.fecha,
        concepto: this.borrador.concepto,
        lineas: this.borrador.lineas.map(l => ({ codigo:l.codigo, detalle:l.detalle || '', debe:redondear(l.debe), haber:redondear(l.haber) })),
        registradoPor: this.sesion.usuario,
      };

      try {
        const endpoint = this.borradorEdicionId ? '/asientos/' + this.borradorEdicionId : '/asientos';
        const method = this.borradorEdicionId ? 'PUT' : 'POST';
        const remoto = await this.api(endpoint, { method, body:JSON.stringify(payload) });
        await this.cargarDatos();
        this.anotar(this.borradorEdicionId ? 'Asiento actualizado' : 'Asiento registrado', (remoto?.numero ? 'N.º ' + remoto.numero : 'Movimiento') + ' por ' + dinero(this.totBorradorDebe));
        this.avisar(this.borradorEdicionId ? 'Asiento actualizado' : 'Asiento guardado');
        this.nuevoBorrador();
        return;
      } catch (error) {
        this.avisar(error.message || 'No se pudo guardar el asiento', 'error');
        return;
      }
    },
    async borrarAsiento(a) {
      if (!confirm('¿Eliminar el asiento n.º ' + a.numero + '? El mayor y los estados se recalculan.')) return;
      try {
        await this.api('/asientos/' + a.id, { method: 'DELETE' });
        await this.cargarDatos();
      } catch (error) {}
      this.asientos = this.asientos.filter(x => x.id !== a.id);
      this.anotar('Asiento eliminado', 'N.º ' + a.numero + ' — ' + a.concepto);
      this.avisar('Asiento eliminado');
    },

    /* ---- RF12 reportes ---- */
    imprimir() { window.print(); },
    exportar() {
      const filas = [];
      const num = n => redondear(n).toFixed(2);
      if (this.vista === 'catalogo') {
        filas.push(['Código','Nombre','Clasificación','Naturaleza','Estado','Saldo']);
        this.cuentasFiltradas.forEach(c => filas.push([c.codigo, c.nombre, this.clasificar(c.codigo),
          this.naturaleza(c.codigo), c.estado, num(this.saldoCuenta(c.codigo))]));
      } else if (this.vista === 'diario') {
        filas.push(['Asiento','Fecha','Concepto','Código','Cuenta','Debe','Haber']);
        this.diarioFiltrado.forEach(a => a.lineas.forEach(l =>
          filas.push([a.numero, a.fecha, a.concepto, l.codigo, this.nombreCuenta(l.codigo), num(l.debe), num(l.haber)])));
      } else if (this.vista === 'mayor') {
        filas.push(['Código','Cuenta','Fecha','Asiento','Concepto','Debe','Haber','Saldo']);
        this.mayorFiltrado.forEach(m => m.movimientos.forEach(mv =>
          filas.push([m.codigo, m.nombre, mv.fecha, mv.numero, mv.concepto, num(mv.debe), num(mv.haber), num(mv.acumulado)])));
      } else if (this.vista === 'balance') {
        filas.push(['Grupo','Código','Cuenta','Saldo']);
        this.bal.activos.forEach(c => filas.push(['Activo', c.codigo, c.nombre, num(c.saldo)]));
        this.bal.pasivos.forEach(c => filas.push(['Pasivo', c.codigo, c.nombre, num(c.saldo)]));
        this.bal.capital.forEach(c => filas.push(['Capital', c.codigo, c.nombre, num(c.saldo)]));
        filas.push(['Capital','','Resultado del período', num(this.res.utilidad)]);
        filas.push(['Totales','','Activo / Pasivo + Capital', num(this.bal.activo) + ' / ' + num(this.bal.pasivo + this.bal.capitalTotal)]);
      } else {
        filas.push(['Grupo','Código','Cuenta','Importe']);
        this.res.detIngresos.forEach(c => filas.push(['Ingresos', c.codigo, c.nombre, num(c.saldo)]));
        this.res.detGastos.forEach(c => filas.push(['Costos y gastos', c.codigo, c.nombre, num(c.saldo)]));
        filas.push(['Resultado','','Utilidad o pérdida', num(this.res.utilidad)]);
      }
      const csv = '\uFEFF' + filas.map(f => f.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
      a.download = this.vista + '-' + this.periodo.hasta + '.csv';
      a.click(); URL.revokeObjectURL(a.href);
      this.avisar('Archivo descargado. Se abre en Excel.');
    },

    /* ---- respaldo ---- */
    respaldar() {
      disco.escribir({ usuarios:this.usuarios, cuentas:this.cuentas, asientos:this.asientos, auditoria:this.auditoria });
    }
  },

  watch: {
    cuentas:   { handler:'respaldar', deep:true },
    asientos:  { handler:'respaldar', deep:true },
    'borrador.fecha': function() { if (this.borrador) this.validarBorrador(); },
    'borrador.concepto': function() { if (this.borrador) this.validarBorrador(); },
    'borrador.lineas': {
      handler() { if (this.borrador) this.validarBorrador(); },
      deep: true
    }
  },

  async mounted() {
    try {
      await this.cargarDatos();
      await this.cargarInfoConfiguracion();
    } catch (error) {
      this.cuentas = [];
      this.asientos = [];
      await disco.escribir({ cuentas:this.cuentas, asientos:this.asientos });
      await this.cargarInfoConfiguracion();
    }
    this.nuevoBorrador();
  }
}).mount('#app');
