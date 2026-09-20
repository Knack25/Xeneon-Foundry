const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 256;

function normalize(value) {
  const pref = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    favorites: Array.isArray(pref.favorites) ? [...new Set(pref.favorites.filter(validId))].slice(0, 24) : [],
    theme: ['violet', 'blue', 'green', 'amber'].includes(pref.theme) ? pref.theme : 'violet',
    fontSize: pref.fontSize === 'large' ? 'large' : 'normal',
    turnAlert: pref.turnAlert === true,
  };
}

// A reconnect changes generation, but these preferences belong to the character.
export function preferencesKey(scope, actorId) {
  if (![scope?.instanceId, scope?.worldId, actorId].every(validId)) return null;
  return `foundry-edge-preferences:${JSON.stringify([scope.instanceId, scope.worldId, actorId])}`;
}

export function readPreferences(storage, key) {
  try {
    return normalize(key ? JSON.parse(storage.getItem(key)) : null);
  } catch {
    return normalize(null);
  }
}

export function savePreferences(storage, key, pref) {
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify(normalize(pref)));
    return true;
  } catch {
    return false;
  }
}

export function toggleFavorite(pref, id) {
  const next = normalize(pref);
  if (!validId(id)) return next;
  const index = next.favorites.indexOf(id);
  if (index >= 0) next.favorites.splice(index, 1);
  else if (next.favorites.length < 24) next.favorites.push(id);
  return next;
}

export function moveFavorite(pref, id, delta) {
  const next = normalize(pref);
  const index = next.favorites.indexOf(id);
  const target = index + delta;
  if (index < 0 || !Number.isInteger(delta) || target < 0 || target >= next.favorites.length) return next;
  next.favorites.splice(index, 1);
  next.favorites.splice(target, 0, id);
  return next;
}
