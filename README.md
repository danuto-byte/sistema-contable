# Sistema Contable

Sistema contable de escritorio desarrollado con Electron, Express y SQLite. La aplicación está orientada a uso local y a persistencia de datos en el equipo del usuario, sin depender de un servidor externo.

## 1. Objetivo

La solución permite:

- registrar cuentas contables,
- generar asientos contables con validación de partida doble,
- consultar libro diario y libro mayor,
- calcular balance general y estado de resultados,
- respaldar y restaurar la base de datos local,
- distribuir la aplicación como instalador de Windows mediante Electron Builder.

La base de datos principal es SQLite y no se migra a otro motor en este proyecto.

## 2. Stack tecnológico

- Frontend: JavaScript + Vue 3 en la capa visual
- Backend: Node.js + Express
- Base de datos: SQLite mediante better-sqlite3
- Desktop: Electron
- Empaque: electron-builder
- Pruebas: Node test runner

## 3. Arquitectura

### 3.1 Capa frontend

El frontend vive en:

- `src/app.js`
- `src/estilos.css`
- `index.html`

La interfaz usa Vue 3 para renderizar módulos de:

- acceso,
- catálogo de cuentas,
- diario contable,
- mayor,
- balance general,
- resultados,
- configuración y respaldos.

### 3.2 Capa backend

El backend se encuentra en:

- `server/index.js`

Incluye endpoints para:

- salud del servicio (`/api/health`),
- autenticación (`/api/auth/login`),
- usuarios,
- cuentas,
- asientos,
- respaldo y restauración,
- consulta de estado de la base de datos.

### 3.3 Capa de persistencia

La capa de datos está en:

- `server/db/sqlite.js`

Responsabilidades:

- definir la ruta de la base SQLite,
- inicializar tablas,
- crear el usuario administrador inicial,
- sembrar el catálogo contable base,
- listar y modificar cuentas,
- insertar, actualizar y consultar asientos,
- respaldar y restaurar la base de datos,
- mantener la conexión SQLite abierta para la API.

### 3.4 Capa desktop

La integración con Electron está en:

- `electron/main.js`

Responsabilidades:

- crear la ventana principal,
- preparar variables de entorno de la app,
- iniciar el backend local dentro de la aplicación,
- abrir la interfaz en localhost,
- mantener el proceso del servidor vivo durante la sesión de escritorio.

## 4. Estructura del proyecto

```text
sistema-contable/
├─ electron/
│  ├─ main.js
│  └─ preload.js
├─ server/
│  ├─ db/
│  │  └─ sqlite.js
│  ├─ data/
│  ├─ config/
│  └─ index.js
├─ src/
│  ├─ app.js
│  ├─ estilos.css
│  └─ assets/
├─ tests/
│  └─ api.test.js
├─ scripts/
│  ├─ cargar_asientos_extra.js
│  └─ verify_backup_restore.js
├─ data/
│  └─ sistema_contable.db
├─ .env.example
├─ package.json
├─ index.html
├─ README.md
└─ .gitignore
```

## 5. Requisitos

- Node.js 18+ recomendado
- npm
- Windows para la generación del instalador final
- Electron 44.4.5 definido en el proyecto

## 6. Instalación y ejecución

### 6.1 Instalar dependencias

```bash
npm install
```

### 6.2 Ejecutar la API directamente

```bash
npm start
```

La API queda disponible en:

```text
http://127.0.0.1:3000
```

### 6.3 Ejecutar la aplicación con Electron

```bash
npm run desktop
```

### 6.4 Ejecutar pruebas

```bash
npm test
```

## 7. Variables de entorno

Archivo base:

```env
PORT=3000
DB_TYPE=sqlite
SQLITE_DB_PATH=./data/sistema_contable.db
```

En la versión empaquetada, la base se guarda bajo el perfil del usuario, típicamente:

```text
%APPDATA%\Sistema Contable\data\sistema_contable.db
```

## 8. Modelo de datos

Las tablas principales son:

- `users`
  - id, usuario, nombre, rol, sal, hash, creado
- `cuentas`
  - id, codigo, nombre, estado
- `asientos`
  - id, numero, fecha, concepto, registradoPor, registradoEn
- `asiento_lineas`
  - id, asiento_id, codigo, detalle, debe, haber

### Regla contable central

La validación de partida doble se realiza en el backend con estas condiciones:

- la suma del debe debe ser igual a la suma del haber,
- cada línea puede tener solo debe o solo haber,
- importe negativo no es permitido,
- cada asiento debe incluir al menos dos cuentas con movimiento.

## 9. Endpoints principales

### Health

```http
GET /api/health
```

Respuesta:

```json
{
  "ok": true,
  "service": "sistema-contable",
  "timestamp": "2026-09-28T00:00:00.000Z"
}
```

### Autenticación

```http
POST /api/auth/login
```

### Usuarios

```http
GET /api/usuarios
POST /api/usuarios
PUT /api/usuarios/:id
DELETE /api/usuarios/:id
```

### Cuentas

```http
GET /api/cuentas
POST /api/cuentas
PUT /api/cuentas/:id
DELETE /api/cuentas/:id
```

### Asientos

```http
GET /api/asientos
POST /api/asientos
PUT /api/asientos/:id
DELETE /api/asientos/:id
```

### Configuración y respaldos

```http
GET /api/configuracion/estado
GET /api/configuracion/respaldo
POST /api/configuracion/restaurar
```

## 10. Reglas contables implementadas

La lógica contable ya está integrada en la aplicación y en el backend:

- clasificación automática por primer dígito de cuenta,
- validación de partida doble,
- mayorización por cuenta,
- cálculo de saldo por naturaleza de la cuenta,
- balance general,
- estado de resultados,
- estructura de asientos con líneas de cargo y abono.

## 11. Empaque con Electron

El proyecto incluye la configuración de `electron-builder` en `package.json`.

Comando:

```bash
npm run dist
```

Esto genera el instalador Windows en:

```text
dist\SistemaContable-1.0.0-setup.exe
```

La aplicación desktop empaqueta la aplicación junto con el backend y guarda la base de datos local en el perfil del usuario, evitando depender de Node.js instalado globalmente en otra máquina.

## 12. Pruebas

El proyecto cuenta con pruebas reales del comportamiento contable y de respaldos:

- salud del servicio,
- catálogo contable,
- validación de asientos,
- rescate de balanza,
- respaldo y restauración,
- cálculo de saldo.

Comando:

```bash
npm test
```

## 13. Consideraciones de diseño

- Se mantiene SQLite como base de datos local y nativa.
- La integración con Electron prioriza la persistencia local del usuario.
- La lógica contable no se reemplaza por una capa externa.
- El proyecto se mantiene orientado a ejecución local, sin requerir infraestructura adicional.

## 14. Usuario inicial

Usuario por defecto:

- usuario: `admin`
- contraseña: `admin123`

## 15. Nota final

Este proyecto está diseñado para ser una aplicación contable local con escritorio, backend propio y persistencia SQLite. La documentación técnica aquí descrita refleja la implementación actual del repositorio y no contempla migración de base de datos ni cambio de motor de almacenamiento.
