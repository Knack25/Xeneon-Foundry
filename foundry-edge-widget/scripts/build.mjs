import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { validateConnectorUrl } from '../../foundry-edge-connector/src/protocol.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildWidget({connectorUrl, outdir = path.join(root, 'dist')} = {}) {
  const address = validateConnectorUrl(connectorUrl);
  const url = new URL(address);
  await mkdir(outdir, {recursive:true});
  await cp(path.join(root, 'widget'), outdir, {recursive:true});
  await cp(new URL('../../foundry-edge-connector/src/protocol.js', import.meta.url), path.join(outdir, 'src/protocol.js'));
  const manifest = JSON.parse(await readFile(path.join(root, 'widget/manifest.json'), 'utf8'));
  manifest.permissions = [{type:'url',domain:url.hostname,port:Number(url.port || 443)}];
  await writeFile(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(outdir, 'config.json'), JSON.stringify({connectorUrl:address}) + '\n');
  return outdir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(await buildWidget({connectorUrl:process.argv[2]})); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
