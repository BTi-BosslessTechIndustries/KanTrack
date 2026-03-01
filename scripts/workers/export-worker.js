/**
 * Export worker — offloads JSON serialization off the main thread.
 *
 * Protocol:
 *   Main → Worker : { type: 'serialize', payload: object }
 *   Worker → Main : { type: 'done', jsonString: string }
 *                or { type: 'error', message: string }
 */
self.onmessage = e => {
  const { type, payload } = e.data;
  if (type !== 'serialize') return;

  try {
    const jsonString = JSON.stringify(payload, null, 2);
    self.postMessage({ type: 'done', jsonString });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
