import type { CustomField, CustomFieldEntity } from "@/contracts/production-catalog";
import {
  customFieldDimensionEntities,
  isCustomFieldDimension,
  parseCustomFieldDimension,
  reportDimensionInfo,
  type CustomFieldDimension,
  type CustomFieldDimensionEntity,
  type ReportColumn,
  type ReportDimensionKey,
  type ReportValueFormat
} from "@/contracts/production-reports";

/**
 * Report dimensions, fixed or custom-field ones (PLAN §8/§10 "Năng lực A++/A/B lọc được trong báo cáo"):
 * `cf_<entity>:<key>` ids built from the admin-defined fields (GET /production/custom-fields). Only active
 * SELECT, MULTISELECT and TEXT fields can group a report; USER fields are Admin data (the API answers 403
 * CUSTOM_FIELDS_FORBIDDEN to others). Pure — unit tested in dimensions.test.ts.
 */

export type DimensionKey = ReportDimensionKey;

/** Custom fields usable by the builder, by dimension id ("cf_user:nang_luc" → field). */
export type FieldCatalog = ReadonlyMap<string, CustomField>;

export const emptyCatalog: FieldCatalog = new Map();

const entityOfField: Record<CustomFieldEntity, CustomFieldDimensionEntity> = {
  USER: "user",
  JOB: "job",
  TASK: "task",
  CLIENT: "client"
};

/** Badge of a custom-field chip: whose value it is. */
export const customEntityLabels: Record<CustomFieldDimensionEntity, string> = {
  user: "Nhân viên",
  job: "Job",
  task: "Task",
  client: "Khách hàng"
};

const reportableTypes: ReadonlySet<CustomField["type"]> = new Set([
  "SELECT",
  "MULTISELECT",
  "TEXT"
]);

export const customFieldDimensionId = (
  field: Pick<CustomField, "entity" | "key">
): CustomFieldDimension => `cf_${entityOfField[field.entity]}:${field.key}`;

/**
 * Fields the role may use in a report, in palette order (person, job, task, client; then the admin's
 * order): active SELECT / MULTISELECT / TEXT fields; USER fields only for ADMIN.
 */
export const reportFields = (fields: readonly CustomField[], isAdmin: boolean): CustomField[] =>
  fields
    .filter(
      (field) =>
        field.active &&
        reportableTypes.has(field.type) &&
        (isAdmin || field.entity !== "USER") &&
        isCustomFieldDimension(customFieldDimensionId(field))
    )
    .sort(
      (a, b) =>
        customFieldDimensionEntities.indexOf(entityOfField[a.entity]) -
          customFieldDimensionEntities.indexOf(entityOfField[b.entity]) ||
        a.sortOrder - b.sortOrder ||
        a.label.localeCompare(b.label, "vi")
    );

export const fieldCatalog = (fields: readonly CustomField[]): FieldCatalog =>
  new Map(fields.map((field) => [customFieldDimensionId(field), field]));

export type DimensionMeta = {
  label: string;
  kind: "entity" | "enum" | "time";
  format: ReportValueFormat;
  /** Custom-field dimensions: entity, key and the definition when known. */
  custom: { entity: CustomFieldDimensionEntity; key: string; field: CustomField | null } | null;
};

/**
 * Label, kind and value format of any dimension. A custom field missing from the catalog (inactive,
 * or USER fields for a non-admin) keeps a readable label from its key.
 */
export const dimensionMeta = (
  dimension: DimensionKey,
  catalog: FieldCatalog = emptyCatalog
): DimensionMeta => {
  const parsed = parseCustomFieldDimension(dimension);
  if (!parsed) {
    const info = reportDimensionInfo[dimension as keyof typeof reportDimensionInfo];
    return { label: info.label, kind: info.kind, format: info.format, custom: null };
  }
  const field = catalog.get(dimension) ?? null;
  return {
    label: field?.label ?? `Trường "${parsed.key}"`,
    kind: "entity",
    format: "text",
    custom: { entity: parsed.entity, key: parsed.key, field }
  };
};

export const dimensionLabel = (dimension: DimensionKey, catalog?: FieldCatalog) =>
  dimensionMeta(dimension, catalog).label;

/** Header of a result column: the server's label (custom fields) first, then the builder's. */
export const columnLabel = (
  dimension: DimensionKey,
  columns: readonly Pick<ReportColumn, "key" | "label">[] | undefined,
  catalog?: FieldCatalog
) =>
  columns?.find((column) => column.key === dimension)?.label ?? dimensionLabel(dimension, catalog);

/** MULTISELECT dimensions count a record once per chosen option (totals count it once). */
export const isMultiValueDimension = (dimension: DimensionKey, catalog: FieldCatalog) =>
  catalog.get(dimension)?.type === "MULTISELECT";

export const multiValueDimensions = (dimensions: readonly DimensionKey[], catalog: FieldCatalog) =>
  new Set(dimensions.filter((dimension) => isMultiValueDimension(dimension, catalog)));

export const isUserFieldDimension = (dimension: string) =>
  parseCustomFieldDimension(dimension)?.entity === "user";

/** Every custom-field dimension a config uses (dimensions and filters). */
export const customFieldsUsed = (config: {
  dimensions: readonly DimensionKey[];
  filters: { customFields?: readonly { field: string }[] | undefined };
}) => [
  ...new Set<string>([
    ...config.dimensions.filter((dimension) => isCustomFieldDimension(dimension)),
    ...(config.filters.customFields ?? []).map((filter) => filter.field)
  ])
];
