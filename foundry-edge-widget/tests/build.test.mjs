import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWidget } from '../scripts/build.mjs';

test('diagnostic package grants only the configured HTTPS host and is XML-head compatible', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'foundry-widget-'));
  try {
    await buildWidget({connectorUrl:'https://vtt.example.test:8443/edge', outdir:dir});
    const manifest = JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
    assert.deepEqual(manifest.permissions, [{type:'url',domain:'vtt.example.test',port:8443}]);
    assert.equal(manifest.interactive, true);
    const html = await readFile(join(dir,'index.html'),'utf8');
    const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
    for (const tag of head.matchAll(/<(?:meta|link)\b[^>]*>/g)) assert.match(tag[0], /\/>$/);
    assert.equal(JSON.parse(await readFile(join(dir,'config.json'),'utf8')).connectorUrl,'https://vtt.example.test:8443/edge');
    assert.match(await readFile(join(dir,'src/protocol.js'),'utf8'), /validateConnectorUrl/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('build rejects insecure or credential-bearing URLs before creating artifacts', async () => {
  await assert.rejects(() => buildWidget({connectorUrl:'https://secret:password@example.test'}), {code:'invalid-url'});
});
