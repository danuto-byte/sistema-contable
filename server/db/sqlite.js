const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const hashText = (texto, sal) => crypto.createHash('sha256').update(`${sal}::${texto}`).digest('hex');
const uid = () => Math.random().toString(36).slice(2, 10);

const defaultDevDbPath = path.join(__dirname, '../../data/sistema_contable.db');
const appDataDir = process.env.APPDATA || (process.platform === 'win32'
  ? path.join(process.env.USERPROFILE || 'C:/', 'AppData', 'Roaming')
  : path.join(process.env.HOME || '.', '.config'));
const userDataDbPath = path.join(appDataDir, 'Sistema Contable', 'data', 'sistema_contable.db');
const dbPath = process.env.SQLITE_DB_PATH || (process.env.ELECTRON_RUN_AS_NODE === '1' ? userDataDbPath : defaultDevDbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const reopenDatabase = () => {
  try {
    if (db && typeof db.close === 'function') db.close();
  } catch (error) {
    // Se ignora si la conexión ya estaba cerrada.
  }

  const dbFile = dbPath;
  for (const suffix of ['-wal', '-shm']) {
    try {
      if (fs.existsSync(dbFile + suffix)) fs.rmSync(dbFile + suffix, { force: true });
    } catch (error) {
      // Se ignora si aún hay archivos del modo WAL.
    }
  }

  db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  return db;
};

const closeDatabase = () => {
  try {
    if (db && typeof db.close === 'function') db.close();
  } catch (error) {
    // se ignora al cerrar la conexión manualmente
  }
};

const backupDatabase = async (destino) => {
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (error) {
    // Se ignora si aún no hay transacciones pendientes en WAL.
  }

  if (fs.existsSync(destino)) fs.rmSync(destino, { force: true });

  await db.backup(destino);
  return destino;
};

const cuentasBase = [
  { codigo: '1101', nombre: 'Efectivo y Equivalentes' },
  { codigo: '110101', nombre: 'Caja' },
  { codigo: '11010101', nombre: 'Caja General' },
  { codigo: '110102', nombre: 'Bancos' },
  { codigo: '11010201', nombre: 'Cuentas Corrientes' },
  { codigo: '1102', nombre: 'Cuentas y Documentos por Cobrar' },
  { codigo: '110201', nombre: 'Cuentas por Cobrar' },
  { codigo: '11020101', nombre: 'Clientes' },
  { codigo: '1107', nombre: 'Inventarios' },
  { codigo: '110701', nombre: 'Inventarios de Mercaderías' },
  { codigo: '1109', nombre: 'IVA - Crédito Fiscal' },
  { codigo: '110901', nombre: 'IVA por Importaciones' },
  { codigo: '110902', nombre: 'IVA por Compras Locales' },
  { codigo: '1201', nombre: 'Propiedades, Planta y Equipo' },
  { codigo: '120101', nombre: 'Bienes Inmuebles' },
  { codigo: '12010102', nombre: 'Edificios' },
  { codigo: '120102', nombre: 'Mobiliario y Equipo' },
  { codigo: '12010201', nombre: 'Mobiliario y Equipo de Oficina' },
  { codigo: '120103', nombre: 'Equipo de Cómputo' },
  { codigo: '12010301', nombre: 'Equipo de Cómputo' },
  { codigo: '120105', nombre: 'Equipo de Transporte' },
  { codigo: '12010501', nombre: 'Equipo de Transporte' },
  { codigo: '2101', nombre: 'Préstamos por Pagar a Corto Plazo' },
  { codigo: '210101', nombre: 'Préstamos Bancarios' },
  { codigo: '2102', nombre: 'Proveedores' },
  { codigo: '210201', nombre: 'Proveedores Nacionales' },
  { codigo: '2103', nombre: 'Acreedores Varios' },
  { codigo: '210301', nombre: 'Acreedores Diversos' },
  { codigo: '2107', nombre: 'IVA Débito Fiscal' },
  { codigo: '210701', nombre: 'IVA Débito Fiscal Contribuyente' },
  { codigo: '210702', nombre: 'IVA Débito Fiscal Consumidor Final' },
  { codigo: '3101', nombre: 'Capital Social' },
  { codigo: '310101', nombre: 'Capital Social' },
  { codigo: '31010101', nombre: 'Capital Social Suscrito' },
  { codigo: '31010102', nombre: 'Capital Social Pagado' },
  { codigo: '4101', nombre: 'Compras' },
  { codigo: '410101', nombre: 'Compras de Mercaderías' },
  { codigo: '4102', nombre: 'Gastos Administrativos' },
  { codigo: '410201', nombre: 'Papelería y Útiles' },
  { codigo: '410202', nombre: 'Chequera' },
  { codigo: '410203', nombre: 'Alquileres' },
  { codigo: '410204', nombre: 'Otros Gastos' },
  { codigo: '4105', nombre: 'Gastos Financieros' },
  { codigo: '410501', nombre: 'Intereses' },
  { codigo: '410502', nombre: 'Comisiones Bancarias' },
  { codigo: '5101', nombre: 'Ventas' },
  { codigo: '510101', nombre: 'Ventas de Contado' },
  { codigo: '510102', nombre: 'Ventas al Crédito' },
  { codigo: '5102', nombre: 'Devoluciones sobre Compras' },
  { codigo: '510201', nombre: 'Devoluciones de Compras' },
];

const sembrarCatalogoContable = () => {
  const existe = db.prepare('SELECT 1 FROM cuentas LIMIT 1').get();
  if (existe) return;

  const insertar = db.prepare('INSERT INTO cuentas (id, codigo, nombre, estado) VALUES (?, ?, ?, ?)');
  for (const cuenta of cuentasBase) {
    insertar.run(uid(), cuenta.codigo, cuenta.nombre, 'Activa');
  }
};

const initDatabase = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      usuario TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT NOT NULL,
      sal TEXT NOT NULL,
      hash TEXT NOT NULL,
      creado TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cuentas (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Activa'
    );

    CREATE TABLE IF NOT EXISTS asientos (
      id TEXT PRIMARY KEY,
      numero INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      concepto TEXT NOT NULL,
      registradoPor TEXT NOT NULL,
      registradoEn TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asiento_lineas (
      id TEXT PRIMARY KEY,
      asiento_id TEXT NOT NULL,
      codigo TEXT NOT NULL,
      detalle TEXT NOT NULL DEFAULT '',
      debe REAL NOT NULL DEFAULT 0,
      haber REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (asiento_id) REFERENCES asientos(id) ON DELETE CASCADE
    );
  `);

  const adminExists = db.prepare('SELECT 1 FROM users WHERE LOWER(usuario) = LOWER(?)').get('admin');
  if (!adminExists) {
    const sal = uid();
    const id = uid();
    db.prepare(`
      INSERT INTO users (id, usuario, nombre, rol, sal, hash, creado)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'admin', 'Ana Portillo', 'admin', sal, hashText('admin123', sal), new Date().toISOString().slice(0, 10));
  }

  sembrarCatalogoContable();
};

initDatabase();

const listarUsuarios = () => db.prepare('SELECT id, usuario, nombre, rol, creado FROM users ORDER BY usuario ASC').all();
const obtenerUsuarioPorNombre = usuario => db.prepare('SELECT * FROM users WHERE LOWER(usuario) = LOWER(?)').get(usuario);
const insertarUsuario = ({ usuario, nombre, rol, clave }) => {
  const sal = uid();
  const id = uid();
  db.prepare('INSERT INTO users (id, usuario, nombre, rol, sal, hash, creado) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, usuario, nombre, rol, sal, hashText(clave, sal), new Date().toISOString().slice(0, 10));
  return db.prepare('SELECT id, usuario, nombre, rol, creado FROM users WHERE id = ?').get(id);
};
const actualizarUsuario = ({ id, usuario, nombre, rol, clave }) => {
  if (clave) {
    const sal = uid();
    db.prepare('UPDATE users SET usuario = ?, nombre = ?, rol = ?, sal = ?, hash = ? WHERE id = ?')
      .run(usuario, nombre, rol, sal, hashText(clave, sal), id);
  } else {
    db.prepare('UPDATE users SET usuario = ?, nombre = ?, rol = ? WHERE id = ?').run(usuario, nombre, rol, id);
  }
  return db.prepare('SELECT id, usuario, nombre, rol, creado FROM users WHERE id = ?').get(id);
};
const borrarUsuario = id => db.prepare('DELETE FROM users WHERE id = ?').run(id);

const listarCuentas = () => db.prepare('SELECT * FROM cuentas ORDER BY codigo ASC').all();
const insertarCuenta = ({ codigo, nombre, estado = 'Activa' }) => {
  const id = uid();
  db.prepare('INSERT INTO cuentas (id, codigo, nombre, estado) VALUES (?, ?, ?, ?)').run(id, codigo, nombre, estado);
  return db.prepare('SELECT * FROM cuentas WHERE id = ?').get(id);
};
const actualizarCuenta = ({ id, codigo, nombre, estado }) => {
  db.prepare('UPDATE cuentas SET codigo = ?, nombre = ?, estado = ? WHERE id = ?').run(codigo, nombre, estado, id);
  return db.prepare('SELECT * FROM cuentas WHERE id = ?').get(id);
};
const borrarCuenta = id => db.prepare('DELETE FROM cuentas WHERE id = ?').run(id);

const obtenerAsientos = () => {
  const asientos = db.prepare('SELECT * FROM asientos ORDER BY fecha ASC, numero ASC').all();
  return asientos.map(asiento => ({
    ...asiento,
    lineas: db.prepare('SELECT * FROM asiento_lineas WHERE asiento_id = ? ORDER BY id ASC').all(asiento.id),
  }));
};

const siguienteNumero = () => {
  const row = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM asientos').get();
  return Number(row.siguiente);
};

const insertarAsiento = ({ fecha, concepto, lineas, registradoPor }) => {
  const id = uid();
  const numero = siguienteNumero();
  db.prepare('INSERT INTO asientos (id, numero, fecha, concepto, registradoPor, registradoEn) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, numero, fecha, concepto, registradoPor, new Date().toISOString());

  const insertLinea = db.prepare(`
    INSERT INTO asiento_lineas (id, asiento_id, codigo, detalle, debe, haber)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  lineas.forEach(l => {
    insertLinea.run(uid(), id, l.codigo, l.detalle || '', Number(l.debe) || 0, Number(l.haber) || 0);
  });

  return { ...db.prepare('SELECT * FROM asientos WHERE id = ?').get(id), lineas: db.prepare('SELECT * FROM asiento_lineas WHERE asiento_id = ?').all(id) };
};

const actualizarAsiento = ({ id, fecha, concepto, lineas, registradoPor }) => {
  db.prepare('UPDATE asientos SET fecha = ?, concepto = ?, registradoPor = ?, registradoEn = ? WHERE id = ?')
    .run(fecha, concepto, registradoPor, new Date().toISOString(), id);

  db.prepare('DELETE FROM asiento_lineas WHERE asiento_id = ?').run(id);

  const insertLinea = db.prepare(`
    INSERT INTO asiento_lineas (id, asiento_id, codigo, detalle, debe, haber)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  lineas.forEach(l => {
    insertLinea.run(uid(), id, l.codigo, l.detalle || '', Number(l.debe) || 0, Number(l.haber) || 0);
  });

  return { ...db.prepare('SELECT * FROM asientos WHERE id = ?').get(id), lineas: db.prepare('SELECT * FROM asiento_lineas WHERE asiento_id = ?').all(id) };
};

const eliminarAsiento = id => {
  db.prepare('DELETE FROM asientos WHERE id = ?').run(id);
};

module.exports = {
  db,
  initDatabase,
  reopenDatabase,
  closeDatabase,
  backupDatabase,
  hashText,
  uid,
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
};
