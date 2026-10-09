import { describe, expect, it } from "vitest";

import { fold, rankPeople } from "./people";

const person = (displayName: string, email: string | null = null) => ({ displayName, email });

describe("rankPeople", () => {
  it("puts first/last-name prefix matches first and keeps server order otherwise", () => {
    const people = [person("Linh Trần"), person("An Phạm"), person("Khoa Lê", "an.khoa@x.vn")];
    expect(rankPeople(people, "an").map((entry) => entry.displayName)).toEqual(["An Phạm", "Khoa Lê", "Linh Trần"]);
  });

  it("ignores diacritics", () => {
    expect(fold("Đặng Trần")).toBe("dang tran");
    expect(rankPeople([person("Minh Nguyễn"), person("Trần Đức")], "duc")[0]?.displayName).toBe("Trần Đức");
  });
});
