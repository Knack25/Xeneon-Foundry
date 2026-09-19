import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('health is readable cross-origin without credentials and unknown routes do not expose data', async () => {
  const server = createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/health`);
    assert.deepEqual(await response.json(),{service:'foundry-edge-connector',protocol:1,status:'diagnostic'});
    assert.equal(response.headers.get('access-control-allow-origin'),'*');
    assert.equal(response.headers.get('access-control-allow-credentials'),null);
    assert.equal((await fetch(`${base}/v1/characters`)).status,404);
    assert.equal((await fetch(`${base}/health`,{method:'POST'})).status,405);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
