require('dotenv').config();

const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const {
  hashText,
  listarUsuarios,
  obtenerUsuarioPorNombre,
  insertarUsuario,
  actualizarUsuario,
  borrarUsuario,
  listarCuentas,
  insertarCuenta,
  actualizarCuenta,
  borrarCuenta,
  obtenerAsientos,
  insertarAsiento,
  actualizarAsiento,
  eliminarAsiento,
  dbPath,
  closeDatabase,
  reopenDatabase,
  initDatabase,
  backupDatabase,
} = require('./db/sqlite');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TIPOS = [
  { digito: '1', nombre: 'Activo', natural: 'Deudora' },
  { digito: '2', nombre: 'Pasivo', natural: 'Acreedora' },
  { digito: '3', nombre: 'Capital contable', natural: 'Acreedora' },
  { digito: '4', nombre: 'Costos y gastos', natural: 'Deudora' },
  { digito: '5', nombre: 'Ingresos', natural: 'Acreedora' },
];

const tipoDe = cod => TIPOS.find(t => t.digito === String(cod || '')[0]) || null;
const cuentaBase = codigo => {
  const digitos = String(codigo || '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.length > 4 ? digitos.slice(0, 4) : digitos;
};
const redondear = n => Math.round((Number(n) || 0) * 100) / 100;
const hoyISO = () => new Date().toISOString().slice(0, 10);
const responderError = (res, status, detalle) => res.status(status).json({ ok: false, error: detalle });
const saldoNatural = (tipo, linea) => {
  const debe = Number(linea.debe) || 0;
  const haber = Number(linea.haber) || 0;
  return tipo && tipo.natural === 'Deudora' ? debe - haber : haber - debe;
};

const validarPartidaDoble = lineas => {
  const debe = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
  const haber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
  if (Math.abs(debe - haber) >= 0.005) return false;

  for (const l of lineas) {
    const d = Number(l.debe) || 0;
    const h = Number(l.haber) || 0;
    if (d < 0 || h < 0) return false;
    if (d > 0 && h > 0) return false;
    if (d === 0 && h === 0 && (l.codigo || '').trim()) return false;
  }

  return true;
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'sistema-contable', timestamp: new Date().toISOString() });
});

app.get('/api/configuracion/estado', (req, res) => {
  const dbExists = fs.existsSync(dbPath);
  res.json({
    ok: true,
    dbPath,
    existe: dbExists,
    wal: fs.existsSync(dbPath + '-wal'),
    shm: fs.existsSync(dbPath + '-shm'),
    fecha: new Date().toISOString(),
  });
});

app.get('/api/configuracion/respaldo', async (req, res) => {
  if (!fs.existsSync(dbPath)) return responderError(res, 404, 'No existe una base de datos para respaldar.');

  try {
    const directorio = path.dirname(dbPath);
    fs.mkdirSync(directorio, { recursive: true });
    const destino = path.join(directorio, `sistema_contable_backup_${hoyISO()}_${Date.now()}.db`);
    await backupDatabase(destino);
    const archivo = fs.readFileSync(destino);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="sistema_contable_backup_${hoyISO()}.db"`);
    res.send(archivo);
    try { fs.rmSync(destino, { force: true }); } catch (error) {}
  } catch (error) {
    responderError(res, 500, 'No se pudo generar el respaldo: ' + error.message);
  }
});

app.post('/api/configuracion/restaurar', express.raw({ type: 'application/octet-stream', limit: '50mb' }), (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return responderError(res, 400, 'No se envió ningún archivo para restaurar.');
    }

    const directorio = path.dirname(dbPath);
    fs.mkdirSync(directorio, { recursive: true });
    const respaldoTemporal = path.join(directorio, `restore_${Date.now()}.db`);
    fs.writeFileSync(respaldoTemporal, req.body);

    closeDatabase();
    for (const suffix of ['-wal', '-shm']) {
      try { if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix, { force: true }); } catch (error) {}
    }
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
    fs.copyFileSync(respaldoTemporal, dbPath);
    fs.rmSync(respaldoTemporal, { force: true });
    reopenDatabase();
    initDatabase();

    res.json({ ok: true, restaurado: true, dbPath });
  } catch (error) {
    return responderError(res, 500, 'No se pudo restaurar la base de datos: ' + error.message);
  }
});

app.get('/api/usuarios', (req, res) => {
  const usuarios = listarUsuarios();
  res.json(usuarios);
});

app.post('/api/usuarios', (req, res) => {
  const { usuario, nombre, rol = 'admin', clave } = req.body || {};
  if (!usuario || !nombre || !clave) return responderError(res, 400, 'Usuario, nombre y contraseña son obligatorios.');
  try {
    const creado = insertarUsuario({ usuario: String(usuario).trim(), nombre: String(nombre).trim(), rol: 'admin', clave: String(clave) });
    res.status(201).json(creado);
  } catch (error) {
    responderError(res, 409, 'Ese usuario ya existe.');
  }
});

app.put('/api/usuarios/:id', (req, res) => {
  const { usuario, nombre, rol = 'admin', clave } = req.body || {};
  if (!usuario || !nombre) return responderError(res, 400, 'Usuario y nombre son obligatorios.');
  const actualizado = actualizarUsuario({ id: req.params.id, usuario: String(usuario).trim(), nombre: String(nombre).trim(), rol: 'admin', clave: clave ? String(clave) : null });
  res.json(actualizado);
});

app.delete('/api/usuarios/:id', (req, res) => {
  borrarUsuario(req.params.id);
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  const u = obtenerUsuarioPorNombre(String(usuario || '').toLowerCase());

  if (!u) return responderError(res, 401, 'Usuario no encontrado');
  if (hashText(String(clave || ''), u.sal) !== u.hash) return responderError(res, 401, 'Contraseña incorrecta');

  const { hash, sal, ...usuarioPublico } = u;
  res.json({
    token: `sql-${u.id}`,
    usuario: { ...usuarioPublico },
  });
});

app.get('/api/cuentas', (req, res) => {
  res.json(listarCuentas());
});

app.post('/api/cuentas', (req, res) => {
  const { codigo, nombre, estado = 'Activa', id } = req.body || {};

  if (!/^\d{3,8}$/.test(String(codigo || ''))) {
    return responderError(res, 400, 'El código debe tener de 3 a 8 dígitos.');
  }
  if (!tipoDe(codigo)) {
    return responderError(res, 400, 'El primer dígito debe corresponder a una cuenta válida.');
  }
  if (!nombre || String(nombre).trim().length < 3) {
    return responderError(res, 400, 'El nombre es obligatorio.');
  }

  if (id) {
    const cuenta = actualizarCuenta({ id, codigo: String(codigo), nombre: String(nombre).trim(), estado: String(estado) });
    return res.json(cuenta);
  }

  try {
    const cuenta = insertarCuenta({ codigo: String(codigo), nombre: String(nombre).trim(), estado: String(estado) });
    return res.status(201).json(cuenta);
  } catch (error) {
    return responderError(res, 409, 'Ese código ya existe en el catálogo.');
  }
});

app.put('/api/cuentas/:id', (req, res) => {
  const { codigo, nombre, estado = 'Activa' } = req.body || {};
  const cuenta = actualizarCuenta({ id: req.params.id, codigo: String(codigo), nombre: String(nombre).trim(), estado: String(estado) });
  res.json(cuenta);
});

app.delete('/api/cuentas/:id', (req, res) => {
  borrarCuenta(req.params.id);
  res.json({ ok: true });
});

app.get('/api/asientos', (req, res) => {
  res.json(obtenerAsientos());
});

app.post('/api/asientos', (req, res) => {
  const { fecha, concepto, lineas = [], registradoPor = 'api' } = req.body || {};
  const ll = Array.isArray(lineas) ? lineas : [];

  if (!fecha) return responderError(res, 400, 'La fecha es obligatoria.');
  if (!concepto || String(concepto).trim().length < 4) return responderError(res, 400, 'El concepto es obligatorio.');
  if (ll.length < 2) return responderError(res, 400, 'El asiento requiere al menos dos líneas.');
  if (!validarPartidaDoble(ll)) return responderError(res, 400, 'Cada línea debe tener solo debe o solo haber, y el asiento debe quedar igualado en monto.');

  const validas = ll.filter(l => l.codigo && ((Number(l.debe) || 0) > 0 || (Number(l.haber) || 0) > 0));
  if (validas.length < 2) return responderError(res, 400, 'Debe haber al menos dos cuentas con importe.');

  const asiento = insertarAsiento({
    fecha,
    concepto: String(concepto).trim(),
    registradoPor,
    lineas: ll.map(l => ({ codigo: String(l.codigo), detalle: String(l.detalle || ''), debe: redondear(l.debe), haber: redondear(l.haber) })),
  });

  res.status(201).json(asiento);
});

app.put('/api/asientos/:id', (req, res) => {
  const { fecha, concepto, lineas = [], registradoPor = 'api' } = req.body || {};
  const ll = Array.isArray(lineas) ? lineas : [];

  if (!fecha) return responderError(res, 400, 'La fecha es obligatoria.');
  if (!concepto || String(concepto).trim().length < 4) return responderError(res, 400, 'El concepto es obligatorio.');
  if (ll.length < 2) return responderError(res, 400, 'El asiento requiere al menos dos líneas.');
  if (!validarPartidaDoble(ll)) return responderError(res, 400, 'Cada línea debe tener solo debe o solo haber, y el asiento debe quedar igualado en monto.');

  const validas = ll.filter(l => l.codigo && ((Number(l.debe) || 0) > 0 || (Number(l.haber) || 0) > 0));
  if (validas.length < 2) return responderError(res, 400, 'Debe haber al menos dos cuentas con importe.');

  const asiento = actualizarAsiento({
    id: req.params.id,
    fecha,
    concepto: String(concepto).trim(),
    registradoPor,
    lineas: ll.map(l => ({ codigo: String(l.codigo), detalle: String(l.detalle || ''), debe: redondear(l.debe), haber: redondear(l.haber) })),
  });

  res.json(asiento);
});

app.delete('/api/asientos/:id', (req, res) => {
  eliminarAsiento(req.params.id);
  res.json({ ok: true });
});

app.get('/api/reportes/mayor', (req, res) => {
  const { desde = '2026-01-01', hasta = hoyISO() } = req.query;
  const mayor = {};
  const asientos = obtenerAsientos().filter(a => a.fecha >= desde && a.fecha <= hasta);

  asientos.forEach(a => {
    a.lineas.forEach(l => {
      const codigoMayor = cuentaBase(l.codigo);
      const t = tipoDe(codigoMayor);
      if (!t) return;

      const cuenta = mayor[codigoMayor] || {
        codigo: codigoMayor,
        nombre: listarCuentas().find(c => c.codigo === codigoMayor)?.nombre || 'Cuenta no catalogada',
        tipo: t.nombre,
        natural: t.natural,
        movimientos: [],
        totalDebe: 0,
        totalHaber: 0,
        saldo: 0,
      };

      cuenta.totalDebe += Number(l.debe) || 0;
      cuenta.totalHaber += Number(l.haber) || 0;
      cuenta.saldo = t.natural === 'Deudora' ? cuenta.totalDebe - cuenta.totalHaber : cuenta.totalHaber - cuenta.totalDebe;
      cuenta.movimientos.push({ fecha: a.fecha, numero: a.numero, concepto: l.detalle || a.concepto, debe: Number(l.debe) || 0, haber: Number(l.haber) || 0, acumulado: cuenta.saldo });
      mayor[codigoMayor] = cuenta;
    });
  });

  res.json(Object.values(mayor).sort((a, b) => a.codigo.localeCompare(b.codigo)));
});

app.get('/api/reportes/balance', (req, res) => {
  const { hasta = hoyISO() } = req.query;
  const cuentas = listarCuentas();
  const saldoPorCuenta = {};

  obtenerAsientos()
    .filter(a => a.fecha <= hasta)
    .forEach(a => {
      a.lineas.forEach(l => {
        const codigoMayor = cuentaBase(l.codigo);
        const tipo = tipoDe(codigoMayor);
        if (!tipo) return;
        saldoPorCuenta[codigoMayor] = (saldoPorCuenta[codigoMayor] || 0) + saldoNatural(tipo, l);
      });
    });

  const activos = Object.entries(saldoPorCuenta)
    .filter(([codigo]) => String(codigo)[0] === '1')
    .map(([codigo, saldo]) => ({ codigo, nombre: cuentas.find(c => c.codigo === codigo)?.nombre || codigo, saldo: redondear(saldo) }));
  const pasivos = Object.entries(saldoPorCuenta)
    .filter(([codigo]) => String(codigo)[0] === '2')
    .map(([codigo, saldo]) => ({ codigo, nombre: cuentas.find(c => c.codigo === codigo)?.nombre || codigo, saldo: redondear(saldo) }));
  const capital = Object.entries(saldoPorCuenta)
    .filter(([codigo]) => String(codigo)[0] === '3')
    .map(([codigo, saldo]) => ({ codigo, nombre: cuentas.find(c => c.codigo === codigo)?.nombre || codigo, saldo: redondear(saldo) }));

  const activo = activos.reduce((s, c) => s + c.saldo, 0);
  const pasivo = pasivos.reduce((s, c) => s + c.saldo, 0);
  const capitalTotal = capital.reduce((s, c) => s + c.saldo, 0);

  res.json({ activos, pasivos, capital, activo, pasivo, capitalTotal, cuadra: Math.abs(activo - pasivo - capitalTotal) < 0.01 });
});

app.get('/api/reportes/resultados', (req, res) => {
  const { desde = '2026-01-01', hasta = hoyISO() } = req.query;
  const mayor = {};

  obtenerAsientos()
    .filter(a => a.fecha >= desde && a.fecha <= hasta)
    .forEach(a => {
      a.lineas.forEach(l => {
        const codigoMayor = cuentaBase(l.codigo);
        const tipo = tipoDe(codigoMayor);
        if (!tipo) return;
        if (!mayor[codigoMayor]) mayor[codigoMayor] = { codigo: codigoMayor, saldo: 0 };
        mayor[codigoMayor].saldo += saldoNatural(tipo, l);
      });
    });

  const ingresos = Object.entries(mayor)
    .filter(([codigo]) => String(codigo)[0] === '5')
    .reduce((s, [, v]) => s + v.saldo, 0);
  const gastos = Object.entries(mayor)
    .filter(([codigo]) => String(codigo)[0] === '4')
    .reduce((s, [, v]) => s + v.saldo, 0);

  const utilidad = ingresos - gastos;
  res.json({ ingresos: redondear(ingresos), costosGastos: redondear(gastos), utilidad: redondear(utilidad) });
});

app.use(express.static(path.join(__dirname, '..')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const portFilePath = process.env.PORT_FILE || path.join(__dirname, '../data/.port');

function writePortFile(port) {
  try {
    fs.mkdirSync(path.dirname(portFilePath), { recursive: true });
    fs.writeFileSync(portFilePath, String(port), 'utf8');
  } catch (error) {
    // Se ignora porque la app puede seguir funcionando sin guardar el puerto.
  }
}

async function startServer(options = {}) {
  const rawPort = Number.parseInt(process.env.PORT || '', 10);
  const preferredPort = options.port ?? (Number.isFinite(rawPort) ? rawPort : 3000);
  const host = options.host ?? '127.0.0.1';

  const tryListen = (port, retriesLeft) => new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = address && typeof address === 'object' ? address.port : port;
      writePortFile(actualPort);
      resolve({ server, port: actualPort, host });
    });

    server.on('error', err => {
      if (err && err.code === 'EADDRINUSE' && port !== 0 && retriesLeft > 0 && options.port === undefined) {
        return resolve(tryListen(port + 1, retriesLeft - 1));
      }
      reject(err);
    });
  });

  return tryListen(preferredPort, 20);
}

async function stopServer(server) {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
}

if (require.main === module) {
  startServer().then(({ port, host }) => {
    console.log(`Servidor activo en http://${host}:${port}`);
  }).catch(err => {
    console.error('Error al iniciar el servidor:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer, stopServer, hashText };
