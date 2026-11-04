import { describe, expect, it } from "vitest";
import { parseBlocks, noteImages, stripImages } from "./formatExplain";
import { namedFiles, withPaths, keyOf } from "./uploadImages";
import { parseQuestionFile } from "./questionUpload";

const body = "What it is.\n\n**Parts**\n- One\n\n![Nephron, labelled](images/Nephron.PNG)\n\n**Where marks are lost**\n- Two";

describe("pictures in notes", () => {
  it("draws a picture line only where asked", () => {
    expect(parseBlocks(body, { images: true }).find(b => b.type === "img")).toEqual({ type: "img", alt: "Nephron, labelled", src: "images/Nephron.PNG" });
    expect(parseBlocks(body).some(b => b.type === "img")).toBe(false);
    expect(noteImages(body)).toEqual(["images/Nephron.PNG"]);
    expect(stripImages(body)).not.toContain("![");
  });

  it("matches files by name and swaps in stored paths", () => {
    const { drafts } = parseQuestionFile({ questions: [
      { q: "Which?", options: ["A", "B"], correct: "A", img: "xray.png", topic: { title: "T", body } },
      { q: "Also?", options: ["A", "B"], correct: "B", topic: { title: "T", body } },
    ] });
    expect(drafts[0].img).toBe("xray.png");
    expect(namedFiles(drafts).sort()).toEqual(["nephron.png", "xray.png"]);
    expect(keyOf("images/Nephron.PNG")).toBe("nephron.png");
    const out = withPaths(drafts, { "nephron.png": "u/n.webp" });
    expect(out[0].img).toBeUndefined();
    expect(out[0].topic.body).toContain("![Nephron, labelled](u/n.webp)");
    expect(out[1].topic.body).toBe(out[0].topic.body);
    const none = withPaths(drafts, {});
    expect(none[0].topic.body).not.toContain("![");
  });
});
