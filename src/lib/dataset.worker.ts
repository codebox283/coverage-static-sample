import { loadPresetDataset, prepare, validateDataset, type PresetDataset } from "./dataset";
self.onmessage = async (event: MessageEvent<File | { preset: PresetDataset }>) => {
  try {
    const raw = event.data instanceof File
      ? JSON.parse(await event.data.text())
      : await loadPresetDataset(event.data.preset);
    const data = validateDataset(raw);
    self.postMessage({ prepared: prepare(data) });
  }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Invalid dataset." }); }
};
