import test from 'node:test';
import assert from 'node:assert/strict';
import { preferencesKey, readPreferences, savePreferences, toggleFavorite, moveFavorite } from '../widget/src/preferences.js';

const defaults = { favorites: [], theme: 'violet', fontSize: 'normal', turnAlert: false };
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

test('preferences isolate instance, world and actor but survive connection generations', () => {
  const scope = { instanceId: 'one', worldId: 'world', generation: 1 };
  const key = preferencesKey(scope, 'actor');
  assert.equal(key, preferencesKey({ ...scope, generation: 2 }, 'actor'));
  assert.notEqual(key, preferencesKey({ ...scope, instanceId: 'two' }, 'actor'));
  assert.notEqual(key, preferencesKey({ ...scope, worldId: 'other' }, 'actor'));
  assert.notEqual(key, preferencesKey(scope, 'other'));
  assert.notEqual(preferencesKey({ instanceId: 'a:b', worldId: 'c' }, 'd'), preferencesKey({ instanceId: 'a', worldId: 'b:c' }, 'd'));
  assert.equal(preferencesKey(null, 'actor'), null);
  assert.equal(preferencesKey(scope, ''), null);
});

test('missing, malformed and inaccessible storage yield independent defaults', () => {
  const store = storage();
  for (const value of ['{', 'null', '[]', '3']) {
    store.setItem('key', value);
    assert.deepEqual(readPreferences(store, 'key'), defaults);
  }
  assert.deepEqual(readPreferences({ getItem() { throw Error('denied'); } }, 'key'), defaults);
  const first = readPreferences(store, 'missing');
  first.favorites.push('x');
  assert.deepEqual(readPreferences(store, 'missing'), defaults);
});

test('storage round trip permits only bounded preferences, never credentials or snapshots', () => {
  const store = storage();
  const pref = { favorites: ['x', 'x', '', 12, 'a'.repeat(257), 'y'], theme: 'blue', fontSize: 'large', turnAlert: true, token: 'secret', snapshot: { hp: 4 } };
  assert.equal(savePreferences(store, 'key', pref), true);
  assert.deepEqual(JSON.parse(store.getItem('key')), { favorites: ['x', 'y'], theme: 'blue', fontSize: 'large', turnAlert: true });
  assert.deepEqual(readPreferences(store, 'key'), { favorites: ['x', 'y'], theme: 'blue', fontSize: 'large', turnAlert: true });
  for (const theme of ['violet', 'blue', 'green', 'amber']) {
    savePreferences(store, 'key', { theme });
    assert.equal(readPreferences(store, 'key').theme, theme);
  }
  store.setItem('key', JSON.stringify({ favorites: Array.from({ length: 30 }, (_, i) => String(i)), theme: 'red', fontSize: 'huge', turnAlert: 'true' }));
  const cleaned = readPreferences(store, 'key');
  assert.equal(cleaned.favorites.length, 24);
  assert.equal(cleaned.theme, 'violet');
  assert.equal(cleaned.fontSize, 'normal');
  assert.equal(cleaned.turnAlert, false);
  assert.equal(savePreferences({ setItem() { throw Error('quota'); } }, 'key', pref), false);
  assert.equal(savePreferences(store, null, pref), false);
});

test('favorites toggle without mutation and enforce identifier and count limits', () => {
  const original = { ...defaults, favorites: ['a'] };
  assert.deepEqual(toggleFavorite(original, 'b').favorites, ['a', 'b']);
  assert.deepEqual(toggleFavorite(original, 'a').favorites, []);
  assert.deepEqual(original.favorites, ['a']);
  for (const id of ['', 4, null, 'a'.repeat(257)]) assert.deepEqual(toggleFavorite(original, id).favorites, ['a']);
  const full = { ...defaults, favorites: Array.from({ length: 24 }, (_, i) => String(i)) };
  assert.equal(toggleFavorite(full, 'extra').favorites.length, 24);
  assert.equal(toggleFavorite(full, '0').favorites.length, 23);
  assert.equal(toggleFavorite(defaults, 'a'.repeat(256)).favorites.length, 1);
});

test('reordering moves selected favorite and safely handles boundaries or absent ids', () => {
  const pref = { ...defaults, favorites: ['a', 'b', 'c'] };
  assert.deepEqual(moveFavorite(pref, 'b', -1).favorites, ['b', 'a', 'c']);
  assert.deepEqual(moveFavorite(pref, 'b', 1).favorites, ['a', 'c', 'b']);
  for (const [id, delta] of [['a', -1], ['c', 1], ['missing', 1], ['b', NaN], ['b', 0.5]]) {
    assert.deepEqual(moveFavorite(pref, id, delta).favorites, ['a', 'b', 'c']);
  }
  assert.deepEqual(pref.favorites, ['a', 'b', 'c']);
});
