import { describe, expect, it } from "vitest";

import type { CustomField } from "@/contracts/production-catalog";

import {
  fieldsFor,
  formatCustomValue,
  isEmptyValue,
  optionValueFrom,
  slugifyFieldKey,
  toCustomValuesPayload,
  validateCustomValues
} from "./custom-fields";

let seq = 0;
const field = (overrides: Partial<CustomField>): CustomField => ({
  id: `00000000-0000-4000-8000-${String((seq += 1)).padStart(12, "0")}`,
  entity: "CLIENT",
  key: "note",
  label: "Ghi chú",
  type: "TEXT",
  options: [],
  required: false,
  showInTable: false,
  sortOrder: 0,
  active: true,
  ...overrides
});

const size = field({
  key: "size",
  label: "Quy mô",
  type: "SELECT",
  required: true,
  options: [
    { value: "small", label: "Nhỏ" },
    { value: "large", label: "Lớn", color: "rose" }
  ]
});
const channels = field({
  key: "channels",
  label: "Kênh",
  type: "MULTISELECT",
  options: [
    { value: "mail", label: "Email" },
    { value: "chat", label: "Chat" }
  ]
});
const budget = field({ key: "budget", label: "Ngân sách", type: "NUMBER" });
const since = field({ key: "since", label: "Từ ngày", type: "DATE" });

describe("fieldsFor", () => {
  it("keeps active fields of one entity in sort order", () => {
    const fields = [
      field({ key: "b", sortOrder: 20 }),
      field({ key: "a", sortOrder: 10 }),
      field({ key: "c", sortOrder: 5, active: false }),
      field({ key: "d", entity: "JOB" })
    ];
    expect(fieldsFor(fields, "CLIENT").map((item) => item.key)).toEqual(["a", "b"]);
  });
});

describe("validateCustomValues", () => {
  const fields = [size, channels, budget, since];

  it("flags required, number, date and option errors", () => {
    expect(
      validateCustomValues(
        fields,
        { channels: ["mail", "fax"], budget: "abc", since: "2026-02-30" },
        { enforceRequired: true }
      )
    ).toEqual({
      size: "Bắt buộc.",
      channels: "Có lựa chọn không còn tồn tại.",
      budget: "Nhập một số.",
      since: "Chọn một ngày."
    });
  });

  it("accepts valid values and skips required checks on partial updates", () => {
    expect(
      validateCustomValues(
        fields,
        { size: "large", channels: ["chat"], budget: "12,5", since: "2026-10-09" },
        { enforceRequired: true }
      )
    ).toEqual({});
    expect(validateCustomValues(fields, {}, { enforceRequired: false })).toEqual({});
  });
});

describe("toCustomValuesPayload", () => {
  it("parses numbers, trims text and clears empty values with null", () => {
    const note = field({ key: "note" });
    expect(
      toCustomValuesPayload([note, budget, channels, size], {
        note: "  xin chào ",
        budget: "1,5",
        channels: [],
        other: "kept out"
      })
    ).toEqual({ note: "xin chào", budget: 1.5, channels: null, size: null });
  });
});

describe("formatCustomValue", () => {
  it("renders option labels, dates and numbers", () => {
    expect(formatCustomValue(size, "large")).toBe("Lớn");
    expect(formatCustomValue(channels, ["mail", "chat"])).toBe("Email, Chat");
    expect(formatCustomValue(since, "2026-10-09")).toBe("09/10/2026");
    expect(formatCustomValue(budget, 1234.5)).toBe("1.234,5");
    expect(formatCustomValue(size, null)).toBe("");
  });

  it("knows what an empty value is", () => {
    expect(isEmptyValue(" ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
  });
});

describe("keys", () => {
  it("slugifies Vietnamese labels into API keys", () => {
    expect(slugifyFieldKey("Mã đơn hàng")).toBe("ma_don_hang");
    expect(slugifyFieldKey("  Năng lực (A++) ")).toBe("nang_luc_a");
    expect(slugifyFieldKey("2026 Ghi chú")).toBe("ghi_chu");
    expect(slugifyFieldKey("!!!")).toBe("");
    expect(slugifyFieldKey("a".repeat(60))).toHaveLength(40);
  });

  it("derives unique option values", () => {
    expect(optionValueFrom("Lớn", new Set())).toBe("lon");
    expect(optionValueFrom("Lớn", new Set(["lon"]))).toBe("lon_2");
    expect(optionValueFrom("***", new Set())).toBe("lua_chon");
  });
});
