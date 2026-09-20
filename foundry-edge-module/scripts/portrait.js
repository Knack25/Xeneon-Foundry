import { requireCharacter } from './authorization.js';

const MAX_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function readPortrait({game, userId, actorId, fetchImage = globalThis.fetch, origin = globalThis.location?.origin}) {
  // Authorization failures must remain visible to the protected request handler.
  const {actor} = requireCharacter(game, userId, actorId);
  let reader;
  let result;
  try {
    if (typeof actor.img !== 'string' || !actor.img.trim() || !origin) return null;
    const base = new URL(origin);
    const url = new URL(actor.img, `${base.origin}/`);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin
      || url.username || url.password || url.search || url.hash
      || !/\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) return null;
    const response = await fetchImage(url.href, {credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(10000)});
    if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== base.origin)) return null;
    const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(mime) || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body?.getReader) return null;
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (!size) return null;
    let binary = '';
    for (const chunk of chunks) {
      for (let offset = 0; offset < chunk.length; offset += 8192)
        binary += String.fromCharCode(...chunk.subarray(offset, offset + 8192));
    }
    result = {dataUrl: `data:${mime};base64,${btoa(binary)}`};
  } catch {
    return null;
  } finally {
    reader?.releaseLock();
  }
  // Ownership can change while the image response is being fetched or streamed.
  requireCharacter(game, userId, actorId);
  return result;
}
