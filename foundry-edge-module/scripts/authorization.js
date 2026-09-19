import { failure } from './protocol.js';

export function requirePlayer(game, userId) {
  const user = game.users.get(userId);
  if (!user) throw failure('access-denied', 'The player is not available in this world.');
  return user;
}

export function canReadCharacter(actor, user) {
  return !!actor && actor.type === 'character' && !actor.pack && !actor.isToken
    && actor.testUserPermission(user, 'OWNER');
}

export function requireCharacter(game, userId, actorId) {
  const user = requirePlayer(game, userId);
  const actor = game.actors.get(actorId);
  if (!canReadCharacter(actor, user)) throw failure('access-denied', 'This character is not available to the player.');
  if (!actor.testUserPermission(game.user, 'OWNER'))
    throw failure('service-access-denied', 'The connector account does not own this character.');
  return {actor,user};
}
