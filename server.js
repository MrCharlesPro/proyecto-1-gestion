const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, DB_PATH, BACKUP_DIR } = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 80;

// Helper: respuesta estandarizada { statusCode, data }
function respond(res, statusCode, data) {
  return res.status(statusCode).json({ statusCode, data });
}

// Validaciones reutilizables
const isValidId = (v) => /^[1-9]\d*$/.test(String(v));
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isValidEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// -----------------------------------------------------------------------
// USERS
// -----------------------------------------------------------------------

// 1. GET /api/users - listar todos
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  respond(res, 200, users);
});

// 2. GET /api/users/:id - obtener uno
app.get('/api/users/:id', (req, res) => {
  if (!isValidId(req.params.id)) return respond(res, 400, []);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return respond(res, 404, []);
  respond(res, 200, [user]);
});

// 3. POST /api/users - crear
app.post('/api/users', (req, res) => {
  const { name, email } = req.body || {};
  if (!isNonEmptyString(name) || !isValidEmail(email)) return respond(res, 400, []);
  try {
    const info = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(name.trim(), email);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    respond(res, 201, [user]);
  } catch (err) {
    respond(res, 409, []); // email duplicado
  }
});

// 4. PUT /api/users/:id - actualizar (nuevo)
app.put('/api/users/:id', (req, res) => {
  if (!isValidId(req.params.id)) return respond(res, 400, []);
  const { name, email } = req.body || {};
  if (!isNonEmptyString(name) || !isValidEmail(email)) return respond(res, 400, []);
  try {
    const info = db
      .prepare('UPDATE users SET name = ?, email = ? WHERE id = ?')
      .run(name.trim(), email, req.params.id);
    if (info.changes === 0) return respond(res, 404, []);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    respond(res, 200, [user]);
  } catch (err) {
    respond(res, 409, []); // email duplicado
  }
});

// 5. DELETE /api/users/:id - eliminar
app.delete('/api/users/:id', (req, res) => {
  if (!isValidId(req.params.id)) return respond(res, 400, []);
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return respond(res, 404, []);
  respond(res, 200, []);
});

// -----------------------------------------------------------------------
// TASKS
// -----------------------------------------------------------------------

// 6. GET /api/tasks - listar todas (opcional ?user_id=)
app.get('/api/tasks', (req, res) => {
  const { user_id } = req.query;
  if (user_id !== undefined && !isValidId(user_id)) return respond(res, 400, []);
  const tasks = user_id
    ? db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id').all(user_id)
    : db.prepare('SELECT * FROM tasks ORDER BY id').all();
  respond(res, 200, tasks);
});

// 7. GET /api/tasks/:id - obtener una
app.get('/api/tasks/:id', (req, res) => {
  if (!isValidId(req.params.id)) return respond(res, 400, []);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return respond(res, 404, []);
  respond(res, 200, [task]);
});

// 8. POST /api/tasks - crear
app.post('/api/tasks', (req, res) => {
  const { user_id, title, completed } = req.body || {};
  if (!isValidId(user_id) || !isNonEmptyString(title)) return respond(res, 400, []);
  const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!userExists) return respond(res, 400, []);
  const info = db
    .prepare('INSERT INTO tasks (user_id, title, completed) VALUES (?, ?, ?)')
    .run(user_id, title.trim(), completed ? 1 : 0);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  respond(res, 201, [task]);
});

// 9. PUT /api/tasks/:id - actualizar titulo y estado (nuevo)
app.put('/api/tasks/:id', (req, res) => {
  if (!isValidId(req.params.id)) return respond(res, 400, []);
  const { title, completed } = req.body || {};
  if (!isNonEmptyString(title) || typeof completed !== 'boolean') return respond(res, 400, []);
  const info = db
    .prepare('UPDATE tasks SET title = ?, completed = ? WHERE id = ?')
    .run(title.trim(), completed ? 1 : 0, req.params.id);
  if (info.changes === 0) return respond(res, 404, []);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  respond(res, 200, [task]);
});

// 10. PATCH /api/tasks/:id/complete - marcar como completada (nuevo)
app.patch('/api/tasks/:id/complete', (req, res) => {
  if (!isValidId(req.params.id)) return respond(res, 400, []);
  const info = db.prepare('UPDATE tasks SET completed = 1 WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return respond(res, 404, []);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  respond(res, 200, [task]);
});

// 11. DELETE /api/tasks/:id - eliminar
app.delete('/api/tasks/:id', (req, res) => {
  if (!isValidId(req.params.id)) return respond(res, 400, []);
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return respond(res, 404, []);
  respond(res, 200, []);
});

// -----------------------------------------------------------------------
// BACKUP / RESET
// -----------------------------------------------------------------------

// 12. POST /api/backup - respaldar la BD
app.post('/api/backup', (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `app-${stamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);
  respond(res, 200, [{ file: path.basename(backupPath), created_at: stamp }]);
});

// 13. DELETE /api/reset - vaciar la BD
app.delete('/api/reset', (req, res) => {
  db.exec('DELETE FROM tasks; DELETE FROM users;');
  respond(res, 200, []);
});

// -----------------------------------------------------------------------

app.get('/health', (req, res) => respond(res, 200, [{ status: 'ok prueba charles para entrega' }]));

app.use((req, res) => respond(res, 404, []));

// Manejo de errores (JSON mal formado, etc.) con el mismo formato estandar
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  respond(res, status, []);
});

// Solo arranca los servidores si se ejecuta directamente (no al importar en pruebas)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API escuchando en el puerto ${PORT}`);
  });
  require('./socket-server');
}

module.exports = app;
