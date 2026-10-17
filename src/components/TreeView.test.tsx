import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadDemoDataset, prepare } from "@/lib/dataset";
import { TreeView } from "./TreeView";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("accumulates both pan axes when React batches pointer moves", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const moveTo = vi.fn();
  const context = new Proxy({ moveTo }, {
    get: (target, key) => key === "moveTo" ? target.moveTo : () => {},
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const onSelect = vi.fn();
  const { getByRole } = render(<TreeView p={prepare(loadDemoDataset())} colorBy="lineage" lineages={[]} selected={null}
    highlightNodes={[]} onSelect={onSelect} supportThreshold={0.8} lowOnly={false} brushed={new Set()} onBrush={() => {}} />);
  const canvas = getByRole("img", { name: "Interactive phylogenetic tree" });
  Object.defineProperty(canvas, "setPointerCapture", { value: () => {} });
  const initial = moveTo.mock.calls[0];
  if (!initial) throw new Error("Tree did not draw its initial branches");
  const pointer = (type: string, x: number, y: number) => fireEvent(canvas, new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
  pointer("pointerdown", 100, 100);
  moveTo.mockClear();
  act(() => {
    pointer("pointermove", 130, 110);
    pointer("pointermove", 160, 130);
  });
  const shifted = moveTo.mock.calls[0];
  if (!shifted) throw new Error("Tree did not redraw after dragging");
  expect(shifted[0]).toBeCloseTo(initial[0] + 60);
  expect(shifted[1]).toBeCloseTo(initial[1] + 30);
  pointer("pointerup", 160, 130);
  expect(onSelect).not.toHaveBeenCalled();
});