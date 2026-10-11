import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { Globe2, Info, Save, Undo2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Controller, useForm, useWatch, type Control, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ProductionSettings } from "@/contracts/production-catalog";
import {
  FormAlert,
  InfoNote,
  PageIntro,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { productionErrorMessage } from "@/features/production/errors";
import { closeDayChange, formatDay, formatKpiPeriod, todayIn } from "@/features/production/format";
import { useProductionSettings, useUpdateSettings } from "@/features/production/hooks";

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
  kpiCloseDay: intIn(1, 28, "Chọn ngày từ 1 đến 28."),
  kpiDefaultMember: decimalIn(0, 1_000_000, kpiMessage),
  kpiDefaultLeader: decimalIn(0, 1_000_000, kpiMessage),
  kpiProrateLeave: z.boolean(),
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
  const plan =
    closeDay >= 1 && closeDay <= 28
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
        scoresPublic: values.scoresPublic,
        moneyPublic: values.moneyPublic,
        dueSoonHours: Number(values.dueSoonHours),
        anomalyFailRate: Math.round(toNumber(values.anomalyFailPercent) * 100) / 10_000,
        chatAttachmentsEnabled: values.chatAttachmentsEnabled
      },
      {
        onSuccess: (saved) => {
          reset(toForm(saved));
          toast.success(
            "Đã lưu cài đặt sản xuất",
            plan?.changes && Number(values.kpiCloseDay) !== plan.inForce
              ? {
                  description: `Ngày chốt ${values.kpiCloseDay} áp dụng từ kỳ ${formatKpiPeriod(plan.next)}.`
                }
              : undefined
          );
        },
        onError: (error) => setError("root", { message: productionErrorMessage(error) })
      }
    )
  );

  const numberField = (
    name:
      | "kpiCloseDay"
      | "kpiDefaultMember"
      | "kpiDefaultLeader"
      | "dueSoonHours"
      | "anomalyFailPercent",
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
          {numberField(
            "kpiCloseDay",
            "Ngày chốt KPI",
            <CloseDayHint plan={plan} closeDay={closeDay} />,
            "hằng tháng"
          )}
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
    return <>Kỳ tính từ ngày sau ngày chốt tháng trước đến hết ngày chốt tháng này.</>;
  }
  const current = `Kỳ hiện tại ${formatKpiPeriod(plan.current.period)}: ${formatDay(plan.current.start)} – ${formatDay(plan.current.end)} (chốt ngày ${plan.inForce}).`;
  if (plan.changes) {
    return (
      <>
        {current}{" "}
        <span className="font-medium text-brand-text">
          {closeDay === plan.inForce
            ? `Lưu sẽ bỏ lịch đổi sang ngày ${plan.scheduled}; kỳ ${formatKpiPeriod(plan.next)} vẫn chốt ngày ${plan.inForce}.`
            : `Áp dụng từ kỳ ${formatKpiPeriod(plan.next)} (${formatDay(plan.nextRange.from)} – ${formatDay(plan.nextRange.to)}); kỳ hiện tại giữ nguyên.`}
        </span>
      </>
    );
  }
  if (plan.scheduled !== plan.inForce) {
    return (
      <>
        {current} Đã hẹn chốt ngày {plan.scheduled} từ kỳ {formatKpiPeriod(plan.next)} (
        {formatDay(plan.nextRange.from)} – {formatDay(plan.nextRange.to)}).
      </>
    );
  }
  return (
    <>
      {current} Đổi ngày chốt sẽ áp dụng từ kỳ sau; kỳ đang chạy giữ nguyên ngày bắt đầu và kết
      thúc.
    </>
  );
};

const SettingRow = ({
  htmlFor,
  label,
  hint,
  error,
  control
}: {
  htmlFor?: string;
  label: string;
  hint: ReactNode;
  error?: string | undefined;
  control: ReactNode;
}) => (
  <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6 md:px-5">
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label}
      </label>
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
