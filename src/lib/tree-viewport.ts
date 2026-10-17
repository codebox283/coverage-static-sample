import type { LaidOutNode, Prepared } from "./dataset";
export interface VisibleBranch { node: LaidOutNode; collapsed: boolean }
export function visibleBranches(p: Prepared, first: number, last: number, pixelsPerLeaf: number, budget = 6000): VisibleBranch[] {
  const root = p.nodes.get(p.rootId); if (!root) return [];
  const stack = [root], result: VisibleBranch[] = [];
  while (stack.length && result.length < budget) {
    const n = stack.pop(); if (!n || n.leafEnd <= first || n.leafStart > last) continue;
    const collapsed = n.children.length > 0 && ((n.leafEnd - n.leafStart) * pixelsPerLeaf < 16 || (n.children.length > 1000 && pixelsPerLeaf < 16) || result.length + stack.length >= budget - 1);
    result.push({ node: n, collapsed });
    if (collapsed) continue;
    let lo = 0, hi = n.children.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; const id = n.children[mid]; const c = id === undefined ? undefined : p.nodes.get(id); if (c && c.leafEnd <= first) lo = mid + 1; else hi = mid; }
    const start = lo; lo = start; hi = n.children.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; const id = n.children[mid]; const c = id === undefined ? undefined : p.nodes.get(id); if (c && c.leafStart <= last) lo = mid + 1; else hi = mid; }
    if (lo - start > budget - result.length - stack.length) { const entry = result.at(-1); if (entry) entry.collapsed = true; continue; }
    for (let i = lo - 1; i >= start; i--) { const id = n.children[i]; const child = id === undefined ? undefined : p.nodes.get(id); if (child) stack.push(child); }
  }
  return result;
}
