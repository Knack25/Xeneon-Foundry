import test from 'node:test';
import assert from 'node:assert/strict';
import {readPortrait} from '../scripts/portrait.js';
const origin = 'https://foundry.example';
function fixture(img = 'worlds/demo/portrait.png', owners = ['player', 'service']) {
  const actor = {type: 'character', img, testUserPermission: user => owners.includes(user?.id)};
  return {game: {user: {id: 'service'}, users: new Map([['player', {id: 'player'}]]), actors: new Map([['actor', actor]])}, userId: 'player', actorId: 'actor', origin};
}
const response = (bytes = new Uint8Array([0, 255, 128]), type = 'image/png', headers = {}) => new Response(bytes, {headers: {'content-type': type, ...headers}});

test('exports protected portrait reader', () => assert.equal(typeof readPortrait, 'function'));
test('returns browser-compatible data URL from authorized actor image', async () => {
  const result = await readPortrait({...fixture(), fetchImage: async (url, options) => {
    assert.equal(url, 'https://foundry.example/worlds/demo/portrait.png');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'same-origin');
    return response();
  }});
  assert.deepEqual(result, {dataUrl: 'data:image/png;base64,AP+A'});
});
test('requires both player and service ownership before fetching', async () => {
  for (const owners of [[], ['service'], ['player']]) {
    let calls = 0;
    await assert.rejects(readPortrait({...fixture(undefined, owners), fetchImage: async () => {calls++; return response();}}));
    assert.equal(calls, 0);
  }
});
test('rejects external, credentialed, executable and parameterized asset URLs', async () => {
  for (const img of ['https://evil.example/a.png', '//evil.example/a.png', 'https://user:pass@foundry.example/a.png', 'data:image/png;base64,AA==', 'a.svg', '/api/users', 'a.png?token=secret', 'a.png#fragment', '', null]) {
    let calls = 0;
    assert.equal(await readPortrait({...fixture(img), fetchImage: async () => {calls++; return response();}}), null, String(img));
    assert.equal(calls, 0);
  }
});
test('rejects wrong MIME, empty bodies, failures and redirects', async () => {
  for (const fetchImage of [async () => response(undefined, 'text/html'), async () => response(new Uint8Array()), async () => new Response(null, {status: 404}), async () => {throw new TypeError('redirect');}, async () => ({ok: true, redirected: true, url: 'https://evil.example/a.png'})]) {
    assert.equal(await readPortrait({...fixture(), fetchImage}), null);
  }
});
test('accepts only raster image MIME types', async () => {
  for (const [ext, type] of [['jpg', 'image/jpeg'], ['webp', 'image/webp'], ['gif', 'image/gif']]) {
    assert.deepEqual(await readPortrait({...fixture(`a.${ext}`), fetchImage: async () => response(undefined, type)}), {dataUrl: `data:${type};base64,AP+A`});
  }
});
test('rejects declared oversized bodies without reading', async () => {
  assert.equal(await readPortrait({...fixture(), fetchImage: async () => response(undefined, 'image/png', {'content-length': '1048577'})}), null);
});
test('bounds streaming bodies even without trustworthy content-length and cancels overflow', async () => {
  let cancelled = false;
  let reads = 0;
  const body = {getReader: () => ({read: async () => {reads++; return {done: false, value: new Uint8Array(600000)};}, cancel: async () => {cancelled = true;}, releaseLock() {}})};
  assert.equal(await readPortrait({...fixture(), fetchImage: async () => ({ok: true, body, headers: new Headers({'content-type': 'image/png', 'content-length': '3'})})}), null);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});
test('accepts the inclusive one MiB boundary', async () => {
  const result = await readPortrait({...fixture(), fetchImage: async () => response(new Uint8Array(1048576))});
  assert.equal(atob(result.dataUrl.split(',')[1]).length, 1048576);
});
test('rejects unavailable users and actors before fetching', async () => {
  for (const overrides of [{userId: 'missing'}, {actorId: 'missing'}]) {
    let calls = 0;
    await assert.rejects(readPortrait({...fixture(), ...overrides, fetchImage: async () => {calls++; return response();}}));
    assert.equal(calls, 0);
  }
});
test('rejects ownership revoked while the portrait fetch is pending', async () => {
  for (const revoked of ['player', 'service']) {
    const owners = ['player', 'service'];
    let completeFetch;
    const pending = readPortrait({...fixture(undefined, owners), fetchImage: () => new Promise(resolve => {completeFetch = resolve;})});
    owners.splice(owners.indexOf(revoked), 1);
    completeFetch(response());
    await assert.rejects(pending, {code: revoked === 'player' ? 'access-denied' : 'service-access-denied'});
  }
});
