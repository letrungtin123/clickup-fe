import { cn } from "cn";
import { UserPlus } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { CreatedProductionUser } from "@/contracts/users-admin";
import { isApiError } from "@/lib/api/errors";

import { productionErrorMessage } from "../../errors";
import { useCreateProductionUser } from "../../hooks";
import type { Team } from "../../types";
import { phoneSheetColumn, sheetOnPhone } from "../../ui";
import { RoleToggleGroup } from "../role-chips";
import { FormAlert } from "../settings-kit";
import {
  emptyNewMember,
  MAX_JOB_TITLE_LENGTH,
  MAX_NAME_LENGTH,
  toCreateUserInput,
  validateNewMember,
  type NewMemberDraft,
  type NewMemberErrors
} from "./member-admin";

const NONE = "__none__";

/** Answers that concern the address itself: shown under the email field. */
const emailCodes = new Set(["MEMBER_EXISTS", "ACCOUNT_EXISTS"]);

/**
 * "Thêm thành viên" (POST /production/users, PD-024): a login account with the organization's
 * default "Thành viên" role plus the chosen production roles and team. The server answers a
 * one-time temporary password, handed to `onCreated` (shown by TemporaryPasswordDialog). Mount it
 * with a fresh `key` per opening so the form starts empty.
 */
export const CreateMemberDialog = ({
  open,
  onOpenChange,
  teams,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: readonly Team[];
  onCreated: (result: CreatedProductionUser, input: { whitelisted: boolean }) => void;
}) => {
  const ids = useId();
  const create = useCreateProductionUser();
  const [draft, setDraft] = useState<NewMemberDraft>(emptyNewMember);
  const [errors, setErrors] = useState<NewMemberErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const teamItems = [
    { value: NONE, label: "Chưa có team" },
    ...teams.filter((team) => team.active).map((team) => ({ value: team.id, label: team.name }))
  ];

  const edit = <K extends keyof NewMemberDraft>(key: K, value: NewMemberDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => (key in current ? { ...current, [key]: undefined } : current));
    setFormError(null);
  };

  const submit = () => {
    const problems = validateNewMember(draft);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      // Focus the first field to fix (keyboard and screen-reader friendly).
      const first = (["email", "displayName", "jobTitle"] as const).find((key) => problems[key]);
      if (first) document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }
    create.mutate(toCreateUserInput(draft), {
      onSuccess: (result) => onCreated(result, { whitelisted: draft.allowGoogleSignIn }),
      onError: (error) => {
        const message = productionErrorMessage(error, {
          fallback: "Không tạo được tài khoản. Thử lại sau."
        });
        if (isApiError(error) && emailCodes.has(error.code)) {
          setErrors({ email: message });
          document.getElementById(`${ids}-email`)?.focus();
        } else setFormError(message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg",
          sheetOnPhone
        )}
      >
        <form
          noValidate
          className={cn("flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col", phoneSheetColumn)}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <DialogTitle>Thêm thành viên</DialogTitle>
            <DialogDescription className="text-[13px]">
              Tạo tài khoản đăng nhập và gán vai trò sản xuất. Hệ thống tạo mật khẩu tạm thời; người
              dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor={`${ids}-email`}>Email đăng nhập</FieldLabel>
              <Input
                id={`${ids}-email`}
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                maxLength={254}
                placeholder="ten@nesso.vn"
                value={draft.email}
                aria-invalid={Boolean(errors.email)}
                onChange={(event) => edit("email", event.target.value)}
              />
              <FieldError>{errors.email}</FieldError>
            </Field>

            <Field data-invalid={Boolean(errors.displayName)}>
              <FieldLabel htmlFor={`${ids}-displayName`}>Họ tên</FieldLabel>
              <Input
                id={`${ids}-displayName`}
                autoComplete="off"
                maxLength={MAX_NAME_LENGTH}
                placeholder="Ví dụ: Nguyễn Văn An"
                value={draft.displayName}
                aria-invalid={Boolean(errors.displayName)}
                onChange={(event) => edit("displayName", event.target.value)}
              />
              <FieldError>{errors.displayName}</FieldError>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.jobTitle)}>
                <FieldLabel htmlFor={`${ids}-jobTitle`}>
                  Chức danh <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                </FieldLabel>
                <Input
                  id={`${ids}-jobTitle`}
                  autoComplete="off"
                  maxLength={MAX_JOB_TITLE_LENGTH}
                  placeholder="Ví dụ: Retoucher"
                  value={draft.jobTitle}
                  aria-invalid={Boolean(errors.jobTitle)}
                  onChange={(event) => edit("jobTitle", event.target.value)}
                />
                <FieldError>{errors.jobTitle}</FieldError>
              </Field>
              <Field>
                <FieldLabel id={`${ids}-team`}>
                  Team <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
                </FieldLabel>
                <Select
                  items={teamItems}
                  value={draft.teamId ?? NONE}
                  onValueChange={(value: string | null) =>
                    edit("teamId", !value || value === NONE ? null : value)
                  }
                >
                  <SelectTrigger className="w-full" aria-labelledby={`${ids}-team`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teamItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.roles)}>
              <FieldLabel id={`${ids}-roles`}>Vai trò sản xuất</FieldLabel>
              <RoleToggleGroup
                aria-label="Vai trò sản xuất của thành viên mới"
                value={draft.roles}
                onChange={(roles) => edit("roles", roles)}
                className="gap-1.5 [&_button]:h-7 [&_button]:px-2.5 [&_button]:text-xs pointer-coarse:[&_button]:h-9"
              />
              {errors.roles ? (
                <FieldError>{errors.roles}</FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  Một người có thể giữ nhiều vai trò.
                </FieldDescription>
              )}
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 select-none">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-medium">Cho phép đăng nhập bằng Google</span>
                <span className="text-xs leading-relaxed text-foreground-muted">
                  Thêm email này vào Whitelist email để người dùng đăng nhập được bằng tài khoản
                  Google cùng địa chỉ. Tắt nếu chỉ dùng mật khẩu.
                </span>
              </span>
              <Switch
                className="mt-0.5"
                checked={draft.allowGoogleSignIn}
                onCheckedChange={(checked) => edit("allowGoogleSignIn", checked)}
              />
            </label>

            <FormAlert>{formError}</FormAlert>
          </div>

          <DialogFooter className="mx-0 mb-0 px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <UserPlus />}
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
