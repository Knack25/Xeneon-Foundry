import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDottedVersion,compareSemver,evaluateRelease} from '../src/compatibility.js';
import {parseReleaseManifest} from '../src/manifest.js';

const encoder=new TextEncoder();
const allowedAssetOrigins=new Set(['https://github.com']);
const manifestInput={schemaVersion:1,releaseId:'2026.09.20.1',channel:'stable',publishedAt:'2026-09-20T18:00:00.000Z',notes:'Compatibility fixture.',
  components:{connector:{version:'0.2.0',image:'ghcr.io/knack25/xeneon-foundry/connector@sha256:'+'a'.repeat(64)},
    dashboard:{version:'0.2.0',bundledIn:'connector'},
    module:{version:'0.2.0',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge-module.zip',sha256:'b'.repeat(64),size:1048576},
    edgePackage:{version:'0.1.0',installation:'manual',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge.icuewidget',sha256:'c'.repeat(64),size:2097152}},
  compatibility:{foundry:{minimum:'14.367',maximum:'14.367'},system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'},protocol:{minimum:1,maximum:1},dataSchema:{minimum:1,maximum:1}}};
const installed={channel:'stable',components:{connector:'0.1.0',module:'0.1.0',dashboard:'0.1.0',edgePackage:'0.1.0'},
  foundry:'14.367',system:{id:'dnd5e',version:'5.3.3'},protocol:1,dataSchema:1};
const clone=value=>structuredClone(value);
const parse=input=>parseReleaseManifest(encoder.encode(JSON.stringify(input)),{allowedAssetOrigins});

test('accepts a compatible upgrade and returns an immutable result', () => {
  const result=evaluateRelease(parse(manifestInput),installed);
  assert.deepEqual(result,{compatible:true,reasons:[]});
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result.reasons),true);
});

test('reports channel mismatch and accepts test releases only on the test channel', () => {
  const input=clone(manifestInput);input.channel='test';input.releaseId='2026.09.20-test.1';
  const release=parse(input);
  assert.deepEqual(evaluateRelease(release,installed),{compatible:false,reasons:['channel-mismatch']});
  assert.deepEqual(evaluateRelease(release,{...installed,channel:'test'}),{compatible:true,reasons:[]});
});

test('reports each downgrade and runtime incompatibility with a stable reason', () => {
  const cases=[
    ['connector-downgrade',value=>{value.components.connector.version='0.0.9';}],
    ['module-downgrade',value=>{value.components.module.version='0.0.9';}],
    ['dashboard-downgrade',value=>{value.components.dashboard.version='0.0.9';}],
    ['edge-package-downgrade',value=>{value.components.edgePackage.version='0.0.9';}],
    ['foundry-incompatible',value=>{value.compatibility.foundry={minimum:'14.368',maximum:'14.368'};}],
    ['system-incompatible',value=>{value.compatibility.system={id:'dnd5e',minimum:'5.3.4',maximum:'5.3.4'};}],
    ['protocol-incompatible',value=>{value.compatibility.protocol={minimum:2,maximum:2};}],
    ['data-schema-incompatible',value=>{value.compatibility.dataSchema={minimum:2,maximum:2};}]
  ];
  for(const [reason,mutate] of cases){
    const input=clone(manifestInput);mutate(input);
    assert.deepEqual(evaluateRelease(parse(input),installed),{compatible:false,reasons:[reason]});
  }
});

test('returns simultaneous reasons in fixed policy order', () => {
  const input=clone(manifestInput);
  input.channel='test';input.releaseId='2026.09.20-test.1';
  input.components.connector.version='0.0.9';
  input.compatibility.foundry={minimum:'14.368',maximum:'14.368'};
  input.compatibility.protocol={minimum:2,maximum:2};
  assert.deepEqual(evaluateRelease(parse(input),installed),{compatible:false,reasons:[
    'channel-mismatch','connector-downgrade','foundry-incompatible','protocol-incompatible'
  ]});
});

test('compares SemVer prereleases and dotted runtime versions numerically', () => {
  assert.equal(compareSemver('1.10.0','1.9.9'),1);
  assert.equal(compareSemver('1.0.0-rc.2','1.0.0'),-1);
  assert.equal(compareSemver('1.0.0-rc.2','1.0.0-rc.10'),-1);
  assert.equal(compareSemver('1.0.0-1','1.0.0-alpha'),-1);
  assert.equal(compareSemver('1.0.0','1.0.0'),0);
  assert.equal(compareDottedVersion('14.368','14.367'),1);
  assert.equal(compareDottedVersion('5.3.3','5.3.3'),0);
});

test('rejects malformed installed state before policy evaluation', () => {
  for(const value of [null,{}, {...installed,extra:true}, {...installed,channel:'nightly'},
    {...installed,components:{...installed.components,connector:'1.0'}},
    {...installed,foundry:'14.x'}, {...installed,system:{id:'pf2e',version:'5.3.3'}},
    {...installed,protocol:1.5}, {...installed,dataSchema:0}])
    assert.throws(()=>evaluateRelease(parse(manifestInput),value),{code:'invalid-installed-state'});
});
