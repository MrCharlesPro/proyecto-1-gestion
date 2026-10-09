const net = require('net');
const { db } = require('./db');

const SOCKET_PORT = process.env.SOCKET_PORT || 6061;

function respond(socket, statusCode, data) {
  socket.write(JSON.stringify({ statusCode, data }) + '\n');
}

function handleInsert(socket, element) {
  try {
    const { name, email } = element;
    if (!name || !email) return respond(socket, 400, []);
    const info = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(name, email);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    respond(socket, 201, [user]);
  } catch (err) {
    respond(socket, 500, [{ error: err.message }]);
  }
}

function handleGet(socket, element) {
  try {
    if (element && element.id) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(element.id);
      return respond(socket, user ? 200 : 404, user ? [user] : []);
    }
    const users = db.prepare('SELECT * FROM users').all();
    respond(socket, 200, users);
  } catch (err) {
    respond(socket, 500, [{ error: err.message }]);
  }
}

// Extrae el JSON interno de {insert:{...}} o {get:{...}}
function parseCommand(raw) {
  const text = raw.trim();
  let match = text.match(/^\{insert:(.*)\}$/s);
  if (match) return { cmd: 'insert', body: JSON.parse(match[1]) };
  match = text.match(/^\{get:(.*)\}$/s);
  if (match) return { cmd: 'get', body: JSON.parse(match[1]) };
  return null;
}

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    try {
      const parsed = parseCommand(chunk);
      if (!parsed) {
        return respond(socket, 400, [{ error: 'Formato inválido. Use {insert:<element>} o {get:<element>}' }]);
      }
      if (parsed.cmd === 'insert') handleInsert(socket, parsed.body);
      if (parsed.cmd === 'get') handleGet(socket, parsed.body);
    } catch (err) {
      respond(socket, 400, [{ error: 'JSON inválido dentro de <element>' }]);
    }
  });
  socket.on('error', () => {});
});

server.listen(SOCKET_PORT, '0.0.0.0', () => {
  console.log(`Socket TCP escuchando en el puerto ${SOCKET_PORT}`);
});

module.exports = server;