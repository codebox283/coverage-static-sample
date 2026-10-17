import { prepare, validateDataset } from "./dataset";
self.onmessage = async (event: MessageEvent<File>) => {
  try { const data = validateDataset(JSON.parse(await event.data.text())); self.postMessage({ prepared: prepare(data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Invalid dataset." }); }
};
