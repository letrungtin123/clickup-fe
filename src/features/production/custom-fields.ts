import type { CustomField, CustomFieldEntity, CustomValues } from "@/contracts/production-catalog";

import { formatDay, isDay } from "./format";

/**
 * Pure helpers for admin-defined custom fields (SPEC Phase 1 §5). The API validates again and
 * answers 400 CUSTOM_FIELDS_INVALID with a Vietnamese message; these checks only give instant
 * feedback in forms. Unit tested in custom-fields.test.ts.
 */

export type CustomFieldType = CustomField["type"];
export type CustomValue = CustomValues[string];

export const customFieldEntityLabels: Record<CustomFieldEntity, string> = {
  JOB: "Job",
  TASK: "Task",
  USER: "Thành viên",
  CLIENT: "Khách hàng"
};

export const customFieldTypeLabels: Record<CustomFieldType, string> = {
  TEXT: "Văn bản",
  NUMBER: "Số",
  DATE: "Ngày",
  SELECT: "Chọn một",
  MULTISELECT: "Chọn nhiều"
};

export const isOptionType = (type: CustomFieldType) => type === "SELECT" || type === "MULTISELECT";

/** Active fields of one entity in display order. */
export const fieldsFor = (fields: readonly CustomField[], entity: CustomFieldEntity) =>
  fields
    .filter((field) => field.entity === entity && field.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

export const isEmptyValue = (value: CustomValue | undefined) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

/**
 * Field errors keyed by field key: required values (when `enforceRequired`), numbers, dates and
 * option membership. Mirrors BE validateCustomValues.
 */
export const validateCustomValues = (
  fields: readonly CustomField[],
  values: CustomValues,
  options: { enforceRequired: boolean }
) => {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (isEmptyValue(value)) {
      if (options.enforceRequired && field.required) errors[field.key] = "Bắt buộc.";
      continue;
    }
    const allowed = new Set(field.options.map((option) => option.value));
    switch (field.type) {
      case "TEXT":
        if (typeof value !== "string" || value.length > 2000)
          errors[field.key] = "Tối đa 2000 ký tự.";
        break;
      case "NUMBER": {
        const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (!Number.isFinite(number) || Math.abs(number) > 1e12) errors[field.key] = "Nhập một số.";
        break;
      }
      case "DATE":
        if (typeof value !== "string" || !isDay(value)) errors[field.key] = "Chọn một ngày.";
        break;
      case "SELECT":
        if (typeof value !== "string" || !allowed.has(value))
          errors[field.key] = "Lựa chọn không còn tồn tại.";
        break;
      case "MULTISELECT":
        if (!Array.isArray(value) || value.some((item) => !allowed.has(item)))
          errors[field.key] = "Có lựa chọn không còn tồn tại.";
        break;
    }
  }
  return errors;
};

/**
 * Values to send: only keys of the given fields, numbers parsed, empty values as null (the API
 * deletes the key), so values of archived fields are left untouched.
 */
export const toCustomValuesPayload = (fields: readonly CustomField[], values: CustomValues) => {
  const payload: CustomValues = {};
  for (const field of fields) {
    const value = values[field.key];
    if (isEmptyValue(value)) {
      payload[field.key] = null;
      continue;
    }
    if (field.type === "NUMBER" && typeof value === "string") {
      payload[field.key] = Number(value.replace(",", "."));
      continue;
    }
    payload[field.key] = typeof value === "string" ? value.trim() : (value ?? null);
  }
  return payload;
};

const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });

/** Plain-text rendering of a value (tables, summaries). */
export const formatCustomValue = (field: CustomField, value: CustomValue | undefined) => {
  if (isEmptyValue(value)) return "";
  const labelOf = (item: string) =>
    field.options.find((option) => option.value === item)?.label ?? item;
  switch (field.type) {
    case "NUMBER":
      return typeof value === "number" ? numberFormatter.format(value) : String(value);
    case "DATE":
      return typeof value === "string" ? formatDay(value) : "";
    case "SELECT":
      return typeof value === "string" ? labelOf(value) : "";
    case "MULTISELECT":
      return Array.isArray(value) ? value.map(labelOf).join(", ") : "";
    default:
      return String(value);
  }
};

/** "Mã đơn hàng" → "ma_don_hang" (API key rule: ^[a-z][a-z0-9_]{0,39}$). */
export const slugifyFieldKey = (label: string) => {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "");
  return slug.slice(0, 40).replace(/_+$/, "");
};

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Option values are stable ids for stored data; derive from the label when left empty. */
export const optionValueFrom = (label: string, taken: ReadonlySet<string>) => {
  const base = slugifyFieldKey(label) || "lua_chon";
  let value = base.slice(0, 80);
  let suffix = 2;
  while (taken.has(value)) {
    value = `${base.slice(0, 76)}_${suffix}`;
    suffix += 1;
  }
  return value;
};
