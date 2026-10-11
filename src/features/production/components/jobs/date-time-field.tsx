import { cn } from "cn";

import { Input } from "@/components/ui/input";

import { isoToZoned, zonedToIso } from "../../jobs-model";
import { DateField } from "../date-field";

/**
 * Deadline picker: calendar day + time, both in the organization timezone (PD: times are stored in
 * UTC and shown in Asia/Ho_Chi_Minh). Emits an ISO instant, or null while incomplete.
 */
export const DateTimeField = ({
  value,
  onChange,
  timeZone,
  today,
  id,
  invalid,
  disabled,
  className,
  "aria-label": label
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  timeZone: string;
  today?: string | undefined;
  id?: string | undefined;
  invalid?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
}) => {
  const parts = value ? isoToZoned(value, timeZone) : { day: "", time: "17:00" };
  const emit = (day: string, time: string) =>
    onChange(day && time ? zonedToIso(day, time, timeZone) : null);
  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      <DateField
        id={id}
        value={parts.day || null}
        onChange={(day) => emit(day ?? "", parts.time)}
        today={today}
        disabled={disabled}
        aria-invalid={invalid}
        aria-label={label ? `${label} — ngày` : "Ngày"}
        className="min-w-0 flex-1"
      />
      <Input
        type="time"
        value={parts.time}
        step={300}
        disabled={disabled}
        aria-invalid={invalid}
        aria-label={label ? `${label} — giờ` : "Giờ"}
        onChange={(event) => emit(parts.day, event.target.value)}
        // Wide enough for a 12-hour browser locale ("05:00 CH") as well as 24-hour "17:00".
        className="w-32 shrink-0 tabular-nums"
      />
    </div>
  );
};
