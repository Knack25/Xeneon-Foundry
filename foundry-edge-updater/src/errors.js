export function updateFailure(code, message) {
  return Object.assign(new Error(message), {code});
}
