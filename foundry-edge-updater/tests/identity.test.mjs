import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadComponentIdentity, parseComponentIdentity} from '../src/identity.js';

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('checked-in component identity matches every shipped component', async () => {
  const identity = await loadComponentIdentity(new URL('../../release/component-versions.json', import.meta.url));
  const connector = await json('../../foundry-edge-connector/package.json');
  const modulePackage = await json('../../foundry-edge-module/package.json');
  const moduleManifest = await json('../../foundry-edge-module/module.json');
  const widgetPackage = await json('../../foundry-edge-widget/package.json');
  const widgetManifest = await json('../../foundry-edge-widget/widget/manifest.json');

  assert.equal(identity.components.connector, connector.version);
  assert.equal(identity.components.module, modulePackage.version);
  assert.equal(identity.components.module, moduleManifest.version);
  assert.equal(identity.components.dashboard, widgetPackage.version);
  assert.equal(identity.components.edgePackage, widgetManifest.version);
  assert.deepEqual(identity.protocol, {minimum:1, maximum:1});
  assert.equal(identity.dataSchema, 1);
  assert.deepEqual(identity.foundry, {minimum:'14.367', maximum:'14.367'});
  assert.deepEqual(identity.system, {id:'dnd5e', minimum:'5.3.3', maximum:'5.3.3'});
  assert.equal(Object.isFrozen(identity), true);
  assert.equal(Object.isFrozen(identity.components), true);
});

test('component identity rejects missing, extra, and mistyped fields', () => {
  for (const value of [
    {},
    {components:{}},
    {components:{connector:'0.1.0',module:'0.1.0',dashboard:'0.1.0',edgePackage:'0.1.0'},protocol:{minimum:1,maximum:1},dataSchema:'1',foundry:{minimum:'14.367',maximum:'14.367'},system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'}},
    {components:{connector:'0.1.0',module:'0.1.0',dashboard:'0.1.0',edgePackage:'0.1.0'},protocol:{minimum:1,maximum:1},dataSchema:1,foundry:{minimum:'14.367',maximum:'14.367'},system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'},extra:true}
  ]) assert.throws(() => parseComponentIdentity(value), {code:'invalid-component-identity'});
});

test('component identity rejects invalid versions and ranges without leaking source data', () => {
  const base = {
    components:{connector:'0.1.0',module:'0.1.0',dashboard:'0.1.0',edgePackage:'0.1.0'},
    protocol:{minimum:1,maximum:1},dataSchema:1,
    foundry:{minimum:'14.367',maximum:'14.367'},
    system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'}
  };
  const invalid = [
    {...base,components:{...base.components,connector:'not-for-errors'}},
    {...base,protocol:{minimum:2,maximum:1}},
    {...base,foundry:{minimum:'14.x',maximum:'14.367'}},
    {...base,system:{...base.system,id:'other'}}
  ];
  for (const value of invalid) {
    assert.throws(() => parseComponentIdentity(value), error => {
      assert.equal(error.code,'invalid-component-identity');
      assert.equal(error.message.includes('not-for-errors'),false);
      return true;
    });
  }
});
