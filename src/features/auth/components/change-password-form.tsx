import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";

import { authApi } from "../api";

/** Mirrors the API password policy (contracts NewPasswordSchema) with localized messages. */
const schema = z
  .object({
    currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại."),
    newPassword: z
      .string()
      .min(10, "Mật khẩu cần ít nhất 10 ký tự.")
      .max(128, "Mật khẩu tối đa 128 ký tự.")
      .refine(
        (value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value),
        "Mật khẩu cần có cả chữ và số."
      ),
    confirmPassword: z.string()
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
    path: ["newPassword"]
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"]
  });
type Values = z.infer<typeof schema>;

type ChangePasswordFormProps = {
  /** Copy for the current-password label (temporary vs current). */
  currentLabel?: string;
  submitLabel?: string;
  onChanged: (result: { reauthenticate: boolean }) => void;
};

export const ChangePasswordForm = ({
  currentLabel = "Mật khẩu hiện tại",
  submitLabel = "Đổi mật khẩu",
  onChanged
}: ChangePasswordFormProps) => {
  const ids = useId();
  const queryClient = useQueryClient();
  const [reveal, setReveal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError, control, reset } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    mode: "onTouched"
  });
  const newPassword = useWatch({ control, name: "newPassword" });

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      }),
    meta: { errorMessage: false },
    onSuccess: async (result) => {
      reset();
      await queryClient.invalidateQueries({ queryKey: qk.session() });
      onChanged({ reauthenticate: result.reauthenticate });
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "CURRENT_PASSWORD_INVALID") {
        setError(
          "currentPassword",
          { message: "Mật khẩu hiện tại không đúng." },
          { shouldFocus: true }
        );
        return;
      }
      setFormError(getErrorMessage(error, "Không đổi được mật khẩu. Vui lòng thử lại."));
    }
  });

  const rules = [
    { ok: newPassword.length >= 10, label: "Ít nhất 10 ký tự" },
    { ok: /[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword), label: "Có cả chữ và số" }
  ];
  const inputType = reveal ? "text" : "password";

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        setFormError(null);
        void handleSubmit((values) => mutation.mutate(values))(event);
      }}
    >
      <Field data-invalid={Boolean(formState.errors.currentPassword)}>
        <FieldLabel htmlFor={`${ids}-current`}>{currentLabel}</FieldLabel>
        <Input
          id={`${ids}-current`}
          type={inputType}
          autoComplete="current-password"
          aria-invalid={Boolean(formState.errors.currentPassword)}
          {...register("currentPassword")}
        />
        <FieldError errors={[formState.errors.currentPassword]} />
      </Field>
      <Field data-invalid={Boolean(formState.errors.newPassword)}>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor={`${ids}-new`}>Mật khẩu mới</FieldLabel>
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            className="inline-flex items-center gap-1 rounded text-xs text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {reveal ? "Ẩn" : "Hiện"}
          </button>
        </div>
        <Input
          id={`${ids}-new`}
          type={inputType}
          autoComplete="new-password"
          aria-invalid={Boolean(formState.errors.newPassword)}
          aria-describedby={`${ids}-rules`}
          {...register("newPassword")}
        />
        <ul id={`${ids}-rules`} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {rules.map((rule) => (
            <li
              key={rule.label}
              className={
                rule.ok
                  ? "flex items-center gap-1 text-success"
                  : "flex items-center gap-1 text-foreground-subtle"
              }
            >
              <Check className="size-3" aria-hidden="true" />
              {rule.label}
              <span className="sr-only">{rule.ok ? "(đạt)" : "(chưa đạt)"}</span>
            </li>
          ))}
        </ul>
        <FieldError errors={[formState.errors.newPassword]} />
      </Field>
      <Field data-invalid={Boolean(formState.errors.confirmPassword)}>
        <FieldLabel htmlFor={`${ids}-confirm`}>Nhập lại mật khẩu mới</FieldLabel>
        <Input
          id={`${ids}-confirm`}
          type={inputType}
          autoComplete="new-password"
          aria-invalid={Boolean(formState.errors.confirmPassword)}
          {...register("confirmPassword")}
        />
        <FieldError errors={[formState.errors.confirmPassword]} />
      </Field>
      {formError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={mutation.isPending} className="self-start">
        {mutation.isPending ? <Spinner /> : null}
        {submitLabel}
      </Button>
    </form>
  );
};
