import demo from "@/data/demo-dataset.json";

export interface Sample { id: string; collectionDate: string | null; region: string; lineage: string }
export interface TreeNode {
  id: string; parent: string | null; branchLength: number; mutations: string[];
  support?: number; logLikelihood?: number; mutationPosteriors?: Record<string, number>;
}
export interface Mutation { id: string; position: number; ancestral: string; derived: string }
export interface Dataset { name: string; samples: Sample[]; tree: TreeNode[]; mutations: Mutation[] }
const rnd = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

export interface LaidOutNode extends TreeNode {
  support: number; logLikelihood: number; mutationPosteriors: Record<string, number>;
  x: number; y: number; children: string[]; sample: Sample | undefined; descendants: string[]; lineage: string | undefined; totalMutations: number;
}
export interface Prepared {
  data: Dataset; nodes: Map<string, LaidOutNode>; rootId: string; maxX: number; leafCount: number;
  mutationStats: (Mutation & { descendantSamples: number; nodeIds: string[] })[];
}

export function loadDemoDataset(): Dataset {
  return demo as Dataset;
}

export function validateDataset(raw: unknown): Dataset {
  const d = raw as Dataset;
  if (!d || typeof d !== "object") throw new Error("File is not a JSON object.");
  for (const k of ["samples", "tree", "mutations"] as const)
    if (!Array.isArray(d[k])) throw new Error(`Missing array "${k}".`);
  if (d.tree.length > 5000) throw new Error("Tree too large for this prototype (max 5000 nodes).");
  const ids = new Set(d.tree.map((n) => n.id));
  const roots = d.tree.filter((n) => n.parent === null);
  if (roots.length !== 1) throw new Error("Tree must have exactly one root (parent: null).");
  for (const n of d.tree) {
    if (typeof n.id !== "string" || !Array.isArray(n.mutations)) throw new Error(`Invalid tree node ${n.id}.`);
    if (n.parent !== null && !ids.has(n.parent)) throw new Error(`Node ${n.id} has unknown parent ${n.parent}.`);
  }
  for (const s of d.samples) if (!ids.has(s.id)) throw new Error(`Sample ${s.id} has no matching tree node.`);
  return { ...d, name: d.name ?? "Uploaded dataset" };
}

export function prepare(data: Dataset): Prepared {
  const samples = new Map(data.samples.map((s) => [s.id, s]));
  const nodes = new Map<string, LaidOutNode>();
  for (const n of data.tree) {
    // Demo fallback: deterministic synthetic values when the file lacks them.
    const r = rnd(n.id), r2 = rnd(n.id + "s");
    const support = n.support ?? (n.parent === null ? 1 : +(r < 0.2 ? 0.3 + 0.5 * r2 : 0.88 + 0.12 * r2).toFixed(3));
    const logLikelihood = n.logLikelihood ?? +(-(2 + n.branchLength * 4000 + r * 15)).toFixed(2);
    const mutationPosteriors: Record<string, number> = {};
    for (const m of n.mutations) mutationPosteriors[m] = n.mutationPosteriors?.[m] ?? +(rnd(n.id + m) < 0.15 ? 0.5 + 0.4 * rnd(m + n.id) : 0.95 + 0.05 * rnd(m + n.id)).toFixed(3);
    nodes.set(n.id, { ...n, support, logLikelihood, mutationPosteriors, x: 0, y: 0, children: [], descendants: [], totalMutations: 0, lineage: undefined, sample: samples.get(n.id) });
  }
  let rootId = "";
  for (const n of nodes.values()) n.parent ? nodes.get(n.parent)!.children.push(n.id) : (rootId = n.id);
  let leaf = 0, maxX = 0;
  const walk = (id: string, x: number, tm: number) => {
    const n = nodes.get(id)!;
    n.x = x; n.totalMutations = tm + n.mutations.length; maxX = Math.max(maxX, x);
    if (!n.children.length) { n.y = leaf++; n.descendants = [id]; n.lineage = n.sample?.lineage; return; }
    n.children.forEach((c) => walk(c, x + nodes.get(c)!.branchLength, n.totalMutations));
    const kids = n.children.map((c) => nodes.get(c)!);
    n.y = (kids[0]!.y + kids[kids.length - 1]!.y) / 2;
    n.descendants = kids.flatMap((k) => k.descendants);
    const ls = new Set(kids.map((k) => k.lineage));
    n.lineage = ls.size === 1 ? kids[0]!.lineage : undefined;
  };
  walk(rootId, 0, 0);
  const mutationStats = data.mutations.map((m) => {
    const ns = [...nodes.values()].filter((n) => n.mutations.includes(m.id));
    const desc = new Set(ns.flatMap((n) => n.descendants));
    return { ...m, nodeIds: ns.map((n) => n.id), descendantSamples: desc.size };
  }).sort((a, b) => b.descendantSamples - a.descendantSamples);
  return { data, nodes, rootId, maxX, leafCount: leaf, mutationStats };
}

export const LINEAGE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
