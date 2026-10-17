import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { WindowedRows } from "./WindowedRows";

afterEach(cleanup);

it("keeps a million rows accessible and resets scrolling when filtering", () => {
  const items = Array.from({ length: 1_000_000 }, (_, i) => i);
  const row = (id: number) => <tr key={id}><td>{id}</td></tr>;
  const { getByRole, getByText, rerender, container } = render(<WindowedRows items={items} render={row} columns={1} />);
  const viewport = getByRole("region");
  fireEvent.scroll(viewport, { target: { scrollTop: 999_990 * 28 } });
  expect(getByText("999999")).toBeInTheDocument();
  expect(container.querySelectorAll("tbody tr").length).toBeLessThan(40);
  rerender(<WindowedRows items={[10, 20]} render={row} columns={1} />);
  expect(viewport.scrollTop).toBe(0);
  expect(getByText("10")).toBeInTheDocument();
  expect(getByText("20")).toBeInTheDocument();
});