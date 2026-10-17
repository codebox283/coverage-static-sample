import { describe, expect, it } from "vitest";
import { inRanges, mutationRanges, prepare, validateDataset, type Dataset } from "./dataset";
import { visibleBranches } from "./tree-viewport";

function chain(count: number): Dataset {
  return { name: "Scale test", samples: [{ id: `n${count - 1}`, collectionDate: null, region: "Test", lineage: "Test" }], mutations: [{ id: "A1T", ancestral: "A", derived: "T", position: 1 }],
    tree: Array.from({ length: count }, (_, i) => ({ id: `n${i}`, parent: i ? `n${i - 1}` : null, branchLength: 0.001, mutations: i === 1 ? ["A1T"] : [], support: 0.7, logLikelihood: -3, mutationPosteriors: i === 1 ? { A1T: 0.98 } : {} })) };
}
describe("Large tree indexing", () => {
  it("accepts and indexes 1,000,000 nodes without recursive traversal or descendant duplication", () => {
    const data = validateDataset(chain(1_000_000));
    const p = prepare(data);
    expect(p.nodes.size).toBe(1_000_000);
    expect(p.nodes.get("n999999")?.totalMutations).toBe(1);
    expect(p.nodes.get("n0")?.subtreeEnd).toBe(1_000_000);
    expect(p.leafCount).toBe(1);
    expect(visibleBranches(p, 0, 1, 32).length).toBeLessThanOrEqual(6000);
  }, 60000);
  it("rejects more than 1,000,000 nodes", () => {
    const data = chain(1); data.tree.length = 1_000_001;
    expect(() => validateDataset(data)).toThrow("max 1,000,000");
  });
  it("preserves branch support, likelihood, posterior and mutation descendants", () => {
    const p = prepare(chain(4));
    expect(p.nodes.get("n1")?.support).toBe(0.7);
    expect(p.nodes.get("n1")?.logLikelihood).toBe(-3);
    expect(p.nodes.get("n1")?.mutationPosteriors["A1T"]).toBe(0.98);
    expect(p.mutationStats[0]?.descendantSamples).toBe(1);
    expect(inRanges(3, mutationRanges(p, "A1T"))).toBe(true);
    expect(inRanges(0, mutationRanges(p, "A1T"))).toBe(false);
  });
  it("culls offscreen leaves and expands clades when there is label space", () => {
    const d = chain(1);
    d.samples = [];
    for (let i = 1; i <= 10000; i++) d.tree.push({ id: `leaf${i}`, parent: "n0", branchLength: 1, mutations: [] });
    const p = prepare(d);
    expect(visibleBranches(p, 0, 10000, 0.05)[0]?.collapsed).toBe(true);
    const visible = visibleBranches(p, 40, 45, 32);
    expect(visible.some((b) => b.node.id === "leaf42")).toBe(true);
    expect(visible.some((b) => b.node.id === "leaf9999")).toBe(false);
    expect(visible.length).toBeLessThan(10);
  });
  it("rejects disconnected cycles", () => {
    const d = chain(3); const n = d.tree[1]; if (n) n.parent = "n2";
    expect(() => prepare(validateDataset(d))).toThrow("cycle or disconnected");
  });
});