import { describe, it, expect } from "vitest";
import { dayIndex } from "../src/ui/Chart.jsx";

/* A 30-day chart, 1000 layout px wide, the same pads the chart draws with.
   Screen positions are what the pointer reports once #root is zoomed. */
const n = 30;
const pad = 36;
const laid = 1000;
const step = (laid - pad - 8) / (n - 1);

function screenOf(i, zoom, origin = 0) {
  return origin + (pad + i * step) * zoom;
}

describe("dayIndex", () => {
  it("follows the pointer onto the last day when the page is zoomed", () => {
    const zoom = 0.82;
    const origin = 80;
    const width = laid * zoom;
    expect(dayIndex(screenOf(n - 1, zoom, origin), origin, width, laid, pad, step, n)).toBe(n - 1);
    expect(dayIndex(screenOf(3, zoom, origin), origin, width, laid, pad, step, n)).toBe(3);
    expect(dayIndex(screenOf(0, zoom, origin), origin, width, laid, pad, step, n)).toBe(0);
  });

  it("is the same day when the page is not zoomed", () => {
    expect(dayIndex(screenOf(n - 1, 1), 0, laid, laid, pad, step, n)).toBe(n - 1);
    expect(dayIndex(screenOf(14, 1), 0, laid, laid, pad, step, n)).toBe(14);
  });

  it("keeps the pointer inside the series", () => {
    expect(dayIndex(-40, 0, laid, laid, pad, step, n)).toBe(0);
    expect(dayIndex(laid + 80, 0, laid, laid, pad, step, n)).toBe(n - 1);
    expect(dayIndex(10, 0, 0, 0, pad, step, 0)).toBe(0);
  });
});
