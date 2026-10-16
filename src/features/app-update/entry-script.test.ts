import { describe, expect, it } from "vitest";

import { entryScriptOf } from "./entry-script";

describe("entryScriptOf", () => {
  it("reads the entry chunk of a built index.html, either attribute order", () => {
    expect(
      entryScriptOf('<script type="module" crossorigin src="/assets/index-AbC123.js"></script>')
    ).toBe("/assets/index-AbC123.js");
    expect(
      entryScriptOf('<script crossorigin src="/assets/index-Zz9.js" type="module"></script>')
    ).toBe("/assets/index-Zz9.js");
    expect(
      entryScriptOf('<script type="module" src="https://host/assets/index-Q1.js"></script>')
    ).toBe("/assets/index-Q1.js");
  });

  it("ignores other scripts (dev server, theme boot)", () => {
    expect(entryScriptOf('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
    expect(entryScriptOf('<script src="/theme-boot.js"></script>')).toBeNull();
  });
});
