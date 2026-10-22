import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import { Globe2, Info, Save, Undo2 } from "lucide-react";
import { Fragment, useId, type ReactNode } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldPath,
  type UseFormRegisterReturn
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  CoreTimeSchema,
  defaultAlertAfterHours,
  defaultCoreWindow,
  isKpiCloseDay,
  kpiCloseDayEndOfMonth,
  type ProductionSettings
} from "@/contracts/production-catalog";
import {
  FormAlert,
  InfoNote,
  PageIntro,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { useCanEditProductionConfig } from "@/features/production/config-access";
import { productionErrorMessage } from "@/features/production/errors";
import {
  closeDayChange,
  closeDayLabel,
  formatDay,
  formatKpiPeriod,
  todayIn
} from "@/features/production/format";
import { useProductionSettings, useUpdateSettings } from "@/features/production/hooks";
import { khoanPolicyMeta, topUpRule } from "@/features/production/kpi/khoan-policy";
import { isApiError } from "@/lib/api/errors";

/** Close days offered: 1–28 (every month has them), then 31 = "Cuối tháng" (PD-032). */
const closeDayItems = [
  ...Array.from({ length: 28 }, (_, index) => ({
    value: String(index + 1),
    label: `Ngày ${index + 1}`
  })),
  { value: String(kpiCloseDayEndOfMonth), label: "Cuối tháng" }
];

const intIn = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, message)
    .refine((value) => Number(value) >= min && Number(value) <= max, message);

// Points have at most two decimals: "2.610" is a Vietnamese thousands group, not 2,61 — reject it
// instead of silently saving a KPI a thousand times too small.
const decimalIn = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, message)
    .refine((value) => {
      const number = Number(value.replace(",", "."));
      return number >= min && number <= max;
    }, message);

const kpiMessage =
  "Nhập số điểm từ 0 đến 1.000.000, không dấu chấm ngăn cách (vd 2610 hoặc 2610,5).";

const toNumber = (value: string) => Number(value.replace(",", "."));

/** PD-080: the same wording as the API (request refine / 400 CORE_WINDOW_INVALID). */
const coreWindowMessage = "Giờ bắt đầu khung lõi phải trước giờ kết thúc.";
const alertMessage = "Từ 0,25 đến 24 giờ, bước 0,25 (vd 2 hoặc 1,5).";

const formSchema = z
  .object({
    kpiCloseDay: z
      .string()
      .refine((value) => isKpiCloseDay(Number(value)), "Chọn ngày từ 1 đến 28 hoặc Cuối tháng."),
    kpiDefaultMember: decimalIn(0, 1_000_000, kpiMessage),
    kpiDefaultLeader: decimalIn(0, 1_000_000, kpiMessage),
    kpiProrateLeave: z.boolean(),
    /** Retired (PD-052): no control; the stored value is sent back unchanged so the PATCH stays complete. */
    scoresPublic: z.boolean(),
    dueSoonHours: intIn(1, 72, "Từ 1 đến 72 giờ."),
    anomalyFailPercent: decimalIn(0, 100, "Từ 0 đến 100%."),
    chatAttachmentsEnabled: z.boolean(),
    /** PD-080 "Khung giờ lõi" of the Overview clocks (HH:MM, organization time). */
    coreWindowStart: CoreTimeSchema,
    coreWindowEnd: CoreTimeSchema,
    /** PD-080 "Cảnh báo sau": core-time hours, in steps of 0,25 (15 minutes). */
    alertAfterHours: decimalIn(0.25, 24, alertMessage).refine(
      (value) => Number.isInteger(toNumber(value) * 4),
      alertMessage
    )
  })
  .refine((value) => value.coreWindowStart < value.coreWindowEnd, {
    message: coreWindowMessage,
    path: ["coreWindowEnd"]
  });
type FormValues = z.infer<typeof formSchema>;

const toForm = (settings: ProductionSettings): FormValues => ({
  kpiCloseDay: String(settings.kpiCloseDay),
  kpiDefaultMember: String(settings.kpiDefaultMember),
  kpiDefaultLeader: String(settings.kpiDefaultLeader),
  kpiProrateLeave: settings.kpiProrateLeave,
  scoresPublic: settings.scoresPublic,
  dueSoonHours: String(settings.dueSoonHours),
  anomalyFailPercent: String(Math.round(settings.anomalyFailRate * 10_000) / 100),
  chatAttachmentsEnabled: settings.chatAttachmentsEnabled,
  coreWindowStart: settings.coreWindowStart,
  coreWindowEnd: settings.coreWindowEnd,
  alertAfterHours: String(settings.alertAfterHours)
});

const toMinutes = (time: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const hoursLabel = (hours: number) => String(hours).replace(".", ",");

/**
 * The worked example of the core-window clocks for the given values: a job entering "Chờ QC" 30 minutes before the
 * window closes counts 30 minutes that day, resumes when the window opens on the next working day and alerts once the
 * threshold is reached (09:30 – 16:30, 2 h: 16:00 → 11:00). Null when the values do not tell that story (window under
 * an hour, threshold of 30 minutes or less, or longer than the next day's window).
 */
const coreExample = (start: string, end: string, hours: number) => {
  const from = toMinutes(start);
  const to = toMinutes(end);
  const threshold = Math.round(hours * 60);
  const before = 30;
  if (from === null || to === null || !Number.isFinite(threshold)) return null;
  if (to - from < 60 || threshold <= before || threshold - before > to - from) return null;
  return {
    start,
    end,
    hours,
    enter: toTime(to - before),
    alert: toTime(from + threshold - before)
  };
};

/**
 * Organization-wide production settings (Admin). Timezone is fixed server-side. PD-050: only the organization
 * superadmin changes them; everyone else reads the values as text (no inputs, switches or save bar). PD-066: the Khoán
 * pay policy and "Công khai tiền công" are no longer settings — the page states the fixed rule (TOP_UP) and who sees
 * money (the owner, "Xem tiền Khoán người khác").
 */
export const ProductionGeneralRoute = () => {
  const canEdit = useCanEditProductionConfig();
  const settings = useProductionSettings();
  return (
    <SettingsPage>
      <PageIntro slug="general" />
      {settings.isPending ? (
        <div className="flex flex-col gap-4" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} readOnly={!canEdit} />
      )}
    </SettingsPage>
  );
};

/** A setting's value for a read-only viewer, in place of its control. */
const ReadOnlyValue = ({ children, muted = false }: { children: ReactNode; muted?: boolean }) => (
  <span
    className={cn(
      "inline-flex min-h-8 items-center text-[13px] font-medium tabular-nums",
      muted && "text-foreground-muted"
    )}
  >
    {children}
  </span>
);

const SettingsForm = ({
  settings,
  readOnly
}: {
  settings: ProductionSettings;
  readOnly: boolean;
}) => {
  const ids = useId();
  const update = useUpdateSettings();
  const { register, control, handleSubmit, formState, reset, setError } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: toForm(settings),
    resetOptions: { keepDirtyValues: false }
  });
  const closeDay = Number(useWatch({ control, name: "kpiCloseDay" })) || settings.kpiCloseDay;
  // G15: a new close day applies from the next period; the current period keeps its dates.
  const plan = isKpiCloseDay(closeDay)
    ? closeDayChange(todayIn(settings.timezone), settings.kpiCloseDays, closeDay)
    : null;
  const dirty = formState.isDirty;
  // PD-080: the worked example follows the values being typed (the defaults' while they do not make one).
  const [coreStart, coreEnd, alertHours] = useWatch({
    control,
    name: ["coreWindowStart", "coreWindowEnd", "alertAfterHours"]
  });
  const example =
    coreExample(coreStart, coreEnd, toNumber(alertHours)) ??
    coreExample(defaultCoreWindow.start, defaultCoreWindow.end, defaultAlertAfterHours);
  const coreError =
    formState.errors.coreWindowStart?.message ?? formState.errors.coreWindowEnd?.message;

  const onSubmit = handleSubmit((values) =>
    update.mutate(
      {
        kpiCloseDay: Number(values.kpiCloseDay),
        kpiDefaultMember: toNumber(values.kpiDefaultMember),
        kpiDefaultLeader: toNumber(values.kpiDefaultLeader),
        kpiProrateLeave: values.kpiProrateLeave,
        scoresPublic: values.scoresPublic,
        dueSoonHours: Number(values.dueSoonHours),
        anomalyFailRate: Math.round(toNumber(values.anomalyFailPercent) * 100) / 10_000,
        chatAttachmentsEnabled: values.chatAttachmentsEnabled,
        coreWindowStart: values.coreWindowStart,
        coreWindowEnd: values.coreWindowEnd,
        alertAfterHours: toNumber(values.alertAfterHours)
      },
      {
        onSuccess: (saved) => {
          reset(toForm(saved));
          const notes = [
            plan?.changes && Number(values.kpiCloseDay) !== plan.inForce
              ? `Chốt ${closeDayLabel(Number(values.kpiCloseDay))} áp dụng từ kỳ ${formatKpiPeriod(plan.next)}.`
              : null
          ].filter((note): note is string => note !== null);
          toast.success(
            "Đã lưu cài đặt Photo Retouch",
            notes.length > 0 ? { description: notes.join(" ") } : undefined
          );
        },
        onError: (error) =>
          // PD-080: the API checks the core window too (one end against the stored other one).
          isApiError(error) && error.code === "CORE_WINDOW_INVALID"
            ? setError("coreWindowEnd", { message: coreWindowMessage })
            : setError("root", { message: productionErrorMessage(error) })
      }
    )
  );

  const numberField = (
    name:
      | "kpiDefaultMember"
      | "kpiDefaultLeader"
      | "dueSoonHours"
      | "anomalyFailPercent"
      | "alertAfterHours",
    label: string,
    hint: ReactNode,
    suffix: string
  ) => {
    const error = formState.errors[name]?.message;
    if (readOnly) {
      return (
        <SettingRow
          labelId={`${ids}-${name}`}
          label={label}
          hint={hint}
          control={
            <ReadOnlyValue>
              {toForm(settings)[name].replace(".", ",")}
              <span className="ml-1.5 font-normal text-foreground-muted">{suffix}</span>
            </ReadOnlyValue>
          }
        />
      );
    }
    return (
      <SettingRow
        htmlFor={`${ids}-${name}`}
        label={label}
        hint={hint}
        error={error}
        control={
          <div className="flex items-center gap-2">
            <Input
              id={`${ids}-${name}`}
              inputMode="decimal"
              aria-invalid={Boolean(error)}
              className="w-28 text-right tabular-nums"
              {...register(name)}
            />
            <span className="w-16 text-xs whitespace-nowrap text-foreground-muted">{suffix}</span>
          </div>
        }
      />
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4 pb-20"
      onSubmit={(event) => {
        if (readOnly) event.preventDefault();
        else void onSubmit(event);
      }}
    >
      <SettingsSection
        title="KPI"
        description="Áp dụng cho chốt KPI hằng tháng và dự báo trên bảng điểm."
      >
        <div className="divide-y">
          <SettingRow
            labelId={`${ids}-kpiCloseDay`}
            label="Ngày chốt KPI"
            hint={<CloseDayHint plan={plan} closeDay={closeDay} />}
            error={formState.errors.kpiCloseDay?.message}
            control={
              readOnly ? (
                <ReadOnlyValue>
                  {settings.kpiCloseDay === kpiCloseDayEndOfMonth
                    ? "Cuối tháng"
                    : `Ngày ${settings.kpiCloseDay} hằng tháng`}
                </ReadOnlyValue>
              ) : (
                <Controller
                  control={control}
                  name="kpiCloseDay"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Select
                        items={closeDayItems}
                        value={field.value}
                        onValueChange={(next: string | null) => {
                          if (next) field.onChange(next);
                        }}
                      >
                        <SelectTrigger
                          aria-labelledby={`${ids}-kpiCloseDay`}
                          aria-invalid={Boolean(formState.errors.kpiCloseDay)}
                          onBlur={field.onBlur}
                          className="w-28"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {closeDayItems.map((item) => (
                            <Fragment key={item.value}>
                              {item.value === String(kpiCloseDayEndOfMonth) ? (
                                <SelectSeparator />
                              ) : null}
                              <SelectItem value={item.value}>{item.label}</SelectItem>
                            </Fragment>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="w-16 text-xs whitespace-nowrap text-foreground-muted">
                        {closeDay === kpiCloseDayEndOfMonth ? "" : "hằng tháng"}
                      </span>
                    </div>
                  )}
                />
              )
            }
          />
          {numberField(
            "kpiDefaultMember",
            "KPI mặc định – Nhân viên",
            "Điểm/tháng khi áp KPI mặc định theo vai trò.",
            "điểm"
          )}
          {numberField(
            "kpiDefaultLeader",
            "KPI mặc định – Leader",
            "Điểm/tháng cho người giữ vai trò Leader.",
            "điểm"
          )}
          <SwitchRow
            readOnly={readOnly}
            control={control}
            name="kpiProrateLeave"
            label="Tính KPI theo ngày nghỉ"
            hint="Giảm chỉ tiêu tháng theo số ngày nghỉ đã được duyệt."
          />
          {/* PD-066: one fixed rule, no choice any more. */}
          <ReadOnlyRow
            label="Tiền Khoán khi chốt KPI"
            hint={`${topUpRule} KPI là bắt buộc: chưa set KPI cho đủ mọi người thì chưa chốt được kỳ.`}
            value={khoanPolicyMeta.TOP_UP.short}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Minh bạch"
        description="Ai được xem tiền của người khác. Điểm luôn công khai."
      >
        <div className="divide-y">
          {/* PD-052 retired the switch; PD-065: others' scores follow "Xem điểm người khác" — a fixed text here. */}
          <ReadOnlyRow
            label="Công khai bảng điểm"
            hint="Ai xem được Toàn đội, Điểm cá nhân và điểm từng task của người khác theo quyền “Xem điểm người khác” ở Cài đặt → Vai trò & phân quyền (mặc định mọi vai trò). Điểm của mình luôn xem được."
            value="Theo phân quyền"
            muted
          />
          {/* PD-066 retired "Công khai tiền công": money follows "Xem tiền Khoán người khác" only. */}
          <ReadOnlyRow
            label="Tiền Khoán của người khác"
            hint="Ai cũng xem được tiền Khoán của chính mình. Tiền của người khác và đơn giá tiền ở Bảng đơn giá chỉ vai trò có quyền “Xem tiền Khoán người khác” thấy (Cài đặt → Vai trò & phân quyền; mặc định Quản trị và Director)."
            value="Theo phân quyền"
            muted
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Cảnh báo"
        description="Ngưỡng cho thông báo sắp trễ và báo cáo bất thường."
      >
        <div className="divide-y">
          {numberField(
            "dueSoonHours",
            "Báo sắp trễ trước",
            "Gửi thông báo khi task còn ít hơn số giờ này tới hạn.",
            "giờ"
          )}
          {numberField(
            "anomalyFailPercent",
            "Ngưỡng tỉ lệ QC trả lại",
            "Nhân viên có tỉ lệ bị QC trả lại cao hơn ngưỡng này hiện trong báo cáo bất thường.",
            "%"
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Tổng quan"
        description="Đồng hồ cảnh báo và sức chứa At risk của trang Tổng quan (Overview)."
      >
        <div className="divide-y">
          <SettingRow
            labelId={`${ids}-coreWindow`}
            label="Khung giờ lõi"
            hint={<CoreWindowHint example={example} />}
            error={coreError}
            control={
              readOnly ? (
                <ReadOnlyValue>
                  {settings.coreWindowStart} – {settings.coreWindowEnd}
                  <span className="ml-1.5 font-normal text-foreground-muted">thứ 2 – thứ 7</span>
                </ReadOnlyValue>
              ) : (
                <div
                  role="group"
                  aria-labelledby={`${ids}-coreWindow`}
                  className="flex items-end gap-2"
                >
                  <TimeInput
                    caption="Bắt đầu"
                    label="Bắt đầu khung lõi"
                    invalid={Boolean(coreError)}
                    {...register("coreWindowStart")}
                  />
                  <span aria-hidden="true" className="pb-1.5 text-foreground-subtle">
                    –
                  </span>
                  <TimeInput
                    caption="Kết thúc"
                    label="Kết thúc khung lõi"
                    invalid={Boolean(coreError)}
                    {...register("coreWindowEnd")}
                  />
                </div>
              )
            }
          />
          {numberField(
            "alertAfterHours",
            "Cảnh báo sau (giờ)",
            "Số giờ lõi (chỉ tính trong khung) trước khi “Chờ QC”, “Không cập nhật” hay job mới “chưa chia” của Account chuyển sang cảnh báo. Từ 0,25 đến 24, bước 0,25 (15 phút).",
            "giờ lõi"
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Chat">
        <div className="divide-y">
          <SwitchRow
            readOnly={readOnly}
            control={control}
            name="chatAttachmentsEnabled"
            label="Cho phép gửi tệp trong chat"
            hint="Tắt để chỉ gửi văn bản và liên kết (ảnh gốc vẫn nằm trên ổ đĩa chung)."
          />
        </div>
      </SettingsSection>

      <InfoNote icon={Globe2}>
        Múi giờ nghiệp vụ: <span className="font-medium text-foreground">{settings.timezone}</span>.
        Ngày hiệu lực, kỳ KPI và hạn chót đều tính theo múi giờ này.
      </InfoNote>
      <FormAlert>{formState.errors.root?.message}</FormAlert>

      <AnimatePresence>
        {dirty && !readOnly ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-surface-raised px-4 py-3 shadow-lg"
          >
            <span className="flex min-w-0 flex-1 items-center gap-3 text-[13px] max-sm:basis-full">
              <Info className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
              Bạn có thay đổi chưa lưu.
            </span>
            <Button
              type="button"
              variant="ghost"
              className="max-sm:ml-auto"
              onClick={() => reset(toForm(settings))}
            >
              <Undo2 />
              Hoàn tác
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : <Save />}
              Lưu cài đặt
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
};

/**
 * Close-day hint (G15): the current period with its dates, then what saving does — a new day
 * "áp dụng từ kỳ MM/YYYY" (the next period, with its new dates), or that a change is already
 * scheduled.
 */
const CloseDayHint = ({
  plan,
  closeDay
}: {
  plan: ReturnType<typeof closeDayChange>;
  closeDay: number;
}) => {
  if (!plan) {
    return (
      <>
        Kỳ tính từ ngày sau ngày chốt tháng trước đến hết ngày chốt tháng này; “Cuối tháng” = đúng
        tháng dương lịch.
      </>
    );
  }
  const current = `Kỳ hiện tại ${formatKpiPeriod(plan.current.period)}: ${formatDay(plan.current.start)} – ${formatDay(plan.current.end)} (chốt ${closeDayLabel(plan.inForce)}).`;
  if (plan.changes) {
    return (
      <>
        {current}{" "}
        <span className="font-medium text-brand-text">
          {closeDay === plan.inForce
            ? `Lưu sẽ bỏ lịch đổi sang ${closeDayLabel(plan.scheduled)}; kỳ ${formatKpiPeriod(plan.next)} vẫn chốt ${closeDayLabel(plan.inForce)}.`
            : `Áp dụng từ kỳ ${formatKpiPeriod(plan.next)} (${formatDay(plan.nextRange.from)} – ${formatDay(plan.nextRange.to)}); kỳ hiện tại giữ nguyên.`}
        </span>
      </>
    );
  }
  if (plan.scheduled !== plan.inForce) {
    return (
      <>
        {current} Đã hẹn chốt {closeDayLabel(plan.scheduled)} từ kỳ {formatKpiPeriod(plan.next)} (
        {formatDay(plan.nextRange.from)} – {formatDay(plan.nextRange.to)}).
      </>
    );
  }
  return (
    <>
      {current} Đổi ngày chốt sẽ áp dụng từ kỳ sau; kỳ đang chạy giữ nguyên ngày bắt đầu và kết
      thúc. “Cuối tháng” = mỗi kỳ đúng một tháng dương lịch.
    </>
  );
};

/**
 * PD-080 "Khung giờ lõi": what the core window does, with the worked example for the current values (16:00 → 11:00
 * with the defaults).
 */
const CoreWindowHint = ({ example }: { example: ReturnType<typeof coreExample> }) => (
  <>
    Đồng hồ “Chờ QC”, “Không cập nhật” và job mới “chưa chia” của Account chỉ chạy trong khung này,
    thứ 2 – thứ 7 (giờ tổ chức); ngoài khung và Chủ nhật thì tạm dừng.
    {example ? (
      <>
        {" "}
        Ví dụ ({example.start} – {example.end}, cảnh báo sau {hoursLabel(example.hours)} giờ): vào
        Chờ QC lúc <span className="font-medium text-foreground">{example.enter}</span> → hôm đó
        tính 30 phút, chạy tiếp từ {example.start} ngày làm việc sau → cảnh báo lúc{" "}
        <span className="font-medium text-foreground">{example.alert}</span>.
      </>
    ) : null}{" "}
    Sức chứa At risk cũng chỉ tính giờ trong khung.
  </>
);

/** One end of the core window: a 24 h time input with its caption above. */
const TimeInput = ({
  caption,
  label,
  invalid,
  ...field
}: UseFormRegisterReturn & { caption: string; label: string; invalid: boolean }) => (
  <label className="flex flex-col gap-1">
    <span aria-hidden="true" className="text-[11px] leading-none text-foreground-muted">
      {caption}
    </span>
    <Input
      type="time"
      aria-label={label}
      aria-invalid={invalid}
      // Wide enough for a 12-hour browser locale ("04:30 CH") as well as 24-hour "16:30".
      className="w-32 tabular-nums"
      {...field}
    />
  </label>
);

const SettingRow = ({
  htmlFor,
  labelId,
  label,
  hint,
  error,
  control
}: {
  htmlFor?: string;
  /** For controls that are not form elements (Select): they point at the label with aria-labelledby. */
  labelId?: string;
  label: string;
  hint: ReactNode;
  error?: string | undefined;
  control: ReactNode;
}) => (
  <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6 md:px-5">
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {labelId ? (
        <span id={labelId} className="text-[13px] font-medium">
          {label}
        </span>
      ) : (
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
      )}
      <p className="text-xs leading-relaxed text-foreground-muted">{hint}</p>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
    <div className="shrink-0">{control}</div>
  </div>
);

/** A label + hint with a value as text on the right: a read-only switch, or a setting that is no longer configurable. */
const ReadOnlyRow = ({
  label,
  hint,
  value,
  muted = false
}: {
  label: string;
  hint: string;
  value: string;
  muted?: boolean;
}) => (
  <div className="flex items-center gap-6 px-4 py-3.5 md:px-5">
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[13px] font-medium">{label}</span>
      <span className="text-xs leading-relaxed text-foreground-muted">{hint}</span>
    </span>
    <ReadOnlyValue muted={muted}>{value}</ReadOnlyValue>
  </div>
);

type BooleanField = Extract<FieldPath<FormValues>, "kpiProrateLeave" | "chatAttachmentsEnabled">;

const SwitchRow = ({
  control,
  name,
  label,
  hint,
  readOnly
}: {
  control: Control<FormValues>;
  name: BooleanField;
  label: string;
  hint: string;
  /** PD-050: "Bật" / "Tắt" as text instead of the switch. */
  readOnly: boolean;
}) => (
  <Controller
    control={control}
    name={name}
    render={({ field }) =>
      readOnly ? (
        <ReadOnlyRow
          label={label}
          hint={hint}
          value={field.value ? "Bật" : "Tắt"}
          muted={!field.value}
        />
      ) : (
        <label className="flex cursor-pointer items-center gap-6 px-4 py-3.5 md:px-5">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-medium">{label}</span>
            <span className="text-xs leading-relaxed text-foreground-muted">{hint}</span>
          </span>
          <Switch checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} />
        </label>
      )
    }
  />
);
