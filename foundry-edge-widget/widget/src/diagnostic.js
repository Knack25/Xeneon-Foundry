import { validateConnectorUrl } from './protocol.js';

const viewport = document.querySelector('#viewport');
const result = document.querySelector('#result');
const button = document.querySelector('#check');
const measure = () => { viewport.textContent = `${innerWidth} × ${innerHeight} CSS pixels · scale ${devicePixelRatio}`; };
addEventListener('resize', measure);
measure();

try {
  const configResponse = await fetch('config.json');
  if (!configResponse.ok) throw new Error('Configuration could not be loaded.');
  const address = validateConnectorUrl((await configResponse.json()).connectorUrl);
  document.querySelector('#address').textContent = address;
  button.disabled = false;
  result.textContent = 'Ready to test HTTPS access.';
  button.addEventListener('click', async () => {
    button.disabled = true;
    result.textContent = 'Connecting…';
    try {
      const response = await fetch(`${address}/health`, {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error(`Connector returned HTTP ${response.status}.`);
      const body = await response.json();
      if (body.service !== 'foundry-edge-connector' || body.protocol !== 1)
        throw new Error('The address did not return a compatible Foundry Edge connector.');
      result.textContent = 'HTTPS access works. Pairing and live character checks are the next verification step.';
    } catch (error) {
      result.textContent = error.name === 'TimeoutError' ? 'Connection timed out.'
        : 'Connection failed. Check the address, TLS certificate and iCUE network permission.';
    } finally { button.disabled = false; }
  });
} catch {
  result.textContent = 'Rebuild this diagnostic with your HTTPS connector address.';
}
