# Sistema Contable

Aplicación contable de escritorio para registrar cuentas y asientos, y consultar libros y estados financieros. La aplicación ejecuta una interfaz web local, una API Node.js/Express y una base de datos SQLite en el mismo equipo.

Este repositorio contiene **el código fuente seleccionado para la entrega**, no instaladores ni carpetas de compilación. Se excluyen del repositorio las salidas `dist/` y `dist-final/`, las bases de datos locales, las dependencias instaladas y los archivos de pruebas o utilidades de desarrollo. El instalador se puede generar localmente siguiendo la sección [Generar un instalador de Windows](#generar-un-instalador-de-windows).

## Estado y alcance de producción

Esta versión está preparada como aplicación de escritorio local: inicia el backend junto con Electron, usa SQLite persistente, crea el esquema y el catálogo inicial cuando corresponde, valida asientos en el servidor y ofrece funciones de respaldo y restauración.

“Versión de producción” describe aquí la **versión funcional de la aplicación que se entrega**, en contraste con una compilación o prototipo de interfaz. No significa que haya sido auditada, certificada por una autoridad contable o endurecida para exponerla a redes o a varios usuarios. Antes de operar con información financiera real, se deben considerar las limitaciones de seguridad descritas en [Seguridad y uso responsable](#seguridad-y-uso-responsable).

## Funciones

- Mantener un catálogo de cuentas.
- Registrar, editar, eliminar y consultar asientos contables.
- Rechazar asientos que no cumplan las validaciones de partida doble del backend.
- Consultar libro diario, libro mayor, balance general y estado de resultados.
- Consultar el estado de la base de datos y descargar o restaurar una copia SQLite.
- Ejecutarse localmente sin un servidor externo ni una cuenta de servicio en la nube.

La clasificación usada por los reportes se deriva del primer dígito del código de cuenta:

| Primer dígito | Clasificación | Naturaleza |
|---|---|---|
| 1 | Activo | Deudora |
| 2 | Pasivo | Acreedora |
| 3 | Capital contable | Acreedora |
| 4 | Costos y gastos | Deudora |
| 5 | Ingresos | Acreedora |

## Componentes

| Componente | Ubicación | Función |
|---|---|---|
| Interfaz | `index.html`, `src/app.js`, `src/estilos.css` | Interfaz Vue 3, navegación, formularios y reportes. |
| Proceso de escritorio | `electron/main.js`, `electron/preload.js` | Crea la ventana de Electron, define la ubicación de datos e inicia el backend local. |
| API y reglas de negocio | `server/index.js` | Endpoints HTTP, validaciones contables y entrega de la interfaz. |
| Persistencia | `server/db/sqlite.js` | Esquema SQLite, usuario y catálogo iniciales, consultas y operaciones de respaldo. |
| Configuración de dependencias y empaquetado | `package.json`, `package-lock.json` | Scripts, versiones resueltas de dependencias y configuración de Electron Builder. |

### Flujo de ejecución

1. Electron crea la ventana principal y determina el directorio de datos de la aplicación.
2. El proceso principal inicia Express escuchando en `127.0.0.1` y el puerto 3000. Si el puerto está ocupado, el servidor puede probar los siguientes puertos disponibles.
3. El servidor abre o crea la base SQLite, inicializa las tablas y, si corresponde, agrega el usuario y catálogo contable iniciales.
4. Electron carga la interfaz desde el servidor local. La interfaz consulta la API para mostrar y modificar cuentas y asientos.
5. SQLite guarda los datos en disco; no se necesita un proceso de base de datos separado.

## Requisitos

- Windows para ejecutar la aplicación de escritorio y generar el instalador descrito aquí.
- Node.js y npm para ejecutar desde el código fuente.
- Conexión a Internet durante la instalación inicial de dependencias.

La versión de Electron y las dependencias están declaradas en `package.json` y fijadas mediante `package-lock.json`. `better-sqlite3` incluye un módulo nativo; por eso, las dependencias deben instalarse o reconstruirse para el entorno de Electron indicado por el proyecto.

## Instalación y ejecución desde el código fuente

Abre PowerShell en la carpeta que contiene `package.json` y ejecuta:

```powershell
npm install
npm run desktop
```

`npm run desktop` abre la aplicación de escritorio desde el código fuente. **No genera ni publica un instalador.**

Si aparece un error de `better-sqlite3` indicando que el módulo se compiló para otra versión de Node/Electron, reconstruye las dependencias para Electron y vuelve a ejecutar:

```powershell
npm run rebuild:electron
npm run desktop
```

### Ejecutar solo el servidor y la interfaz en el navegador

```powershell
npm start
```

Después abre `http://127.0.0.1:3000`. El servidor se ejecuta en primer plano; para detenerlo, vuelve a la terminal y presiona `Ctrl+C`.

## Datos y persistencia

La aplicación de escritorio guarda su base de datos en el directorio de datos de Electron (`app.getPath('userData')`), con el nombre `sistema_contable.db`. En Windows, el directorio suele estar bajo `%APPDATA%`, dentro de la carpeta correspondiente a la aplicación.

Al ejecutar el servidor directamente con `npm start`, la ruta predeterminada es `data/sistema_contable.db`, relativa al proyecto. El directorio y la base se crean si no existen. También se puede indicar otra ruta mediante la variable `SQLITE_DB_PATH`.

El modo WAL de SQLite puede crear archivos auxiliares `-wal` y `-shm` junto a la base mientras está en uso. No los borres ni copies la base activa manualmente como método de respaldo; utiliza la función de respaldo de la aplicación.

El catálogo contable inicial solo se siembra cuando la tabla de cuentas está vacía. El sistema también crea el usuario inicial si todavía no existe:

- Usuario: `admin`
- Contraseña inicial: `admin123`

No reutilices esa contraseña en un entorno con datos reales. Revisa además las limitaciones de autenticación en la siguiente sección.

## Seguridad y uso responsable

La aplicación está diseñada para uso local. El servidor escucha en `127.0.0.1` de forma predeterminada y no debe exponerse directamente a Internet ni a una red compartida.

**Limitación importante de la implementación actual:** aunque existe un endpoint de inicio de sesión, la interfaz no lo utiliza como control de acceso y los endpoints de cuentas, asientos, usuarios y respaldos no verifican una sesión autenticada. El usuario inicial tampoco debe considerarse una protección efectiva para los datos. El hash de contraseñas implementado con SHA-256 y sal tampoco sustituye un algoritmo moderno de derivación de claves para contraseñas.

Por tanto, esta versión no debe tratarse como un sistema con autenticación o autorización robustas. Antes de almacenar información financiera sensible o habilitar acceso para más de una persona, se requiere implementar y verificar controles de autenticación/autorización en el servidor, mejorar el almacenamiento de contraseñas y revisar el tratamiento de errores, auditoría y permisos del equipo. El uso local reduce la exposición de red, pero no reemplaza esos controles ni las políticas de respaldo y acceso del equipo.

## Respaldo y restauración

En la sección de configuración de la aplicación se puede:

- consultar la ruta y el estado de la base de datos;
- descargar un respaldo SQLite;
- restaurar la base desde un archivo de respaldo.

Antes de restaurar, guarda una copia independiente de la base actual y confirma que el archivo seleccionado corresponde al sistema. La restauración reemplaza los datos locales existentes. Mantén copias periódicas en un lugar seguro, separado del equipo; valida también que puedas restaurarlas.

## Reglas contables aplicadas por el servidor

Al guardar o actualizar un asiento, la API comprueba, entre otras condiciones:

- fecha y concepto obligatorios;
- un mínimo de dos líneas y al menos dos líneas con importe;
- igualdad entre el total del debe y el total del haber, con tolerancia de redondeo;
- importes no negativos;
- que una línea no registre simultáneamente debe y haber.

Los reportes se calculan a partir de los asientos guardados. El sistema no sustituye la revisión de un profesional contable ni determina por sí mismo el cumplimiento de normas fiscales o contables específicas.

## API local

El servidor incluye, entre otros, estos endpoints:

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del servicio. |
| `POST` | `/api/auth/login` | Comprobación de credenciales; no protege actualmente el resto de la API. |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/usuarios` | Operaciones de usuarios. |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/cuentas` | Operaciones del catálogo de cuentas. |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/asientos` | Operaciones de asientos contables. |
| `GET` | `/api/reportes/mayor` | Reporte de libro mayor. |
| `GET` | `/api/reportes/balance` | Reporte de balance general. |
| `GET` | `/api/reportes/resultados` | Estado de resultados. |
| `GET` | `/api/configuracion/estado` | Ruta y estado de la base local. |
| `GET` | `/api/configuracion/respaldo` | Descarga de un respaldo SQLite. |
| `POST` | `/api/configuracion/restaurar` | Restaura un archivo SQLite enviado como binario. |

La API está pensada para el uso de la interfaz local, no como servicio público.

## Generar un instalador de Windows

El instalador es un artefacto generado; **no forma parte del código fuente publicado en GitHub**. En Windows, desde la raíz del proyecto:

```powershell
npm install
npm run dist
```

Electron Builder coloca el resultado en `dist/`; el nombre definido en la configuración actual es `SistemaContable-1.0.0-setup.exe`. Las carpetas de salida están ignoradas por Git y no deben añadirse al repositorio como archivos fuente.

Antes de distribuir un instalador, verifica la compilación en un equipo limpio, la instalación y desinstalación, el primer inicio, la persistencia de datos, el respaldo y la restauración. Distribuye el instalador por un canal adecuado y comunica su versión y suma de verificación a quienes lo reciban.

## Configuración

`.env.example` documenta las variables de entorno usadas al iniciar el servidor directamente:

```env
PORT=3000
DB_TYPE=sqlite
SQLITE_DB_PATH=./data/sistema_contable.db
```

Para usar variables locales, crea `.env` a partir de ese ejemplo y no publiques el archivo `.env`. Al ejecutar Electron, `electron/main.js` establece las rutas y el puerto del backend local.

## Alcance del repositorio

El repositorio está preparado para contener fuentes y archivos necesarios para instalar dependencias y ejecutar o empaquetar la aplicación. `.gitignore` excluye bases de datos y archivos locales (`data/`), dependencias instaladas (`node_modules/`), artefactos generados (`dist/`, `dist-final/`), pruebas y scripts auxiliares. El archivo `.env.example` es una plantilla; no contiene configuración privada.

Las pruebas automatizadas y utilidades de desarrollo no están incluidas en esta entrega de fuentes de producción. No se debe interpretar la ausencia de esos archivos como evidencia de una auditoría o certificación de calidad.
