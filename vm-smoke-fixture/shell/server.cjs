const http = require('node:http');

const port = Number(process.argv[2]);
const label = process.argv[3] || 'project';
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(`${label} healthy\n`);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`${label} listening at http://localhost:${port}`);
});

setInterval(() => {
  console.log(`${label} heartbeat ${new Date().toISOString()}`);
}, 2_000);
