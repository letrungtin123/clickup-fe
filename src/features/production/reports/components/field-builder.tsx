import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { cn } from "cn";
import {
  ArrowLeftRight,
  ChevronDown,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  Check,
  CircleDot,
  Clock,
  Coins,
  Ellipsis,
  FolderKanban,
  GripVertical,
  Hash,
  Image,
  Percent,
  Plus,
  Shapes,
  Star,
  Tag,
  Tags,
  TextCursorInput,
  Timer,
  User,
  UsersRound,
  Workflow,
  X,
  type LucideIcon
} from "lucide-react";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CustomField } from "@/contracts/production-catalog";
import {
  reportDimensions,
  reportMeasureInfo,
  type CustomFieldDimensionEntity,
  type ReportDimension,
  type ReportValueFormat
} from "@/contracts/production-reports";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { createControlAwareSensors } from "@/lib/dnd-sensors";
import { toneClass } from "@/lib/colors";

import { touchTargets } from "../../ui";
import {
  customEntityLabels,
  customFieldDimensionId,
  dimensionMeta,
  emptyCatalog,
  fieldCatalog,
  type DimensionKey,
  type FieldCatalog
} from "../dimensions";
import {
  chipKey,
  maxDimensions,
  measuresForRole,
  placeChip,
  removeChip,
  swapRowsAndColumns,
  zoneLabels,
  zoneOfChip,
  type Chip,
  type Zone,
  type Zones
} from "../model";

/**
 * Report-builder fields (SPEC Phase 5 §4): the palette of dimension, custom-field and measure chips and
 * the three drop zones "Hàng", "Cột", "Giá trị". Mouse: drag (4px threshold); touch: press-and-hold to
 * drag, tap to add. Without dragging: tap a palette chip to add / remove it, "+" adds to a given zone,
 * "⋯" on a placed chip moves it between zones or reorders it. Custom fields (PLAN §10 "Năng lực") are
 * dimension chips with a badge naming whose value it is (NV / Job / Task / Khách).
 */

const dimensionIcons: Record<ReportDimension, LucideIcon> = {
  user: User,
  team: UsersRound,
  project: FolderKanban,
  client: Building2,
  process: Workflow,
  shift: Clock,
  status: CircleDot,
  task_kind: Shapes,
  job: Briefcase,
  day: CalendarDays,
  week: CalendarRange,
  month: Calendar,
  period: CalendarCheck2
};

const measureIcons: Partial<Record<ReportValueFormat, LucideIcon>> = {
  points: Star,
  money: Coins,
  images: Image,
  count: Hash,
  percent: Percent,
  hours: Timer,
  decimal: Hash
};

const fieldTypeIcons: Record<CustomField["type"], LucideIcon> = {
  SELECT: Tag,
  MULTISELECT: Tags,
  TEXT: TextCursorInput,
  NUMBER: Hash,
  DATE: Calendar
};

/** Short badge of a custom-field chip (full wording in its title). */
const entityBadges: Record<CustomFieldDimensionEntity, string> = {
  user: "NV",
  job: "Job",
  task: "Task",
  client: "Khách"
};

/** Custom fields of the builder: definitions for chip labels and the role's usable fields. */
const FieldsContext = createContext<{ catalog: FieldCatalog; fields: readonly CustomField[] }>({
  catalog: emptyCatalog,
  fields: []
});
const useCatalog = () => useContext(FieldsContext).catalog;

const chipLabel = (chip: Chip, catalog: FieldCatalog) =>
  chip.kind === "dimension"
    ? dimensionMeta(chip.name, catalog).label
    : reportMeasureInfo[chip.name].label;

const chipTone = (chip: Chip) =>
  toneClass(chip.kind === "measure" ? "violet" : dimensionMeta(chip.name).custom ? "teal" : "sky");

const { MouseSensor: BuilderMouseSensor, TouchSensor: BuilderTouchSensor } =
  createControlAwareSensors("[data-no-drag]");

/** Prefer the chip slot under the pointer (insert position), then the zone, then the closest rect. */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) {
    const slot = within.find((entry) => String(entry.id).startsWith("slot:"));
    return slot ? [slot] : within;
  }
  return rectIntersection(args);
};

type DropTarget = { zone: Zone | "palette"; index?: number };

const ChipFace = ({
  chip,
  className,
  children,
  handle
}: {
  chip: Chip;
  className?: string;
  children?: ReactNode;
  /** Props of the drag handle (icon + label) for placed chips. */
  handle?: HTMLAttributes<HTMLSpanElement>;
}) => {
  const catalog = useCatalog();
  const custom = chip.kind === "dimension" ? dimensionMeta(chip.name, catalog).custom : null;
  const Icon =
    chip.kind === "measure"
      ? (measureIcons[reportMeasureInfo[chip.name].format] ?? Hash)
      : custom
        ? fieldTypeIcons[custom.field?.type ?? "SELECT"]
        : dimensionIcons[chip.name as ReportDimension];
  return (
    <span
      className={cn(
        chipTone(chip),
        "inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-lg border border-(--tone)/25 bg-(--tone-soft) px-2 text-[13px] font-medium text-(--tone-text) pointer-coarse:min-h-10 max-sm:min-h-10",
        className
      )}
    >
      <span
        {...handle}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 self-stretch",
          handle && "cursor-grab touch-manipulation active:cursor-grabbing"
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {/* Narrow zones (tablet, 1024 with the palette column): wrap instead of cutting the name. */}
        <span
          className="line-clamp-2 py-0.5 text-left leading-snug break-words"
          title={chipLabel(chip, catalog)}
        >
          {chipLabel(chip, catalog)}
        </span>
        {custom ? (
          <span
            className="shrink-0 rounded-[0.3rem] bg-(--tone)/15 px-1 py-px text-[10px] leading-tight font-semibold tracking-wide uppercase"
            title={`Trường tùy chỉnh của ${customEntityLabels[custom.entity].toLowerCase()}`}
          >
            {entityBadges[custom.entity]}
          </span>
        ) : null}
      </span>
      {children}
    </span>
  );
};

// Palette ----------------------------------------------------------------------------------------------

const PaletteChip = ({
  chip,
  placed,
  onToggle
}: {
  chip: Chip;
  placed: boolean;
  onToggle: () => void;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${chipKey(chip)}`,
    data: { chip }
  });
  const label = chipLabel(chip, useCatalog());
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onToggle}
      aria-pressed={placed}
      aria-label={placed ? `${label}: đang dùng, bấm để bỏ` : `${label}: bấm để thêm`}
      title={placed ? "Đang dùng — bấm để bỏ" : "Kéo vào Hàng, Cột hoặc Giá trị — hoặc bấm để thêm"}
      className={cn(
        "group/chip touch-manipulation rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <ChipFace
        chip={chip}
        className={cn(
          "transition-colors duration-150 group-hover/chip:border-(--tone)/50",
          placed && "border-dashed bg-transparent text-foreground-muted"
        )}
      >
        {placed ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      </ChipFace>
    </button>
  );
};

const PaletteGroup = ({
  title,
  hint,
  note,
  children
}: {
  title: string;
  hint: string;
  note?: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        {title}
      </h3>
      <span className="text-right text-[11px] text-foreground-subtle">{hint}</span>
    </div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
    {note ? (
      <p className="text-[11px] leading-snug text-pretty text-foreground-subtle">{note}</p>
    ) : null}
  </div>
);

/** Custom-field chips shown before "N trường khác". */
const foldedFieldCount = 6;

const Palette = ({
  zones,
  isAdmin,
  onToggle
}: {
  zones: Zones;
  isAdmin: boolean;
  onToggle: (chip: Chip) => void;
}) => {
  const { fields } = useContext(FieldsContext);
  // Choice fields (Năng lực, Ưu tiên…) group well; free-text ones come last. The palette shows the
  // first few and folds the rest (placed chips always stay visible) so the result stays in reach.
  const [allFields, setAllFields] = useState(false);
  const orderedFields = [
    ...fields.filter((field) => field.type !== "TEXT"),
    ...fields.filter((field) => field.type === "TEXT")
  ];
  const shownFields = orderedFields.filter(
    (field, index) =>
      allFields ||
      index < foldedFieldCount ||
      zoneOfChip(zones, { kind: "dimension", name: customFieldDimensionId(field) }) !== null
  );
  const hiddenFields = orderedFields.length - shownFields.length;
  const { setNodeRef, isOver } = useDroppable({
    id: "palette",
    data: { zone: "palette" } satisfies DropTarget
  });
  const dimensionCount = zones.rows.length + zones.columns.length;
  // Phones: the palette starts folded so the zones and the result stay in reach ("+" adds too).
  const mobile = useBreakpoint() === "mobile";
  const [expanded, setExpanded] = useState(false);
  const folded = mobile && !expanded;
  return (
    <section
      ref={setNodeRef}
      aria-label="Trường dữ liệu"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-surface p-4 shadow-xs transition-colors duration-150",
        folded && "gap-0 p-1",
        isOver && "border-danger/40 bg-danger-soft"
      )}
    >
      {mobile ? (
        <Button
          variant="ghost"
          className="h-10 w-full justify-between px-3"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="flex min-w-0 flex-col items-start">
            <span className="text-sm font-semibold">Trường dữ liệu</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
            {dimensionCount} chiều · {zones.values.length} chỉ số
            <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
          </span>
        </Button>
      ) : null}
      {folded ? null : (
        <>
          <PaletteGroup title="Chiều" hint={`${dimensionCount}/${maxDimensions} đang dùng`}>
            {reportDimensions.map((name) => {
              const chip: Chip = { kind: "dimension", name };
              return (
                <PaletteChip
                  key={name}
                  chip={chip}
                  placed={zoneOfChip(zones, chip) !== null}
                  onToggle={() => onToggle(chip)}
                />
              );
            })}
          </PaletteGroup>
          {fields.length > 0 ? (
            <PaletteGroup
              title="Trường tùy chỉnh"
              hint={isAdmin ? "Do Quản trị tạo" : "Của job, task, khách"}
              note={
                fields.some((field) => field.type === "MULTISELECT") ? (
                  <>
                    <Tags className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" />
                    Trường chọn nhiều: một bản ghi được đếm cho mỗi lựa chọn, dòng Tổng đếm một lần.
                  </>
                ) : undefined
              }
            >
              {shownFields.map((field) => {
                const chip: Chip = { kind: "dimension", name: customFieldDimensionId(field) };
                return (
                  <PaletteChip
                    key={chip.name}
                    chip={chip}
                    placed={zoneOfChip(zones, chip) !== null}
                    onToggle={() => onToggle(chip)}
                  />
                );
              })}
              {hiddenFields > 0 || allFields ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-8 rounded-lg px-2 text-[13px] text-foreground-muted pointer-coarse:min-h-10 max-sm:min-h-10"
                  aria-expanded={allFields}
                  onClick={() => setAllFields((value) => !value)}
                >
                  <ChevronDown className={cn("transition-transform", allFields && "rotate-180")} />
                  {allFields ? "Thu gọn" : `${hiddenFields} trường khác`}
                </Button>
              ) : null}
            </PaletteGroup>
          ) : null}
          <PaletteGroup title="Chỉ số" hint={`${zones.values.length} đang dùng`}>
            {measuresForRole(isAdmin).map((name) => {
              const chip: Chip = { kind: "measure", name };
              return (
                <PaletteChip
                  key={name}
                  chip={chip}
                  placed={zones.values.includes(name)}
                  onToggle={() => onToggle(chip)}
                />
              );
            })}
          </PaletteGroup>
          <p className="text-xs leading-relaxed text-foreground-muted">
            Kéo chip vào ô <b className="font-medium text-foreground">Hàng</b>,{" "}
            <b className="font-medium text-foreground">Cột</b> hoặc{" "}
            <b className="font-medium text-foreground">Giá trị</b>. Trên điện thoại: chạm để thêm,
            giữ rồi kéo để chọn ô. Kéo chip ngược về đây để bỏ.
          </p>
        </>
      )}
    </section>
  );
};

// Zones ------------------------------------------------------------------------------------------------

const ZoneChip = ({
  chip,
  zone,
  index,
  count,
  onMove,
  onRemove
}: {
  chip: Chip;
  zone: Zone;
  index: number;
  count: number;
  onMove: (target: Zone, index: number) => void;
  onRemove: () => void;
}) => {
  const drag = useDraggable({ id: `zone:${chipKey(chip)}`, data: { chip } });
  const drop = useDroppable({
    id: `slot:${zone}:${index}`,
    data: { zone, index } satisfies DropTarget
  });
  const label = chipLabel(chip, useCatalog());
  const other: Zone | null = zone === "rows" ? "columns" : zone === "columns" ? "rows" : null;
  return (
    <li
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={cn(
        "relative flex min-w-0 touch-manipulation",
        drag.isDragging && "opacity-40",
        drop.isOver &&
          !drag.isDragging &&
          "before:absolute before:inset-y-0 before:-left-1 before:w-0.5 before:rounded-full before:bg-brand"
      )}
    >
      <ChipFace
        chip={chip}
        className="max-w-full pr-0.5"
        handle={{
          ...(drag.listeners as HTMLAttributes<HTMLSpanElement>),
          "aria-roledescription": drag.attributes["aria-roledescription"],
          title: "Kéo để chuyển ô hoặc đổi thứ tự"
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            data-no-drag=""
            render={
              <button
                type="button"
                className="ml-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-(--tone)/15 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9 max-sm:size-10"
                aria-label={`Tuỳ chọn ${label}`}
              />
            }
          >
            <Ellipsis className="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {other ? (
              <DropdownMenuItem onClick={() => onMove(other, Number.MAX_SAFE_INTEGER)}>
                <ArrowLeftRight />
                Chuyển sang {zoneLabels[other]}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={index === 0} onClick={() => onMove(zone, index - 1)}>
              Đưa lên trước
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index >= count - 1} onClick={() => onMove(zone, index + 2)}>
              Đưa ra sau
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <X />
              Bỏ khỏi báo cáo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          data-no-drag=""
          onClick={onRemove}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-(--tone)/15 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-9 max-sm:size-10"
          aria-label={`Bỏ ${label}`}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </ChipFace>
    </li>
  );
};

const AddToZone = ({
  zone,
  zones,
  isAdmin,
  onAdd
}: {
  zone: Zone;
  zones: Zones;
  isAdmin: boolean;
  onAdd: (chip: Chip) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { fields } = useContext(FieldsContext);
  const dimensions: DimensionKey[] = [...reportDimensions, ...fields.map(customFieldDimensionId)];
  const choices: Chip[] =
    zone === "values"
      ? measuresForRole(isAdmin)
          .filter((name) => !zones.values.includes(name))
          .map((name) => ({ kind: "measure", name }))
      : dimensions
          .filter((name) => !zones[zone].includes(name))
          .map((name) => ({ kind: "dimension", name }));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-foreground-muted"
            aria-label={`Thêm vào ${zoneLabels[zone]}`}
            disabled={choices.length === 0}
          />
        }
      >
        <Plus />
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("w-64 p-2", touchTargets)}>
        <p className="px-1 text-xs font-medium text-foreground-muted">
          Thêm vào {zoneLabels[zone]}
        </p>
        <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
          {choices.map((chip) => (
            <button
              key={chipKey(chip)}
              type="button"
              onClick={() => {
                onAdd(chip);
                setOpen(false);
              }}
              className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChipFace chip={chip} className="hover:border-(--tone)/50">
                {zoneOfChip(zones, chip) ? (
                  <span className="text-[11px] font-normal opacity-70">(chuyển)</span>
                ) : null}
              </ChipFace>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const zoneHints: Record<Zone, string> = {
  rows: "Mỗi giá trị là một dòng (trục của biểu đồ)",
  columns: "Mỗi giá trị là một nhóm cột (chuỗi của biểu đồ)",
  values: "Con số được tính cho từng ô"
};

const ZoneBox = ({
  zone,
  zones,
  dragging,
  isAdmin,
  onApply,
  extra
}: {
  zone: Zone;
  zones: Zones;
  dragging: Chip | null;
  isAdmin: boolean;
  onApply: (result: { zones: Zones; error: string | null }) => void;
  extra?: ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone:${zone}`,
    data: { zone } satisfies DropTarget
  });
  const chips: Chip[] =
    zone === "values"
      ? zones.values.map((name) => ({ kind: "measure", name }))
      : zones[zone].map((name) => ({ kind: "dimension", name }));
  const accepts = dragging !== null && (dragging.kind === "measure") === (zone === "values");
  return (
    <section
      ref={setNodeRef}
      aria-label={`Ô ${zoneLabels[zone]}`}
      className={cn(
        "flex min-h-28 min-w-0 flex-col gap-2 rounded-xl border bg-surface p-3 shadow-xs transition-[border-color,background-color,box-shadow] duration-150",
        accepts && "border-dashed border-brand/50",
        isOver && "border-brand bg-brand-soft ring-2 ring-brand/20"
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-sm font-semibold">{zoneLabels[zone]}</h3>
          <p className="text-[11px] text-pretty text-foreground-subtle">{zoneHints[zone]}</p>
        </div>
        {extra}
        <AddToZone
          zone={zone}
          zones={zones}
          isAdmin={isAdmin}
          onAdd={(chip) => onApply(placeChip(zones, chip, zone))}
        />
      </div>
      {chips.length === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-3 text-center text-xs text-foreground-subtle">
          {zone === "values"
            ? "Kéo chỉ số vào đây"
            : zone === "rows"
              ? "Kéo chiều vào đây"
              : "Tuỳ chọn — kéo chiều vào để chia cột"}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((chip, index) => (
            <ZoneChip
              key={chipKey(chip)}
              chip={chip}
              zone={zone}
              index={index}
              count={chips.length}
              onMove={(target, at) => onApply(placeChip(zones, chip, target, at))}
              onRemove={() => onApply({ zones: removeChip(zones, chip), error: null })}
            />
          ))}
        </ul>
      )}
    </section>
  );
};

// Builder ----------------------------------------------------------------------------------------------

export const FieldBuilder = ({
  zones,
  onChange,
  isAdmin,
  fields = [],
  catalog,
  children
}: {
  zones: Zones;
  onChange: (zones: Zones) => void;
  isAdmin: boolean;
  /** Custom fields the role can use (useReportFields). */
  fields?: readonly CustomField[];
  /** Definitions of every custom field, for the labels of placed chips. */
  catalog?: FieldCatalog;
  /** Rendered under the zones (range, filters…). */
  children?: ReactNode;
}) => {
  const [dragging, setDragging] = useState<Chip | null>(null);
  const fieldsValue = useMemo(
    () => ({ catalog: catalog ?? fieldCatalog(fields), fields }),
    [catalog, fields]
  );
  const sensors = useSensors(
    useSensor(BuilderMouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(BuilderTouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );

  const apply = (result: { zones: Zones; error: string | null }) => {
    if (result.error) toast.error(result.error);
    else onChange(result.zones);
  };

  const toggle = (chip: Chip) => {
    if (zoneOfChip(zones, chip) !== null) onChange(removeChip(zones, chip));
    else apply(placeChip(zones, chip, chip.kind === "measure" ? "values" : "rows"));
  };

  const onDragStart = (event: DragStartEvent) => {
    const chip = (event.active.data.current as { chip?: Chip } | undefined)?.chip;
    setDragging(chip ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const chip = (event.active.data.current as { chip?: Chip } | undefined)?.chip;
    const target = event.over?.data.current as DropTarget | undefined;
    if (!chip || !target) return;
    if (target.zone === "palette") {
      if (zoneOfChip(zones, chip) !== null) onChange(removeChip(zones, chip));
      return;
    }
    apply(placeChip(zones, chip, target.zone, target.index));
  };

  return (
    <FieldsContext.Provider value={fieldsValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Chip có thể kéo bằng chuột hoặc giữ ngón tay. Dùng nút ⋯ để chuyển ô bằng bàn phím."
          }
        }}
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <Palette zones={zones} isAdmin={isAdmin} onToggle={toggle} />
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid min-w-0 gap-3 md:grid-cols-3">
              <ZoneBox
                zone="rows"
                zones={zones}
                dragging={dragging}
                isAdmin={isAdmin}
                onApply={apply}
              />
              <ZoneBox
                zone="columns"
                zones={zones}
                dragging={dragging}
                isAdmin={isAdmin}
                onApply={apply}
                extra={
                  zones.rows.length > 0 || zones.columns.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-foreground-muted"
                      aria-label="Đảo Hàng và Cột"
                      title="Đảo Hàng và Cột"
                      onClick={() => onChange(swapRowsAndColumns(zones))}
                    >
                      <ArrowLeftRight />
                    </Button>
                  ) : null
                }
              />
              <ZoneBox
                zone="values"
                zones={zones}
                dragging={dragging}
                isAdmin={isAdmin}
                onApply={apply}
              />
            </div>
            {children}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {dragging ? (
            <ChipFace
              chip={dragging}
              className="cursor-grabbing shadow-lg ring-1 ring-foreground/10"
            >
              <GripVertical className="size-3.5 opacity-60" aria-hidden="true" />
            </ChipFace>
          ) : null}
        </DragOverlay>
      </DndContext>
    </FieldsContext.Provider>
  );
};
