// Pruebas unitarias / de integracion de la Web App API (Jest + Supertest)
const fs = require('fs');
const os = require('os');
const path = require('path');

// BD temporal aislada: se define ANTES de cargar la app
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'webapp-test-'));
process.env.DATA_DIR = TMP_DIR;

const request = require('supertest');
const app = require('../server');
const { db, BACKUP_DIR } = require('../db');

// Helpers
const crearUsuario = (name = 'Ana', email = 'ana@test.com') =>
  request(app).post('/api/users').send({ name, email });
const crearTarea = (user_id, title = 'Tarea 1', completed) =>
  request(app).post('/api/tasks').send({ user_id, title, completed });

beforeEach(() => {
  db.exec('DELETE FROM tasks; DELETE FROM users; DELETE FROM sqlite_sequence;');
});

afterAll(() => {
  db.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ----------------------------------------------------------------------
describe('POST /api/users - crear usuario', () => {
  test('crea un usuario valido y responde 201', async () => {
    const res = await crearUsuario('Carlos', 'carlos@test.com');
    expect(res.status).toBe(201);
    expect(res.body.statusCode).toBe(201);
    expect(res.body.data[0]).toMatchObject({ id: 1, name: 'Carlos', email: 'carlos@test.com' });
  });

  test('FALLO: sin body responde 400', async () => {
    const res = await request(app).post('/api/users');
    expect(res.status).toBe(400);
    expect(res.body.data).toEqual([]);
  });

  test('FALLO: falta el email responde 400', async () => {
    const res = await request(app).post('/api/users').send({ name: 'Ana' });
    expect(res.status).toBe(400);
  });

  test('FALLO: nombre vacio (solo espacios) responde 400', async () => {
    const res = await crearUsuario('   ', 'a@test.com');
    expect(res.status).toBe(400);
  });

  test('FALLO: email con formato invalido responde 400', async () => {
    const res = await crearUsuario('Ana', 'correo-sin-arroba');
    expect(res.status).toBe(400);
  });

  test('FALLO: tipos de dato incorrectos (name numerico) responde 400', async () => {
    const res = await request(app).post('/api/users').send({ name: 123, email: 'a@test.com' });
    expect(res.status).toBe(400);
  });

  test('FALLO: email duplicado responde 409', async () => {
    await crearUsuario('Ana', 'dup@test.com');
    const res = await crearUsuario('Otra', 'dup@test.com');
    expect(res.status).toBe(409);
  });

  test('FALLO: JSON mal formado responde 400 con formato estandar', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Content-Type', 'application/json')
      .send('{"name": "Ana", ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, data: [] });
  });
});

// ----------------------------------------------------------------------
describe('GET /api/users - listar usuarios', () => {
  test('lista vacia responde 200 y arreglo vacio', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('devuelve todos los usuarios registrados', async () => {
    await crearUsuario('Ana', 'ana@test.com');
    await crearUsuario('Luis', 'luis@test.com');
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((u) => u.name)).toEqual(['Ana', 'Luis']);
  });
});

// ----------------------------------------------------------------------
describe('GET /api/users/:id - obtener usuario', () => {
  test('devuelve el usuario existente', async () => {
    await crearUsuario('Ana', 'ana@test.com');
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body.data[0].email).toBe('ana@test.com');
  });

  test('FALLO: id inexistente responde 404', async () => {
    const res = await request(app).get('/api/users/999');
    expect(res.status).toBe(404);
    expect(res.body.data).toEqual([]);
  });

  test('FALLO: id no numerico responde 400', async () => {
    const res = await request(app).get('/api/users/abc');
    expect(res.status).toBe(400);
  });

  test('FALLO: id negativo responde 400', async () => {
    const res = await request(app).get('/api/users/-5');
    expect(res.status).toBe(400);
  });

  test('FALLO: intento de inyeccion SQL en el id es rechazado (400)', async () => {
    const res = await request(app).get('/api/users/' + encodeURIComponent('1 OR 1=1'));
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------
describe('PUT /api/users/:id - actualizar usuario', () => {
  test('actualiza nombre y email y responde 200', async () => {
    await crearUsuario('Ana', 'ana@test.com');
    const res = await request(app).put('/api/users/1').send({ name: 'Ana Maria', email: 'maria@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ id: 1, name: 'Ana Maria', email: 'maria@test.com' });
  });

  test('FALLO: usuario inexistente responde 404', async () => {
    const res = await request(app).put('/api/users/999').send({ name: 'X', email: 'x@test.com' });
    expect(res.status).toBe(404);
  });

  test('FALLO: body incompleto responde 400', async () => {
    await crearUsuario();
    const res = await request(app).put('/api/users/1').send({ name: 'Solo nombre' });
    expect(res.status).toBe(400);
  });

  test('FALLO: email ya usado por otro usuario responde 409', async () => {
    await crearUsuario('Ana', 'ana@test.com');
    await crearUsuario('Luis', 'luis@test.com');
    const res = await request(app).put('/api/users/2').send({ name: 'Luis', email: 'ana@test.com' });
    expect(res.status).toBe(409);
  });

  test('FALLO: id invalido responde 400', async () => {
    const res = await request(app).put('/api/users/abc').send({ name: 'X', email: 'x@test.com' });
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------
describe('DELETE /api/users/:id - eliminar usuario', () => {
  test('elimina el usuario y ya no se puede consultar', async () => {
    await crearUsuario();
    const del = await request(app).delete('/api/users/1');
    expect(del.status).toBe(200);
    const get = await request(app).get('/api/users/1');
    expect(get.status).toBe(404);
  });

  test('al eliminar un usuario se eliminan sus tareas (ON DELETE CASCADE)', async () => {
    await crearUsuario();
    await crearTarea(1, 'Tarea A');
    await crearTarea(1, 'Tarea B');
    await request(app).delete('/api/users/1');
    const res = await request(app).get('/api/tasks');
    expect(res.body.data).toEqual([]);
  });

  test('FALLO: usuario inexistente responde 404', async () => {
    const res = await request(app).delete('/api/users/999');
    expect(res.status).toBe(404);
  });

  test('FALLO: eliminar dos veces el mismo usuario responde 404 la segunda vez', async () => {
    await crearUsuario();
    await request(app).delete('/api/users/1');
    const res = await request(app).delete('/api/users/1');
    expect(res.status).toBe(404);
  });
});

// ----------------------------------------------------------------------
describe('POST /api/tasks - crear tarea', () => {
  test('crea una tarea asociada a un usuario y responde 201', async () => {
    await crearUsuario();
    const res = await crearTarea(1, 'Estudiar Jest');
    expect(res.status).toBe(201);
    expect(res.body.data[0]).toMatchObject({ id: 1, user_id: 1, title: 'Estudiar Jest', completed: 0 });
  });

  test('crea una tarea ya completada si completed=true', async () => {
    await crearUsuario();
    const res = await crearTarea(1, 'Hecha', true);
    expect(res.body.data[0].completed).toBe(1);
  });

  test('FALLO: sin titulo responde 400', async () => {
    await crearUsuario();
    const res = await request(app).post('/api/tasks').send({ user_id: 1 });
    expect(res.status).toBe(400);
  });

  test('FALLO: sin user_id responde 400', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Huerfana' });
    expect(res.status).toBe(400);
  });

  test('FALLO: user_id inexistente responde 400', async () => {
    const res = await crearTarea(999, 'Sin dueño');
    expect(res.status).toBe(400);
  });

  test('FALLO: titulo vacio responde 400', async () => {
    await crearUsuario();
    const res = await crearTarea(1, '   ');
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------
describe('GET /api/tasks y GET /api/tasks/:id', () => {
  test('lista todas las tareas', async () => {
    await crearUsuario();
    await crearTarea(1, 'T1');
    await crearTarea(1, 'T2');
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  test('filtra tareas por ?user_id=', async () => {
    await crearUsuario('Ana', 'ana@test.com');
    await crearUsuario('Luis', 'luis@test.com');
    await crearTarea(1, 'De Ana');
    await crearTarea(2, 'De Luis');
    const res = await request(app).get('/api/tasks?user_id=2');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('De Luis');
  });

  test('obtiene una tarea por id', async () => {
    await crearUsuario();
    await crearTarea(1, 'Unica');
    const res = await request(app).get('/api/tasks/1');
    expect(res.status).toBe(200);
    expect(res.body.data[0].title).toBe('Unica');
  });

  test('FALLO: tarea inexistente responde 404', async () => {
    const res = await request(app).get('/api/tasks/999');
    expect(res.status).toBe(404);
  });

  test('FALLO: id de tarea no numerico responde 400', async () => {
    const res = await request(app).get('/api/tasks/xyz');
    expect(res.status).toBe(400);
  });

  test('FALLO: filtro ?user_id= invalido responde 400', async () => {
    const res = await request(app).get('/api/tasks?user_id=abc');
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------
describe('PUT /api/tasks/:id - actualizar tarea', () => {
  test('actualiza titulo y estado', async () => {
    await crearUsuario();
    await crearTarea(1, 'Vieja');
    const res = await request(app).put('/api/tasks/1').send({ title: 'Nueva', completed: true });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ title: 'Nueva', completed: 1 });
  });

  test('FALLO: tarea inexistente responde 404', async () => {
    const res = await request(app).put('/api/tasks/999').send({ title: 'X', completed: false });
    expect(res.status).toBe(404);
  });

  test('FALLO: completed no booleano responde 400', async () => {
    await crearUsuario();
    await crearTarea(1);
    const res = await request(app).put('/api/tasks/1').send({ title: 'X', completed: 'si' });
    expect(res.status).toBe(400);
  });

  test('FALLO: titulo vacio responde 400', async () => {
    await crearUsuario();
    await crearTarea(1);
    const res = await request(app).put('/api/tasks/1').send({ title: '', completed: false });
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------
describe('PATCH /api/tasks/:id/complete - completar tarea', () => {
  test('marca la tarea como completada', async () => {
    await crearUsuario();
    await crearTarea(1, 'Pendiente');
    const res = await request(app).patch('/api/tasks/1/complete');
    expect(res.status).toBe(200);
    expect(res.body.data[0].completed).toBe(1);
  });

  test('FALLO: tarea inexistente responde 404', async () => {
    const res = await request(app).patch('/api/tasks/999/complete');
    expect(res.status).toBe(404);
  });

  test('FALLO: id invalido responde 400', async () => {
    const res = await request(app).patch('/api/tasks/abc/complete');
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------
describe('DELETE /api/tasks/:id - eliminar tarea', () => {
  test('elimina la tarea existente', async () => {
    await crearUsuario();
    await crearTarea(1);
    const res = await request(app).delete('/api/tasks/1');
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/tasks/1')).status).toBe(404);
  });

  test('FALLO: tarea inexistente responde 404', async () => {
    const res = await request(app).delete('/api/tasks/999');
    expect(res.status).toBe(404);
  });

  test('FALLO: id invalido responde 400', async () => {
    const res = await request(app).delete('/api/tasks/abc');
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------
describe('POST /api/backup y DELETE /api/reset', () => {
  test('backup genera un archivo .db en la carpeta de respaldos', async () => {
    await crearUsuario();
    const res = await request(app).post('/api/backup');
    expect(res.status).toBe(200);
    const { file } = res.body.data[0];
    expect(file).toMatch(/^app-.*\.db$/);
    expect(fs.existsSync(path.join(BACKUP_DIR, file))).toBe(true);
  });

  test('reset vacia usuarios y tareas', async () => {
    await crearUsuario();
    await crearTarea(1);
    const res = await request(app).delete('/api/reset');
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/users')).body.data).toEqual([]);
    expect((await request(app).get('/api/tasks')).body.data).toEqual([]);
  });
});

// ----------------------------------------------------------------------
describe('Rutas generales', () => {
  test('GET /health responde ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('ok');
  });

  test('FALLO: ruta inexistente responde 404 con formato estandar', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ statusCode: 404, data: [] });
  });

  test('FALLO: metodo no soportado (PUT /api/reset) responde 404', async () => {
    const res = await request(app).put('/api/reset');
    expect(res.status).toBe(404);
  });
});
