import { useState, type ReactNode } from "react";
// Keep the complete filtered data, but mount only the visible rows plus overscan.
export function WindowedRows<T>({ items, render, header, height = 320, rowHeight = 28 }: {
  items: readonly T[]; render: (item: T) => ReactNode; header?: ReactNode; height?: number; rowHeight?: number;
}) {
  const [scroll, setScroll] = useState(0);
  const start = Math.min(Math.max(0, items.length - 1), Math.max(0, Math.floor(scroll / rowHeight) - 5));
  const end = Math.min(items.length, start + Math.ceil(height / rowHeight) + 12);
  return <div className="overflow-auto" style={{ maxHeight: height }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
    <table className="w-full table-fixed text-sm">
      {header && <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">{header}</thead>}
      <tbody>
        {start > 0 && <tr aria-hidden="true"><td colSpan={10} style={{ height: start * rowHeight }} /></tr>}
        {items.slice(start, end).map(render)}
        {end < items.length && <tr aria-hidden="true"><td colSpan={10} style={{ height: (items.length - end) * rowHeight }} /></tr>}
      </tbody>
    </table>
  </div>;
}
