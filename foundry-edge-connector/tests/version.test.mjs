import test from 'node:test';
import assert from 'node:assert/strict';
import {connectorReleaseInfo} from '../src/version.js';

const expected={releaseId:'development',components:{connector:'0.1.0',dashboard:'0.1.0'},
  protocol:{minimum:1,maximum:1},dataSchema:1,
  automaticInstall:{enabled:false,reason:'release-source-not-configured'}};

test('connector reports immutable component identity with automatic installation disabled', () => {
  const value=connectorReleaseInfo({releaseId:'development'});
  assert.deepEqual(value,expected);
  assert.equal(Object.isFrozen(value),true);
  assert.equal(Object.isFrozen(value.components),true);
  assert.equal(Object.isFrozen(value.protocol),true);
  assert.equal(Object.isFrozen(value.automaticInstall),true);
  assert.notEqual(connectorReleaseInfo({releaseId:'development'}),value);
});

test('connector rejects invalid release identifiers', () => {
  for(const releaseId of ['', 'bad release', '../release', 'é', 'x'.repeat(129)])
    assert.throws(()=>connectorReleaseInfo({releaseId}),{code:'invalid-release-id'});
});
