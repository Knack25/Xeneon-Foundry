import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { PROTOCOL_VERSION } from './protocol.js';

// Deliberately diagnostic-only: no Foundry data, login or command endpoints yet.
export function createServer() {
  return createHttpServer((request,response) => {
    response.setHeader('Content-Type','application/json');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    if (request.url !== '/health') {
      response.writeHead(404);
      response.end(JSON.stringify({error:{code:'not-found',message:'This diagnostic exposes only /health.'}}));
      return;
    }
    // The health response is public, non-sensitive and never permits credentials.
    response.setHeader('Access-Control-Allow-Origin','*');
    if (request.method !== 'GET') {
      response.setHeader('Allow','GET');
      response.writeHead(405);
      response.end(JSON.stringify({error:{code:'method-not-allowed'}}));
      return;
    }
    response.end(JSON.stringify({service:'foundry-edge-connector',protocol:PROTOCOL_VERSION,status:'diagnostic'}));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8790);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createServer();
  server.listen(port,'127.0.0.1',()=>console.log(`Foundry Edge diagnostic listening on 127.0.0.1:${port}`));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close());
}
