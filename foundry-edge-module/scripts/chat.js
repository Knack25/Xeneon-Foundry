export function appendAttribution(message, element) {
  if (!message.isContentVisible) return;
  const name = message.flags?.['foundry-edge']?.requestingPlayerName;
  if (typeof name !== 'string' || !name) return;
  const root = element?.nodeType ? element : element?.[0] ?? element;
  if (!root?.ownerDocument || root.querySelector('.foundry-edge-attribution')) return;
  const label = root.ownerDocument.createElement('small');
  label.className = 'foundry-edge-attribution';
  label.textContent = `Requested by ${name} · Edge`;
  root.append(label);
}
