import { describe, it, expect } from "vitest";
import { formatStudyTime, studySliceMs, STUDY_IDLE_MS } from "../src/lib/studyTime.js";

describe("studySliceMs", () => {
  it("counts a slice while they are still there", () => {
    expect(studySliceMs(1000, 0)).toBe(1000);
  });

  it("counts only up to the idle limit, so a slept laptop does not add hours", () => {
    expect(studySliceMs(60 * 60 * 1000, 0)).toBe(STUDY_IDLE_MS);
    expect(studySliceMs(1000, STUDY_IDLE_MS - 400)).toBe(400);
  });

  it("counts nothing once the question has been left", () => {
    expect(studySliceMs(1000, STUDY_IDLE_MS)).toBe(0);
    expect(studySliceMs(0, 0)).toBe(0);
    expect(studySliceMs(-5, 0)).toBe(0);
  });
});

describe("formatStudyTime", () => {
  it("reads as minutes, then hours and minutes", () => {
    expect(formatStudyTime(0)).toBe("0m");
    expect(formatStudyTime(20)).toBe("0m");
    expect(formatStudyTime(30)).toBe("1m");
    expect(formatStudyTime(46 * 60)).toBe("46m");
    expect(formatStudyTime(3600)).toBe("1h");
    expect(formatStudyTime(2 * 3600 + 14 * 60)).toBe("2h 14m");
  });

  it("rounds to the nearest minute", () => {
    expect(formatStudyTime(59 * 60 + 40)).toBe("1h");
    expect(formatStudyTime(90)).toBe("2m");
  });
});
