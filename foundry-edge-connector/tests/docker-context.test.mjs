import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

function matches(pattern,path){
  if(pattern==='**')return true;
  if(pattern.endsWith('/**'))return path.startsWith(pattern.slice(0,-2));
  if(pattern.endsWith('/'))return path.startsWith(pattern);
  return path===pattern;
}

test('Docker context allowlist includes every local Dockerfile COPY source', async () => {
  const root=new URL('../../',import.meta.url);
  const dockerfile=await readFile(new URL('foundry-edge-connector/Dockerfile',root),'utf8');
  const rules=(await readFile(new URL('foundry-edge-connector/Dockerfile.dockerignore',root),'utf8'))
    .split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  const sources=[];
  for(const line of dockerfile.split(/\r?\n/)){
    if(!line.startsWith('COPY ')||line.startsWith('COPY --from='))continue;
    const parts=line.slice(5).trim().split(/\s+/);
    sources.push(...parts.slice(0,-1));
  }
  const excluded=sources.filter(path=>{
    let included=true;
    for(const rule of rules){
      const negated=rule.startsWith('!');
      if(matches(negated?rule.slice(1):rule,path))included=negated;
    }
    return !included;
  });
  assert.deepEqual(excluded,[]);
});
