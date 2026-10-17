import demo from "@/data/demo-dataset.json";

export interface Sample { id: string; collectionDate: string | null; region: string; lineage: string }
export interface TreeNode {
  id: string; parent: string | null; branchLength: number; mutations: string[];
  support?: number; logLikelihood?: number; mutationPosteriors?: Record<string, number>;
}
export interface Mutation { id: string; position: number; ancestral: string; derived: string }
export interface Dataset { name: string; samples: Sample[]; tree: TreeNode[]; mutations: Mutation[] }
export type PresetDataset = "demo" | "5k" | "10k" | "1m";
export const PRESET_DATASETS: { id: PresetDataset; label: string; fileName: string }[] = [
  { id: "demo", label: "Default", fileName: "demo-dataset.json" },
  { id: "5k", label: "5k nodes", fileName: "cmaple_5k_nodes.json" },
  { id: "10k", label: "10k nodes", fileName: "cmaple_10k_nodes.json" },
  { id: "1m", label: "1M nodes", fileName: "cmaple_1M_nodes.json" },
];
export const MAX_NODES = 1_000_000;
const rnd = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
export interface LaidOutNode extends TreeNode {
  support: number; logLikelihood: number; mutationPosteriors: Record<string, number>;
  x: number; y: number; children: string[]; sample: Sample | undefined;
  leafStart: number; leafEnd: number; index: number; subtreeEnd: number;
  lineage: string | undefined; totalMutations: number;
}
export interface Prepared {
  data: Dataset; nodes: Map<string, LaidOutNode>; ordered: LaidOutNode[]; leaves: LaidOutNode[];
  rootId: string; maxX: number; leafCount: number; maxMutations: number;
  mutationStats: (Mutation & { descendantSamples: number; nodeIds: string[] })[];
}
export const loadDemoDataset = (): Dataset => demo as Dataset;
export async function loadPresetDataset(id: PresetDataset): Promise<Dataset> {
  switch (id) {
    case "demo": return loadDemoDataset();
    case "5k": return fetchPreset("cmaple_5k_nodes.json");
    case "10k": return fetchPreset("cmaple_10k_nodes.json");
    case "1m": return fetchPreset("cmaple_1M_nodes.json.gz", true);
  }
}
async function fetchPreset(fileName: string, compressed = false): Promise<Dataset> {
  const response = await fetch(`${import.meta.env.BASE_URL}datasets/${fileName}`);
  if (!response.ok) throw new Error(`Could not load dataset (${response.status}).`);
  if (!compressed) return response.json() as Promise<Dataset>;
  if (!response.body) throw new Error("Dataset response had no body.");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json() as Promise<Dataset>;
}
export function validateDataset(raw: unknown): Dataset {
  const d = raw as Dataset;
  if (!d || typeof d !== "object") throw new Error("File is not a JSON object.");
  for (const k of ["samples", "tree", "mutations"] as const)
    if (!Array.isArray(d[k])) throw new Error(`Missing array "${k}".`);
  if (d.tree.length > MAX_NODES) throw new Error("Tree too large (max 1,000,000 nodes).");
  const ids = new Set<string>(); let roots = 0;
  for (const n of d.tree) {
    if (!n || typeof n.id !== "string" || !Array.isArray(n.mutations) || !Number.isFinite(n.branchLength) || n.branchLength < 0)
      throw new Error("Invalid tree node or branch length.");
    if (ids.has(n.id)) throw new Error(`Duplicate node ${n.id}.`);
    ids.add(n.id); if (n.parent === null) roots++;
  }
  if (roots !== 1) throw new Error("Tree must have exactly one root (parent: null).");
  for (const n of d.tree) if (n.parent !== null && !ids.has(n.parent)) throw new Error(`Node ${n.id} has unknown parent ${n.parent}.`);
  const sampleIds = new Set<string>();
  for (const s of d.samples) {
    if (!s || !ids.has(s.id) || sampleIds.has(s.id) || typeof s.region !== "string" || typeof s.lineage !== "string") throw new Error("Invalid or duplicate sample.");
    sampleIds.add(s.id);
  }
  return { ...d, name: d.name ?? "Uploaded dataset" };
}
export function prepare(data: Dataset): Prepared {
  const samples = new Map(data.samples.map((s) => [s.id, s]));
  const nodes = new Map<string, LaidOutNode>();
  const emptyPosteriors = {};
  for (const n of data.tree) {
    const r = rnd(n.id), r2 = rnd(n.id + "s");
    const support = n.support ?? (n.parent === null ? 1 : +(r < 0.2 ? 0.3 + 0.5 * r2 : 0.88 + 0.12 * r2).toFixed(3));
    const logLikelihood = n.logLikelihood ?? +(-(2 + n.branchLength * 4000 + r * 15)).toFixed(2);
    const mutationPosteriors: Record<string, number> = n.mutations.length ? {} : emptyPosteriors;
    for (const m of n.mutations) mutationPosteriors[m] = n.mutationPosteriors?.[m] ?? +(rnd(n.id + m) < 0.15 ? 0.5 + 0.4 * rnd(m + n.id) : 0.95 + 0.05 * rnd(m + n.id)).toFixed(3);
    nodes.set(n.id, { id: n.id, parent: n.parent, branchLength: n.branchLength, mutations: n.mutations, support, logLikelihood, mutationPosteriors, x: 0, y: 0, children: [], leafStart: 0, leafEnd: 0, index: 0, subtreeEnd: 0, totalMutations: 0, lineage: undefined, sample: samples.get(n.id) });
  }
  let rootId = "";
  for (const n of nodes.values()) {
    if (n.parent === null) rootId = n.id;
    else { const parent = nodes.get(n.parent); if (!parent) throw new Error("Unknown parent."); parent.children.push(n.id); }
  }
  const root = nodes.get(rootId); if (!root) throw new Error("Missing root.");
  const ordered: LaidOutNode[] = [], leaves: LaidOutNode[] = [], stack = [root];
  let maxX = 0, maxMutations = 0;
  while (stack.length) {
    const n = stack.pop(); if (!n) break;
    n.index = ordered.length; ordered.push(n);
    const par = n.parent === null ? undefined : nodes.get(n.parent);
    n.x = par ? par.x + n.branchLength : 0;
    n.totalMutations = (par?.totalMutations ?? 0) + n.mutations.length;
    maxX = Math.max(maxX, n.x); maxMutations = Math.max(maxMutations, n.totalMutations);
    if (!n.children.length) { n.leafStart = leaves.length; leaves.push(n); n.leafEnd = leaves.length; n.y = n.leafStart; n.lineage = n.sample?.lineage; }
    else for (let i = n.children.length - 1; i >= 0; i--) { const id = n.children[i]; const child = id === undefined ? undefined : nodes.get(id); if (child) stack.push(child); }
  }
  if (ordered.length !== nodes.size) throw new Error("Tree contains a cycle or disconnected nodes.");
  for (let i = ordered.length - 1; i >= 0; i--) {
    const n = ordered[i]; if (!n) continue;
    n.subtreeEnd = n.index + 1;
    if (n.children.length) {
      const firstId = n.children[0], lastId = n.children[n.children.length - 1];
      const first = firstId === undefined ? undefined : nodes.get(firstId), last = lastId === undefined ? undefined : nodes.get(lastId);
      if (!first || !last) continue;
      n.leafStart = first.leafStart; n.leafEnd = last.leafEnd; n.y = (first.y + last.y) / 2; n.subtreeEnd = last.subtreeEnd;
      n.lineage = first.lineage;
      for (const id of n.children) if (nodes.get(id)?.lineage !== n.lineage) { n.lineage = undefined; break; }
      if (n.sample) throw new Error("Samples must be leaves.");
    }
  }
  const occurrences = new Map<string, LaidOutNode[]>();
  for (const n of ordered) for (const m of new Set(n.mutations)) { const list = occurrences.get(m); if (list) list.push(n); else occurrences.set(m, [n]); }
  const mutationStats = data.mutations.map((m) => {
    const ns = occurrences.get(m.id) ?? []; let count = 0, end = -1;
    for (const n of ns) { count += Math.max(0, n.leafEnd - Math.max(end, n.leafStart)); end = Math.max(end, n.leafEnd); }
    return { ...m, nodeIds: ns.map((n) => n.id), descendantSamples: count };
  }).sort((a, b) => b.descendantSamples - a.descendantSamples);
  return { data, nodes, ordered, leaves, rootId, maxX, maxMutations, leafCount: leaves.length, mutationStats };
}
export type NodeRange = { start: number; end: number };
export function mutationRanges(p: Prepared, mutation: string | null): NodeRange[] {
  const ranges: NodeRange[] = [];
  for (const id of p.mutationStats.find((m) => m.id === mutation)?.nodeIds ?? []) {
    const n = p.nodes.get(id); if (!n) continue;
    const last = ranges.at(-1);
    if (last && n.index < last.end) last.end = Math.max(last.end, n.subtreeEnd);
    else ranges.push({ start: n.index, end: n.subtreeEnd });
  }
  return ranges;
}
export function inRanges(index: number, ranges: NodeRange[]): boolean {
  let lo = 0, hi = ranges.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; const range = ranges[mid]; if (range && range.start <= index) lo = mid + 1; else hi = mid; }
  const range = ranges[lo - 1];
  return !!range && index < range.end;
}
export const LINEAGE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
