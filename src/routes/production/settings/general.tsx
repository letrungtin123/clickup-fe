import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import { Globe2, Info, Save, Undo2 } from "lucide-react";
import { Fragment, useId, type ReactNode } from "react";
import { Controller, useForm, useWatch, type Control, type FieldPath } from "react-hook-form";
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
  isKpiCloseDay,
  kpiCloseDayEndOfMonth,
  KhoanPayPolicySchema,
  type KhoanPayPolicy,
  type ProductionSettings
} from "@/contracts/production-catalog";
import {
  FormAlert,
  InfoNote,
  PageIntro,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { productionErrorMessage } from "@/features/production/errors";
import {
  closeDayChange,
  closeDayLabel,
  formatDay,
  formatKpiPeriod,
  todayIn
} from "@/features/production/format";
import { useProductionSettings, useUpdateSettings } from "@/features/production/hooks";
import { khoanPolicyMeta, khoanPolicyOptions } from "@/features/production/kpi/khoan-policy";

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

const formSchema = z.object({
  kpiCloseDay: z
    .string()
    .refine((value) => isKpiCloseDay(Number(value)), "Chọn ngày từ 1 đến 28 hoặc Cuối tháng."),
  kpiDefaultMember: decimalIn(0, 1_000_000, kpiMessage),
  kpiDefaultLeader: decimalIn(0, 1_000_000, kpiMessage),
  kpiProrateLeave: z.boolean(),
  khoanPayPolicy: KhoanPayPolicySchema,
  scoresPublic: z.boolean(),
  moneyPublic: z.boolean(),
  dueSoonHours: intIn(1, 72, "Từ 1 đến 72 giờ."),
  anomalyFailPercent: decimalIn(0, 100, "Từ 0 đến 100%."),
  chatAttachmentsEnabled: z.boolean()
});
type FormValues = z.infer<typeof formSchema>;

const toForm = (settings: ProductionSettings): FormValues => ({
  kpiCloseDay: String(settings.kpiCloseDay),
  kpiDefaultMember: String(settings.kpiDefaultMember),
  kpiDefaultLeader: String(settings.kpiDefaultLeader),
  kpiProrateLeave: settings.kpiProrateLeave,
  khoanPayPolicy: settings.khoanPayPolicy,
  scoresPublic: settings.scoresPublic,
  moneyPublic: settings.moneyPublic,
  dueSoonHours: String(settings.dueSoonHours),
  anomalyFailPercent: String(Math.round(settings.anomalyFailRate * 10_000) / 100),
  chatAttachmentsEnabled: settings.chatAttachmentsEnabled
});

const toNumber = (value: string) => Number(value.replace(",", "."));

/** Organization-wide production settings (Admin). Timezone is fixed server-side. */
export const ProductionGeneralRoute = () => {
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
        <SettingsForm settings={settings.data} />
      )}
    </SettingsPage>
  );
};

const SettingsForm = ({ settings }: { settings: ProductionSettings }) => {
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

  const onSubmit = handleSubmit((values) =>
    update.mutate(
      {
        kpiCloseDay: Number(values.kpiCloseDay),
        kpiDefaultMember: toNumber(values.kpiDefaultMember),
        kpiDefaultLeader: toNumber(values.kpiDefaultLeader),
        kpiProrateLeave: values.kpiProrateLeave,
        khoanPayPolicy: values.khoanPayPolicy,
        scoresPublic: values.scoresPublic,
        moneyPublic: values.moneyPublic,
        dueSoonHours: Number(values.dueSoonHours),
        anomalyFailRate: Math.round(toNumber(values.anomalyFailPercent) * 100) / 10_000,
        chatAttachmentsEnabled: values.chatAttachmentsEnabled
      },
      {
        onSuccess: (saved) => {
          reset(toForm(saved));
          const notes = [
            plan?.changes && Number(values.kpiCloseDay) !== plan.inForce
              ? `Chốt ${closeDayLabel(Number(values.kpiCloseDay))} áp dụng từ kỳ ${formatKpiPeriod(plan.next)}.`
              : null,
            values.khoanPayPolicy !== settings.khoanPayPolicy
              ? `Tiền Khoán: “${khoanPolicyMeta[values.khoanPayPolicy].label}” — áp dụng cho lần chốt tiếp theo.`
              : null
          ].filter((note): note is string => note !== null);
          toast.success(
            "Đã lưu cài đặt Photo Retouch",
            notes.length > 0 ? { description: notes.join(" ") } : undefined
          );
        },
        onError: (error) => setError("root", { message: productionErrorMessage(error) })
      }
    )
  );

  const numberField = (
    name: "kpiDefaultMember" | "kpiDefaultLeader" | "dueSoonHours" | "anomalyFailPercent",
    label: string,
    hint: ReactNode,
    suffix: string
  ) => {
    const error = formState.errors[name]?.message;
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
      onSubmit={(event) => void onSubmit(event)}
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
            control={control}
            name="kpiProrateLeave"
            label="Tính KPI theo ngày nghỉ"
            hint="Giảm chỉ tiêu tháng theo số ngày nghỉ đã được duyệt."
          />
          <Controller
            control={control}
            name="khoanPayPolicy"
            render={({ field }) => (
              <KhoanPolicyRow
                labelId={`${ids}-khoanPayPolicy`}
                value={field.value}
                onChange={field.onChange}
                saved={settings.khoanPayPolicy}
              />
            )}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Minh bạch" description="Ai được xem điểm và tiền của người khác.">
        <div className="divide-y">
          <SwitchRow
            control={control}
            name="scoresPublic"
            label="Công khai bảng điểm"
            hint="Mọi người thấy xếp hạng điểm và số tấm của nhau. Tắt để chỉ chính chủ và Quản trị xem."
          />
          <SwitchRow
            control={control}
            name="moneyPublic"
            label="Công khai tiền công"
            hint="Mặc định tiền chỉ chính chủ và Quản trị thấy. Bật để mọi người thấy đơn giá tiền và tiền khoán."
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

      <SettingsSection title="Chat">
        <div className="divide-y">
          <SwitchRow
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
        {dirty ? (
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
 * Khoán pay policy (PD-033): two option cards with a one-line explanation each, stacked on phones.
 * The setting applies to the next settlement run (automatic or re-run) and to provisional figures.
 */
const KhoanPolicyRow = ({
  labelId,
  value,
  onChange,
  saved
}: {
  labelId: string;
  value: KhoanPayPolicy;
  onChange: (value: KhoanPayPolicy) => void;
  saved: KhoanPayPolicy;
}) => (
  <div className="flex flex-col gap-2.5 px-4 py-3.5 md:px-5">
    <div className="flex min-w-0 flex-col gap-0.5">
      <span id={labelId} className="text-[13px] font-medium">
        Tiền Khoán khi chốt KPI
      </span>
      <p className="text-xs leading-relaxed text-foreground-muted">
        Đạt KPI = điểm chính thức (gồm OT và QC) ≥ chỉ tiêu. Áp dụng cho lần chốt tiếp theo; kỳ đã
        chốt giữ kết quả cho tới khi chạy chốt lại.
        {value !== saved ? (
          <span className="font-medium text-brand-text"> Lưu để đổi chính sách.</span>
        ) : null}
      </p>
    </div>
    <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-2">
      {khoanPolicyOptions.map((policy) => {
        const checked = value === policy;
        return (
          <button
            key={policy}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(policy)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              checked ? "border-brand/50 bg-brand-soft" : "hover:bg-surface-hover"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                checked ? "border-brand bg-brand" : "border-input bg-surface"
              )}
            >
              {checked ? <span className="size-1.5 rounded-full bg-brand-foreground" /> : null}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium">
                {khoanPolicyMeta[policy].label}
                {policy === "ALWAYS" ? (
                  <span className="rounded bg-muted px-1.5 py-px text-[11px] font-normal text-foreground-muted">
                    Mặc định
                  </span>
                ) : null}
              </span>
              <span className="text-xs leading-relaxed text-foreground-muted">
                {khoanPolicyMeta[policy].description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
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

type BooleanField = Extract<
  FieldPath<FormValues>,
  "kpiProrateLeave" | "scoresPublic" | "moneyPublic" | "chatAttachmentsEnabled"
>;

const SwitchRow = ({
  control,
  name,
  label,
  hint
}: {
  control: Control<FormValues>;
  name: BooleanField;
  label: string;
  hint: string;
}) => (
  <Controller
    control={control}
    name={name}
    render={({ field }) => (
      <label className="flex cursor-pointer items-center gap-6 px-4 py-3.5 md:px-5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-medium">{label}</span>
          <span className="text-xs leading-relaxed text-foreground-muted">{hint}</span>
        </span>
        <Switch checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} />
      </label>
    )}
  />
);
