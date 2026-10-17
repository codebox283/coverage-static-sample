import { useEffect, useRef, useState, type ReactNode } from "react";
// Keep the complete filtered data, but mount only the visible rows plus overscan.
export function WindowedRows<T>({ items, render, header, height = 320, rowHeight = 28, columns = 2, minWidth, label = "Data rows" }: {
  items: readonly T[]; render: (item: T) => ReactNode; header?: ReactNode; height?: number; rowHeight?: number;
  columns?: number; minWidth?: number; label?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  useEffect(() => { setScroll(0); if (viewport.current) viewport.current.scrollTop = 0; }, [items]);
  const start = Math.min(Math.max(0, items.length - 1), Math.max(0, Math.floor((scroll - (header ? rowHeight : 0)) / rowHeight) - 5));
  const end = Math.min(items.length, start + Math.ceil(height / rowHeight) + 12);
  return <div ref={viewport} role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-auto overscroll-contain focus-visible:outline-ring" style={{ maxHeight: height }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
    <table aria-rowcount={items.length + (header ? 1 : 0)} className="w-full text-sm [&_th]:h-7 [&_th]:whitespace-nowrap [&_th]:px-2 [&_td]:whitespace-nowrap [&_td]:px-2 [&_td]:py-0 [&_td]:leading-5" style={{ minWidth }}>
      {header && <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">{header}</thead>}
      <tbody>
        {start > 0 && <tr aria-hidden="true"><td colSpan={columns} style={{ height: start * rowHeight, padding: 0, border: 0 }} /></tr>}
        {items.slice(start, end).map(render)}
        {end < items.length && <tr aria-hidden="true"><td colSpan={columns} style={{ height: (items.length - end) * rowHeight, padding: 0, border: 0 }} /></tr>}
      </tbody>
    </table>
  </div>;
}
