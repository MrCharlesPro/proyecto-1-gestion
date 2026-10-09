const net = require('net');
const client = net.createConnection(6061, '3.18.221.75', () => {
  client.write('{insert:{"name":"OLAAA2","email":"OLAAA322@test.com"}}');
  //client.write('{get:{"id":1}}');
  //client.write('{get:{}}');
});
client.on('data', (data) => {
  console.log('Respuesta:', data.toString());
  client.end();
});