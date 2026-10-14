import { useEffect, useRef, useState } from "react";
import { LINEAGE_COLORS, type Prepared } from "@/lib/dataset";

export type ColorBy = "lineage" | "mutations";
interface Props {
  p: Prepared; colorBy: ColorBy; lineages: string[]; selected: string | null;
  highlightNodes: Set<string>; onSelect: (id: string) => void;
  supportThreshold: number; lowOnly: boolean; brushed: Set<string>; onBrush: (ids: string[]) => void;
}
const EMPTY = new Set<string>();
const ROW = 16, W = 720, LABEL = 90, ANNOT_ZOOM = 2;

export function TreeView({ p, colorBy, lineages, selected, highlightNodes, onSelect, supportThreshold = 0, lowOnly = false, brushed = EMPTY, onBrush = () => {} }: Props) {
  const H = p.leafCount * ROW + 20;
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [mode, setMode] = useState<"pan" | "select">("pan");
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const sx = (x: number) => 20 + (x / (p.maxX || 1)) * (W - LABEL - 30);
  const sy = (y: number) => 10 + y * ROW + ROW / 2;
  const maxM = Math.max(...[...p.nodes.values()].map((n) => n.totalMutations), 1);
  const color = (id: string) => {
    const n = p.nodes.get(id)!;
    if (colorBy === "mutations") return `color-mix(in oklab, var(--chart-3) ${Math.round((n.totalMutations / maxM) * 100)}%, var(--chart-2))`;
    const i = n.lineage ? lineages.indexOf(n.lineage) : -1;
    return i < 0 ? "var(--muted-foreground)" : LINEAGE_COLORS[i % LINEAGE_COLORS.length];
  };
  const selDesc = selected ? new Set(p.nodes.get(selected)?.descendants) : null;

  // Client px -> viewBox coords
  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current!; const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const zoomAt = (px: number, py: number, next: number) => setView((v) => {
    const k2 = Math.min(12, Math.max(0.5, next)); const r = k2 / v.k;
    return { k: k2, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
  });
  const zoomRef = useRef({ toSvg, zoomAt }); zoomRef.current = { toSvg, zoomAt };
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const pt = zoomRef.current.toSvg(e.clientX, e.clientY);
      zoomRef.current.zoomAt(pt.x, pt.y, viewRef.current.k * Math.exp(-dy * 0.002));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const center = () => { const pt = { x: W / 2, y: 280 }; return pt; };

  const onDown = (e: React.MouseEvent) => {
    if (mode === "select") { const pt = toSvg(e.clientX, e.clientY); setBox({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }); }
    else drag.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.MouseEvent) => {
    if (box) { const pt = toSvg(e.clientX, e.clientY); setBox({ ...box, x1: pt.x, y1: pt.y }); return; }
    if (!drag.current) return;
    const a = toSvg(drag.current.x, drag.current.y), b = toSvg(e.clientX, e.clientY);
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + b.x - a.x, y: v.y + b.y - a.y }));
  };
  const onUp = () => {
    drag.current = null;
    if (!box) return;
    const v = view;
    const [x0, x1] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)].map((t) => (t - v.x) / v.k) as [number, number];
    const [y0, y1] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)].map((t) => (t - v.y) / v.k) as [number, number];
    setBox(null);
    if (Math.abs(box.x1 - box.x0) < 4 && Math.abs(box.y1 - box.y0) < 4) return;
    const ids = [...p.nodes.values()].filter((n) => !n.children.length && sx(n.x) >= x0 && sx(n.x) <= x1 && sy(n.y) >= y0 && sy(n.y) <= y1).map((n) => n.id);
    onBrush(ids);
  };
  const zoomToBrush = () => {
    const ns = [...brushed].map((id) => p.nodes.get(id)!).filter(Boolean); if (!ns.length) return;
    const ys = ns.map((n) => sy(n.y)); const y0 = Math.min(...ys) - ROW, y1 = Math.max(...ys) + ROW;
    const svg = svgRef.current!; const visH = Math.min(H, (W * svg.clientHeight) / svg.clientWidth);
    const k = Math.min(12, Math.max(1, visH / (y1 - y0)));
    setView({ k, x: 0, y: -y0 * k + Math.max(0, (H - visH) / 2) });
  };

  const showAnnot = view.k >= ANNOT_ZOOM;
  const fs = 10 / Math.max(view.k, 1) * 1.1;

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        {(["pan", "select"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded border px-2 py-0.5 text-xs ${mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}>{m === "pan" ? "Pan" : "Select area"}</button>
        ))}
        {brushed.size > 0 && <button onClick={zoomToBrush} className="rounded border bg-card px-2 py-0.5 text-xs hover:bg-accent">Zoom to area</button>}
        <button onClick={() => { const c = center(); zoomAt(c.x, c.y, view.k * 1.25); }} className="rounded border bg-card px-2 py-0.5 text-xs hover:bg-accent">+</button>
        <button onClick={() => { const c = center(); zoomAt(c.x, c.y, view.k / 1.25); }} className="rounded border bg-card px-2 py-0.5 text-xs hover:bg-accent">−</button>
        <button onClick={() => setView({ x: 0, y: 0, k: 1 })} className="rounded border bg-card px-2 py-0.5 text-xs hover:bg-accent">Fit</button>
      </div>
      <svg ref={svgRef}
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet"
        className={`h-[560px] w-full select-none rounded border bg-card ${mode === "select" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {[...p.nodes.values()].map((n) => {
            if (!n.parent) return null;
            const par = p.nodes.get(n.parent)!;
            const hl = highlightNodes.has(n.id);
            const low = n.support < supportThreshold;
            const dim = (selDesc && !selDesc.has(n.id) && !n.descendants.some((d) => selDesc.has(d))) || (lowOnly && !low);
            const d = `M${sx(par.x)},${sy(par.y)} V${sy(n.y)} H${sx(n.x)}`;
            return (
              <g key={n.id}>
                <path d={d} fill="none" stroke={hl ? "var(--highlight)" : low ? "var(--destructive)" : color(n.id)}
                  strokeWidth={(hl || n.id === selected ? 3.5 : 1.6) / Math.sqrt(view.k)} strokeDasharray={low ? `${4 / view.k} ${2 / view.k}` : undefined} opacity={dim ? 0.25 : 1} />
                <path d={`M${sx(par.x)},${sy(n.y)} H${sx(n.x)}`} stroke="transparent" strokeWidth={8 / view.k} className="cursor-pointer"
                  onMouseDown={(e) => mode === "pan" && e.stopPropagation()} onClick={() => onSelect(n.id)} />
              </g>
            );
          })}
          {[...p.nodes.values()].map((n) => {
            const leaf = !n.children.length, sel = n.id === selected, br = brushed.has(n.id);
            const par = n.parent ? p.nodes.get(n.parent) : undefined;
            const midX = par ? (sx(par.x) + sx(n.x)) / 2 : sx(n.x);
            return (
              <g key={n.id} onClick={() => onSelect(n.id)} onMouseDown={(e) => mode === "pan" && e.stopPropagation()} className="cursor-pointer">
                {br && <circle cx={sx(n.x)} cy={sy(n.y)} r={6 / Math.sqrt(view.k)} fill="var(--accent)" stroke="var(--primary)" strokeWidth={1 / view.k} />}
                <circle cx={sx(n.x)} cy={sy(n.y)} r={(sel ? 5 : leaf ? 3 : 2.5) / Math.sqrt(view.k)}
                  fill={sel ? "var(--highlight)" : leaf ? color(n.id) : "var(--card)"} stroke={color(n.id)} strokeWidth={1.2 / view.k} />
                {leaf && (
                  <text x={sx(n.x) + 6 / view.k} y={sy(n.y) + fs * 0.35} fontSize={fs} fontFamily="var(--font-mono)"
                    className={sel || br ? "fill-foreground font-bold" : "fill-muted-foreground"}>{n.id}</text>
                )}
                {showAnnot && par && (
                  <>
                    {n.mutations.length > 0 && (
                      <text x={midX} y={sy(n.y) - fs * 0.45} fontSize={fs * 0.8} textAnchor="middle" fontFamily="var(--font-mono)" className="fill-primary">
                        {n.mutations.map((m) => `${m} (${n.mutationPosteriors[m]!.toFixed(2)})`).join(", ")}
                      </text>
                    )}
                    {!leaf && (
                      <text x={sx(n.x) - 3 / view.k} y={sy(n.y) + fs * 1.1} fontSize={fs * 0.75} textAnchor="end" fontFamily="var(--font-mono)"
                        className={n.support < supportThreshold ? "fill-destructive" : "fill-muted-foreground"}>{n.support.toFixed(2)}</text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </g>
        {box && <rect x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)} width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)}
          fill="var(--primary)" fillOpacity={0.1} stroke="var(--primary)" strokeDasharray="4 2" />}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {colorBy === "lineage" ? lineages.map((l, i) => (
          <span key={l} className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm" style={{ background: LINEAGE_COLORS[i % LINEAGE_COLORS.length] }} />{l}</span>
        )) : (
          <span className="flex items-center gap-2">0<span className="h-2 w-24 rounded-sm" style={{ background: "linear-gradient(90deg,var(--chart-2),var(--chart-3))" }} />{maxM} cumulative mutations</span>
        )}
        <span className="flex items-center gap-1"><span className="h-1 w-4 rounded-sm bg-highlight" />Highlighted</span>
        <span className="flex items-center gap-1"><span className="h-0 w-4 border-t-2 border-dashed border-destructive" />Support &lt; {supportThreshold.toFixed(2)}</span>
        <span className="ml-auto">{showAnnot ? "Annotations shown" : `Zoom ≥${ANNOT_ZOOM}× for mutation/support labels`} · scroll to zoom</span>
      </div>
    </div>
  );
}
