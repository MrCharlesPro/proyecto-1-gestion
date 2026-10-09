# Contexto del proyecto webapp

Este documento sirve como base de contexto para que otra IA o desarrollador pueda seguir trabajando sobre el proyecto sin necesidad de re-leer todo el repositorio desde cero.

## 1. Resumen ejecutivo

Proyecto Node.js + Express + SQLite orientado a una API REST para gestionar usuarios y tareas.

El sistema usa:
- Express para la API HTTP
- SQLite mediante better-sqlite3 como almacenamiento persistente
- Socket TCP adicional para operaciones simples de inserción/consulta de usuarios
- Jest + Supertest para pruebas automatizadas
- Docker para ejecutar la aplicación en contenedor

La app parece ser una práctica de backend/DevOps con enfoque en:
- CRUD de usuarios
- CRUD de tareas asociadas a usuarios
- backup de base de datos
- reset de la base de datos
- validaciones de entrada
- respuestas estandarizadas con `{ statusCode, data }`

## 2. Estructura del proyecto

```text
webapp/
├── db.js                    # configuración y esquema de SQLite
├── server.js                # API REST principal
├── socket-server.js         # servidor TCP (modo auxiliar)
├── package.json             # scripts y dependencias
├── Dockerfile               # imagen para ejecución en contenedor
├── tests/
│   └── api.test.js          # pruebas de la API
├── node_modules/            # dependencias instaladas
├── data/                   # carpeta de datos (generada en runtime)
├── coverage/                # reportes de cobertura (si se ejecuta)
├── webapp-pruebas.zip       # artefacto de pruebas/copia del proyecto
└── PROJECT_CONTEXT.md       # este documento
```

## 3. Puntos clave del código

### 3.1 Base de datos
Archivo: `db.js`

Responsabilidades:
- Crear la carpeta `data` si no existe
- Crear la carpeta `data/backups` si no existe
- Definir la ruta de la BD (`app.db`)
- Abrir SQLite con `better-sqlite3`
- Habilitar WAL (`journal_mode = WAL`)
- Crear el esquema de tablas `users` y `tasks`

Esquema actual:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Observaciones:
- `tasks.user_id` pertenece a `users.id`
- Se usa `ON DELETE CASCADE`, así que borrar un usuario borra sus tareas
- El email es único por usuario
- `completed` se almacena como `0/1` en SQLite

### 3.2 API REST principal
Archivo: `server.js`

El servidor exporta una instancia de Express y solo arranca el listener si se ejecuta directamente:

```js
if (require.main === module) {
  app.listen(PORT, () => {...});
  require('./socket-server');
}
```

Esto permite importar la app en pruebas sin lanzar sockets reales.

#### Patrón de respuesta
Toda la API usa un formato uniforme:

```json
{ "statusCode": 200, "data": [...] }
```

Función base:

```js
function respond(res, statusCode, data) {
  return res.status(statusCode).json({ statusCode, data });
}
```

Esto aparece en todos los endpoints, incluso en errores 400, 404, 409, etc.

## 4. Funcionalidad actual

### 4.1 Usuarios
Endpoints:
- `GET /api/users` -> listar usuarios
- `GET /api/users/:id` -> obtener usuario por ID
- `POST /api/users` -> crear usuario
- `PUT /api/users/:id` -> actualizar usuario
- `DELETE /api/users/:id` -> borrar usuario

Reglas de validación:
- `id` debe ser entero positivo (regex `/^[1-9]\d*$/`)
- `name` debe ser string no vacío
- `email` debe cumplir formato básico de email
- `email` duplicado => `409 Conflict`
- no encontrado => `404`

### 4.2 Tareas
Endpoints:
- `GET /api/tasks` -> listar tareas
- `GET /api/tasks/:id` -> obtener tarea por ID
- `GET /api/tasks?user_id=...` -> filtrar por usuario
- `POST /api/tasks` -> crear tarea
- `PUT /api/tasks/:id` -> actualizar tarea
- `PATCH /api/tasks/:id/complete` -> marcar como completada
- `DELETE /api/tasks/:id` -> borrar tarea

Reglas de validación:
- `user_id` debe ser un ID válido existente
- `title` debe ser texto no vacío
- `completed` para `PUT` debe ser boolean
- las tareas no existen => `404`

### 4.3 Utilidades y mantenimiento
Endpoints:
- `POST /api/backup` -> hace una copia de la base de datos en `data/backups`
- `DELETE /api/reset` -> borra todas las filas de `tasks` y `users`
- `GET /health` -> health check
- `404` genérico para rutas no encontradas

## 5. Modelo de datos y relaciones

### Usuarios
```json
{
  "id": 1,
  "name": "Ana",
  "email": "ana@test.com",
  "created_at": "2025-01-10 10:10:10"
}
```

### Tareas
```json
{
  "id": 1,
  "user_id": 1,
  "title": "Estudiar Jest",
  "completed": 0,
  "created_at": "2025-01-10 10:12:00"
}
```

Relación:
- 1 usuario tiene muchas tareas
- cada tarea pertenece a un usuario
- al borrar usuario, se borran tareas por cascade

## 6. Socket TCP
Archivo: `socket-server.js`

Además de la API HTTP, hay un servidor TCP en el puerto `6061` por defecto.

Formato soportado:
- `{insert:<element>}`
- `{get:<element>}`

Ejemplos:
```text
{insert:{"name":"Ana","email":"ana@test.com"}}
{get:{"id":1}}
```

Esto parece ser un servicio auxiliar o una extensión experimental dentro del mismo proyecto. No es la ruta principal de trabajo.

## 7. Scripts y ejecución
Archivo: `package.json`

Scripts principales:
- `npm start` -> ejecuta `node server.js`
- `npm test` -> ejecuta Jest
- `npm run test:coverage` -> ejecuta Jest con coverage

Variables de entorno relevantes:
- `PORT` -> puerto HTTP (por defecto `80`)
- `DATA_DIR` -> carpeta donde vive la base de datos (por defecto `./data`)
- `SOCKET_PORT` -> puerto del socket TCP (por defecto `6061`)

Ejemplo de arranque:

```bash
npm install
PORT=3000 DATA_DIR=./data npm start
```

## 8. Pruebas
Archivo: `tests/api.test.js`

Las pruebas cubren:
- creación de usuarios
- validaciones de email, nombre y IDs
- listar usuarios
- obtener por ID
- actualizar y borrar usuarios
- eliminación en cascada de tareas al borrar usuario
- CRUD de tareas
- completado de tareas
- backup y reset
- salud del sistema
- rutas inexistentes

La prueba inicial prepara un directorio temporal para SQLite antes de cargar la aplicación, con esto evita contaminar la BD real.

## 9. Contenedor Docker
Archivo: `Dockerfile`

Configuración básica:
- imagen base: `node:20-alpine`
- instala `python3 make g++` para compatibilidad con dependencias nativas
- copia `package.json` y hace `npm install --omit=dev`
- expone puertos 80 y 6061
- comando final: `node server.js`

## 10. Observaciones de diseño

### Ventajas
- API simple y clara
- persistencia robusta con SQLite
- respuestas estandarizadas
- validaciones útiles para evitar entradas inválidas
- pruebas automatizadas con Jest + Supertest

### Limitaciones / puntos a mejorar
- No hay autenticación ni autorización
- No hay separación de capas (controllers/services/repository)
- No hay middleware central de validación más avanzada
- El socket TCP usa un formato personalizado poco documentado
- El proyecto no tiene `README.md` y necesita documentación de contexto
- No parece haber entorno de producción real, solo práctica o curso

## 11. Recomendaciones para la siguiente IA

Cuando se continúe con este proyecto, conviene empezar por:
1. revisar `server.js` para identificar endpoints
2. revisar `db.js` para entender el esquema y la persistencia
3. revisar `tests/api.test.js` para ver casos de uso esperados
4. evitar romper el contrato de respuesta `{ statusCode, data }`
5. mantener compatibilidad con los tests actuales antes de añadir nuevas funciones
6. usar `DATA_DIR` para pruebas aisladas para no tocar la BD local real

## 12. Estado de trabajo sugerido

Este proyecto está listo como base funcional para:
- añadir endpoints nuevos
- introducir mejoras en validación
- refactorizar a arquitectura más limpia
- preparar despliegue real con Docker o infraestructura externa
- ampliar la cobertura de pruebas

No está pensado como un sistema con autenticación ni multiusuario real en sentido empresarial; es más bien una API CRUD de laboratorio/educación.

## 13. Conclusión

El proyecto es una API REST pequeña pero bien estructurada para practicar persistencia, validación y pruebas en Node.js. La pieza central es `server.js`, y la capa de datos está bien encapsulada en `db.js`.

Si la siguiente IA necesita continuar con una tarea específica, la mejor ruta es mantener el mismo estilo de validación y respuestas de la API, respetar el esquema de SQLite, y usar las pruebas existentes como referencia de comportamiento esperado.
