import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseManifest} from '../src/manifest.js';

const encoder=new TextEncoder();
const allowedAssetOrigins=new Set(['https://github.com']);
const bytes=value=>encoder.encode(typeof value==='string'?value:JSON.stringify(value));
const clone=value=>structuredClone(value);

const valid = {
  schemaVersion:1,
  releaseId:'2026.09.20-test.1',
  channel:'test',
  publishedAt:'2026-09-20T18:00:00.000Z',
  notes:'First signed updater compatibility fixture.',
  components:{
    connector:{version:'0.2.0',image:'ghcr.io/knack25/xeneon-foundry/connector@sha256:'+'a'.repeat(64)},
    dashboard:{version:'0.2.0',bundledIn:'connector'},
    module:{version:'0.2.0',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge-module.zip',sha256:'b'.repeat(64),size:1048576},
    edgePackage:{version:'0.1.0',installation:'manual',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge.icuewidget',sha256:'c'.repeat(64),size:2097152}
  },
  compatibility:{
    foundry:{minimum:'14.367',maximum:'14.367'},
    system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'},
    protocol:{minimum:1,maximum:1},
    dataSchema:{minimum:1,maximum:1}
  }
};

const parse=value=>parseReleaseManifest(bytes(value),{allowedAssetOrigins});
const expectInvalid=value=>assert.throws(()=>parse(value),{code:'invalid-release-manifest'});

test('parses a detached recursively frozen release manifest', () => {
  const input=clone(valid);
  const manifest=parse(input);
  input.components.connector.version='9.9.9';
  assert.deepEqual(manifest,valid);
  assert.equal(Object.isFrozen(manifest),true);
  assert.equal(Object.isFrozen(manifest.components),true);
  assert.equal(Object.isFrozen(manifest.components.module),true);
  assert.equal(Object.isFrozen(manifest.compatibility.protocol),true);
});

test('accepts a valid test prerelease but rejects prereleases and build metadata on stable', () => {
  const prerelease=clone(valid);
  prerelease.components.connector.version='0.2.0-rc.1';
  assert.equal(parse(prerelease).components.connector.version,'0.2.0-rc.1');
  for(const version of ['0.2.0-rc.1','0.2.0+build.1','0.2.0-01','v0.2.0','0.2']){
    const candidate=clone(valid);
    candidate.channel='stable';
    candidate.releaseId='2026.09.20.1';
    candidate.components.connector.version=version;
    expectInvalid(candidate);
  }
  const testBuild=clone(valid);
  testBuild.components.connector.version='0.2.0+build.1';
  expectInvalid(testBuild);
});

test('rejects malformed JSON, shapes, exact-key violations, and dangerous property names', () => {
  for(const value of ['{',null,[],{}, {...valid,extra:true}, {...valid,components:{connector:valid.components.connector}}])
    expectInvalid(value);
  const dangerous=JSON.stringify(valid).replace('"notes":','"__proto__":{"polluted":true},"notes":');
  assert.throws(()=>parseReleaseManifest(bytes(dangerous),{allowedAssetOrigins}),{code:'invalid-release-manifest'});
  assert.throws(()=>parseReleaseManifest(Uint8Array.of(0xff),{allowedAssetOrigins}),{code:'invalid-release-manifest'});
});

test('rejects invalid release metadata and notes over sixteen KiB', () => {
  for(const mutate of [
    value=>{value.schemaVersion=2;},
    value=>{value.releaseId='bad release';},
    value=>{value.releaseId='x'.repeat(129);},
    value=>{value.channel='nightly';},
    value=>{value.publishedAt='2026-09-20';},
    value=>{value.publishedAt='2026-09-20T18:00:00.001+00:00';},
    value=>{value.notes='x'.repeat(16385);}
  ]){const candidate=clone(valid);mutate(candidate);expectInvalid(candidate);}
});

test('restricts asset URLs, image digests, archive digests, and declared sizes', () => {
  for(const mutate of [
    value=>{value.components.module.url='http://github.com/module.zip';},
    value=>{value.components.module.url='https://user:pass@github.com/module.zip';},
    value=>{value.components.module.url='https://github.com/module.zip?token=x';},
    value=>{value.components.module.url='https://github.com/module.zip#asset';},
    value=>{value.components.module.url='https://evil.example/module.zip';},
    value=>{value.components.connector.image='ghcr.io/knack25/xeneon-foundry/connector:latest';},
    value=>{value.components.connector.image='ghcr.io/knack25/xeneon-foundry/connector@sha256:'+'A'.repeat(64);},
    value=>{value.components.module.sha256='B'.repeat(64);},
    value=>{value.components.module.size=0;},
    value=>{value.components.module.size=1.5;},
    value=>{value.components.module.size=64*1024*1024+1;},
    value=>{value.components.edgePackage.size=256*1024*1024+1;}
  ]){const candidate=clone(valid);mutate(candidate);expectInvalid(candidate);}
});

test('rejects invalid component relationships and compatibility ranges', () => {
  for(const mutate of [
    value=>{value.components.dashboard.bundledIn='module';},
    value=>{value.components.edgePackage.installation='automatic';},
    value=>{value.compatibility.protocol={minimum:2,maximum:1};},
    value=>{value.compatibility.protocol={minimum:1.5,maximum:2};},
    value=>{value.compatibility.dataSchema={minimum:1,maximum:Number.MAX_SAFE_INTEGER+1};},
    value=>{value.compatibility.foundry={minimum:'14.368',maximum:'14.367'};},
    value=>{value.compatibility.system.id='pf2e';},
    value=>{value.compatibility.system.minimum='5.x';}
  ]){const candidate=clone(valid);mutate(candidate);expectInvalid(candidate);}
});

test('rejects an oversized body before attempting to parse it', () => {
  const oversized=encoder.encode('not-json'.padEnd(131073,'x'));
  assert.throws(()=>parseReleaseManifest(oversized,{allowedAssetOrigins}),{code:'release-manifest-too-large'});
});
