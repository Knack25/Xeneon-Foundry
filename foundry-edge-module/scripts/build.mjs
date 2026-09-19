import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../',import.meta.url));
export async function buildModule(outdir = path.join(root,'dist')) {
  await mkdir(outdir,{recursive:true});
  await cp(path.join(root,'module.json'),path.join(outdir,'module.json'));
  await cp(path.join(root,'scripts'),path.join(outdir,'scripts'),{
    recursive:true,filter:source=>!source.endsWith('build.mjs')});
  await cp(new URL('../../foundry-edge-connector/src/protocol.js',import.meta.url),path.join(outdir,'scripts/protocol.js'));
  return outdir;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(await buildModule());
