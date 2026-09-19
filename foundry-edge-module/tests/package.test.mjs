import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildModule } from '../scripts/build.mjs';
const python = process.platform === 'win32' ? 'python' : 'python3';

test('probe ZIP uses portable paths that extract to the manifest entry point on Linux', async () => {
  const dir = await mkdtemp(join(tmpdir(),'foundry-zip-'));
  try {
    const source = join(dir,'module');
    const archive = join(dir,'probe.zip');
    await buildModule(source);
    const pack = spawnSync(python,[fileURLToPath(new URL('../../scripts/package-foundry-probe.py',import.meta.url)),source,archive],{encoding:'utf8'});
    assert.equal(pack.status,0,pack.stderr);
    const inspect = spawnSync(python,['-c',
      'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps(z.namelist()))',archive],{encoding:'utf8'});
    assert.equal(inspect.status,0,inspect.stderr);
    const names = JSON.parse(inspect.stdout);
    assert.ok(names.includes('scripts/main.js'));
    assert.ok(names.includes('module.json'));
    assert.equal(names.some(name=>name.includes('\\') || name.startsWith('/')),false);
    assert.equal(names.some(name=>name.includes('build.mjs')),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
