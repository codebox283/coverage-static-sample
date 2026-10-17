import { useEffect, useMemo, useRef, useState } from "react";
import { Hand, Scan, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LINEAGE_COLORS, inRanges, type LaidOutNode, type NodeRange, type Prepared } from "@/lib/dataset";
import { visibleBranches } from "@/lib/tree-viewport";
export type ColorBy = "lineage" | "mutations";
interface Props {
  p: Prepared; colorBy: ColorBy; lineages: string[]; selected: string | null;
  highlightNodes: NodeRange[]; onSelect: (id: string) => void;
  supportThreshold: number; lowOnly: boolean; brushed: Set<string>; onBrush: (ids: string[]) => void;
}
const HEIGHT = 560, EMPTY = new Set<string>();
type View = { x: number; y: number; k: number };
type Point = { x: number; y: number };
export function TreeView({ p, colorBy, lineages, selected, highlightNodes, onSelect, supportThreshold = 0, lowOnly = false, brushed = EMPTY, onBrush = () => {} }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(720);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [mode, setMode] = useState<"pan" | "select">("pan");
  const [box, setBox] = useState<{ start: Point; end: Point } | null>(null);
  const drag = useRef<{ start: Point; last: Point; moved: boolean } | null>(null);
  const hitRef = useRef<{ n: LaidOutNode; x: number; y: number; parentX: number; collapsed: boolean; top: number; bottom: number }[]>([]);
  const lineColors = useMemo(() => new Map(lineages.map((l, i) => [l, LINEAGE_COLORS[i % LINEAGE_COLORS.length]])), [lineages]);
  const row = (HEIGHT - 30) / Math.max(p.leafCount, 1);
  const xScale = Math.min(view.k, 12);
  const sx = (n: LaidOutNode) => 20 + view.x + n.x / (p.maxX || 1) * Math.max(40, width - 140) * xScale;
  const sy = (y: number) => 15 + view.y + (y + 0.5) * row * view.k;
  const zoom = (factor: number, at: Point = { x: width / 2, y: HEIGHT / 2 }) => setView((v) => {
    const k = Math.min(Math.max(12, p.leafCount * 32 / (HEIGHT - 30)), Math.max(0.5, v.k * factor));
    return { k, x: at.x - 20 - (at.x - 20 - v.x) * Math.min(k, 12) / Math.min(v.k, 12), y: at.y - 15 - (at.y - 15 - v.y) * k / v.k };
  });
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth)); observer.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); const r = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? HEIGHT : 1) * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); el.removeEventListener("wheel", wheel); };
  }, []);
  useEffect(() => { setView({ x: 0, y: 0, k: 1 }); }, [p]);
  useEffect(() => {
    if (!selected) return; const n = p.nodes.get(selected); if (!n) return;
    const k = Math.max(2, Math.min(Math.max(12, p.leafCount * 32 / (HEIGHT - 30)), (HEIGHT - 80) / (row * Math.max(1, n.leafEnd - n.leafStart))));
    setView({ k, x: width * 0.4 - 20 - n.x / (p.maxX || 1) * Math.max(40, width - 140) * Math.min(k, 12), y: HEIGHT / 2 - 15 - (n.y + 0.5) * row * k });
  }, [selected, p]);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = HEIGHT * dpr; ctx.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const palette = LINEAGE_COLORS.map((_, i) => token(`--chart-${i + 1}`));
    const colors = new Map(lineages.map((l, i) => [l, palette[i % palette.length]]));
    const muted = token("--muted-foreground"), primary = token("--primary"), highlight = token("--highlight"), destructive = token("--destructive");
    ctx.clearRect(0, 0, width, HEIGHT);
    const first = (-15 - view.y) / (row * view.k) - 1, last = (HEIGHT - 15 - view.y) / (row * view.k) + 1;
    const branches = visibleBranches(p, first, last, row * view.k);
    const selectedNode = selected ? p.nodes.get(selected) : undefined;
    // Selected branches remain inspectable even inside an aggregated clade.
    if (selectedNode && !branches.some((b) => b.node === selectedNode)) branches.push({ node: selectedNode, collapsed: false });
    hitRef.current = [];
    let labelBottom = -Infinity;
    for (const { node: n, collapsed } of branches) {
      const parent = n.parent === null ? undefined : p.nodes.get(n.parent);
      const x = sx(n), y = sy(n.y), px = parent ? sx(parent) : x, py = parent ? sy(parent.y) : y;
      const top = sy(n.leafStart) - row * view.k / 2, bottom = sy(n.leafEnd - 1) + row * view.k / 2;
      const hl = inRanges(n.index, highlightNodes) || (collapsed && highlightNodes.some((r) => r.start < n.subtreeEnd && r.end > n.index));
      const low = n.support < supportThreshold;
      const dim = (selectedNode && (n.index < selectedNode.index || n.index >= selectedNode.subtreeEnd) && !(n.index <= selectedNode.index && n.subtreeEnd > selectedNode.index)) || (lowOnly && !low);
      let color = n.lineage ? colors.get(n.lineage) ?? muted : muted;
      if (colorBy === "mutations") color = `color-mix(in oklab, ${palette[2]} ${Math.round(n.totalMutations / Math.max(1, p.maxMutations) * 100)}%, ${palette[1]})`;
      ctx.strokeStyle = hl || n.id === selected ? highlight : low ? destructive : color;
      ctx.fillStyle = ctx.strokeStyle; ctx.globalAlpha = dim ? 0.2 : 1;
      ctx.lineWidth = hl || n.id === selected ? 2.5 : 1.2; ctx.setLineDash(low ? [4, 2] : []);
      if (parent) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, y); ctx.lineTo(x, y); ctx.stroke(); }
      ctx.setLineDash([]);
      if (collapsed) {
        ctx.globalAlpha = dim ? 0.12 : 0.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, Math.max(-2, top)); ctx.lineTo(x + 12, Math.min(HEIGHT + 2, bottom)); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y, n.id === selected ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
        if (brushed.has(n.id)) { ctx.strokeStyle = primary; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.globalAlpha = dim ? 0.35 : 1; ctx.fillStyle = n.id === selected ? highlight : muted;
      if (x >= -100 && x < width && y >= 0 && y <= HEIGHT) {
        hitRef.current.push({ n, x, y, parentX: px, collapsed, top, bottom });
        const labelRoom = y - labelBottom >= (view.k >= 2 && row * view.k >= 30 ? 32 : 12);
        if (labelRoom && (!n.children.length || collapsed || n.id === selected)) {
          ctx.font = `11px ${css.getPropertyValue("--font-mono")}`;
          const label = collapsed ? `${(n.leafEnd - n.leafStart).toLocaleString()} samples` : n.id;
          ctx.fillText(label, x + (collapsed ? 16 : 7), y + 4, Math.max(1, width - x - 10)); labelBottom = y;
        }
        if (view.k >= 2 && row * view.k >= 30 && !collapsed && parent && y - labelBottom >= -1) {
          ctx.font = `10px ${css.getPropertyValue("--font-mono")}`; ctx.fillStyle = primary;
          const annotation = n.mutations.map((m) => `${m} (${n.mutationPosteriors[m]?.toFixed(2) ?? "—"})`).join(", ");
          const available = x - Math.max(0, px) - 8;
          if (available > 60 && annotation) ctx.fillText(annotation, Math.max(0, px) + 4, y - 6, available);
          else if (annotation && n.id === selected) ctx.fillText(annotation, x + 7, y - 10, Math.max(1, width - x - 10));
          ctx.fillStyle = low ? destructive : muted;
          ctx.fillText(`S ${n.support.toFixed(2)} · LL ${n.logLikelihood.toFixed(2)}`, x + 7, y + 17, Math.max(1, width - x - 10));
        }
      }
    }
    ctx.globalAlpha = 1;
    if (box) {
      ctx.fillStyle = primary; ctx.globalAlpha = 0.1; ctx.fillRect(box.start.x, box.start.y, box.end.x - box.start.x, box.end.y - box.start.y);
      ctx.globalAlpha = 1; ctx.strokeStyle = primary; ctx.setLineDash([4, 2]); ctx.strokeRect(box.start.x, box.start.y, box.end.x - box.start.x, box.end.y - box.start.y);
    }
  }, [p, view, width, selected, colorBy, lineages, highlightNodes, supportThreshold, lowOnly, brushed, box]);
  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = point(e), gesture = drag.current; drag.current = null;
    if (box) {
      setBox(null); if (!gesture?.moved) return;
      const x0 = Math.min(box.start.x, pos.x), x1 = Math.max(box.start.x, pos.x);
      const y0 = Math.max(0, Math.ceil((Math.min(box.start.y, pos.y) - 15 - view.y) / (row * view.k) - 0.5));
      const y1 = Math.min(p.leafCount - 1, Math.floor((Math.max(box.start.y, pos.y) - 15 - view.y) / (row * view.k) - 0.5));
      const ids: string[] = [];
      for (let i = y0; i <= y1; i++) { const n = p.leaves[i]; if (n && sx(n) >= x0 && sx(n) <= x1) ids.push(n.id); }
      onBrush(ids); return;
    }
    if (gesture?.moved) return;
    let hit: typeof hitRef.current[number] | undefined, best = 10;
    for (const h of hitRef.current) {
      const distance = Math.hypot(pos.x - Math.min(h.x, Math.max(h.parentX, pos.x)), pos.y - h.y);
      if (distance < best || (h.collapsed && pos.x >= h.x && pos.x <= h.x + 14 && pos.y >= h.top && pos.y <= h.bottom)) { hit = h; best = distance; }
    }
    if (hit) onSelect(hit.n.id);
  };
  const zoomToBrush = () => {
    let first = Infinity, last = -Infinity;
    for (const id of brushed) { const n = p.nodes.get(id); if (n) { first = Math.min(first, n.y); last = Math.max(last, n.y); } }
    if (!Number.isFinite(first)) return;
    const k = Math.min(Math.max(12, p.leafCount * 32 / (HEIGHT - 30)), (HEIGHT - 60) / (row * (last - first + 2)));
    setView({ k, x: 0, y: HEIGHT / 2 - 15 - ((first + last) / 2 + 0.5) * row * k });
  };
  return <div className="relative">
    <div className="absolute right-2 top-2 z-10 flex flex-wrap justify-end gap-1">
      <Button size="sm" variant={mode === "pan" ? "default" : "outline"} onClick={() => setMode("pan")}><Hand />Pan</Button>
      <Button size="sm" variant={mode === "select" ? "default" : "outline"} onClick={() => setMode("select")}><Scan />Select area</Button>
      {brushed.size > 0 && <Button size="sm" variant="outline" onClick={zoomToBrush}>Zoom to area</Button>}
      <Button size="icon" variant="outline" title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.8)}><ZoomIn /></Button>
      <Button size="icon" variant="outline" title="Zoom out" aria-label="Zoom out" onClick={() => zoom(1 / 1.8)}><ZoomOut /></Button>
      <Button size="icon" variant="outline" title="Fit tree" aria-label="Fit tree" onClick={() => setView({ x: 0, y: 0, k: 1 })}><Maximize /></Button>
    </div>
    <canvas ref={canvasRef} role="img" aria-label="Interactive phylogenetic tree" className={`h-[560px] w-full touch-none rounded border bg-card ${mode === "select" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
      onPointerDown={(e) => { if (e.button !== 0) return; const pos = point(e); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { start: pos, last: pos, moved: false }; if (mode === "select") setBox({ start: pos, end: pos }); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; const pos = point(e); const dx = pos.x - d.last.x, dy = pos.y - d.last.y; d.moved ||= Math.hypot(pos.x - d.start.x, pos.y - d.start.y) > 4; if (mode === "select") setBox({ start: d.start, end: pos }); else setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })); d.last = pos; }}
      onPointerUp={finish} onPointerCancel={() => { drag.current = null; setBox(null); }} />
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {colorBy === "lineage" ? lineages.map((l) => <span key={l} className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm" style={{ background: lineColors.get(l) }} />{l}</span>) : <span>0–{p.maxMutations} cumulative mutations</span>}
      <span className="flex items-center gap-1"><span className="h-1 w-4 bg-highlight" />Highlighted</span>
      <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-destructive" />Support &lt; {supportThreshold.toFixed(2)}</span>
      <span className="ml-auto font-mono">{view.k.toFixed(1)}× · {p.leafCount.toLocaleString()} leaves</span>
    </div>
  </div>;
}
