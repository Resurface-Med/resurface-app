import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES, knownTheme, themeField, themeLight } from "../src/lib/themes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("themes", () => {
  it("keeps an unknown choice on Day", () => {
    expect(knownTheme("light")).toBe("light");
    expect(knownTheme("dark")).toBe("dark");
    expect(knownTheme("nope")).toBe("light");
    expect(knownTheme(null)).toBe("light");
    expect(knownTheme("teal")).toBe("sea");
    expect(knownTheme("custom")).toBe("light");
    expect(knownTheme("custom", "#d0216d")).toBe("custom");
    expect(knownTheme("custom", "pink")).toBe("light");
  });

  it("names a field colour for every theme", () => {
    for (const t of THEMES) expect(themeField(t.id)).toBe(t.field);
    expect(themeField("nope")).toBe("#3562f5");
    expect(themeLight("light")).toBe(false);
    expect(themeLight("indigo")).toBe(false);
    expect(themeLight("red")).toBe(false);
    expect(themeLight("dark")).toBe(false);
    expect(themeLight("sea")).toBe(true);
    expect(themeLight("gold")).toBe(true);
    expect(themeLight("pink")).toBe(true);
  });

  it("the first paint knows every theme", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    for (const t of THEMES) {
      expect(html).toContain(`"${t.id}"`);
      expect(html).toContain(t.field);
      expect(css).toContain(t.field);
      if (t.id !== "light") expect(css).toContain(`[data-theme="${t.id}"]`);
    }
    expect(html).toContain("pq_theme_color");
    expect(html).toContain("'custom'");
  });
});
