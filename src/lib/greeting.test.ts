import { describe, expect, it } from "vitest";

import { greetingFor } from "./greeting";

const at = (hour: number, minute = 0) => new Date(2026, 9, 10, hour, minute);

describe("greetingFor (WK-53)", () => {
  it("does not say good morning in the middle of the night", () => {
    expect(greetingFor(at(0, 30))).toBe("Khuya rồi");
    expect(greetingFor(at(3, 59))).toBe("Khuya rồi");
    expect(greetingFor(at(4))).toBe("Chào buổi sáng");
  });

  it("covers the rest of the day", () => {
    expect(greetingFor(at(12))).toBe("Chào buổi trưa");
    expect(greetingFor(at(15))).toBe("Chào buổi chiều");
    expect(greetingFor(at(23, 59))).toBe("Chào buổi tối");
  });
});
