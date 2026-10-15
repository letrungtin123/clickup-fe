import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CircleAlert, Info, MailCheck, MailPlus, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { matchesQuery } from "@/features/production/catalog";
import { useCanEditProductionConfig } from "@/features/production/config-access";
import {
  ConfirmDialog,
  CountLabel,
  FormAlert,
  InfoNote,
  PageIntro,
  RowsSkeleton,
  SearchField,
  SettingsPage,
  SettingsSection
} from "@/features/production/components/settings-kit";
import { MAX_EMAILS_PER_PASTE, splitEmails } from "@/features/production/emails";
import { productionErrorMessage } from "@/features/production/errors";
import { useAllowedEmailMutations, useAllowedEmails } from "@/features/production/hooks";
import type { AddAllowedEmailsResult } from "@/features/production/types";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

/**
 * Login whitelist (PD-012): new sign-ins — and Google sign-in once it is enabled — are accepted
 * only for listed emails. Accepts text pasted straight from a spreadsheet. PD-050: only the organization
 * superadmin adds or removes emails; everyone else reads the list.
 */
export const ProductionWhitelistRoute = () => {
  const canEdit = useCanEditProductionConfig();
  const ids = useId();
  const emails = useAllowedEmails();
  const mutations = useAllowedEmailMutations();
  const [text, setText] = useState("");
  const [result, setResult] = useState<AddAllowedEmailsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const preview = useMemo(() => splitEmails(text), [text]);
  const items = useMemo(() => emails.data?.items ?? [], [emails.data]);
  const rows = useMemo(
    () => items.filter((item) => matchesQuery(term, item.email, item.addedBy)),
    [items, term]
  );
  const tooMany = preview.valid.length + preview.invalid.length > MAX_EMAILS_PER_PASTE;

  const submit = () => {
    if (preview.valid.length === 0) {
      setError("Chưa có email hợp lệ nào trong nội dung đã dán.");
      return;
    }
    setError(null);
    mutations.add.mutate(text, {
      onSuccess: (added) => {
        setResult(added);
        setText("");
        if (added.added.length > 0) toast.success(`Đã thêm ${added.added.length} email`);
      },
      onError: (failure) => setError(productionErrorMessage(failure))
    });
  };

  return (
    <SettingsPage>
      <PageIntro slug="whitelist" />
      <InfoNote icon={Info} tone="brand">
        Chỉ email trong danh sách này mới đăng nhập lần đầu được. Hiện tại tài khoản công ty (email
        + mật khẩu do Quản trị tạo) đã dùng danh sách này; đăng nhập Google sẽ áp dụng cùng danh
        sách khi được bật (cần tên miền HTTPS). Xóa email khỏi danh sách không khóa tài khoản đang
        có.
      </InfoNote>

      {canEdit ? (
        <SettingsSection
          title="Thêm email"
          description="Dán từ bảng tính: email cách nhau bởi dấu phẩy, chấm phẩy, khoảng trắng hoặc xuống dòng."
        >
          <form
            noValidate
            className="flex flex-col gap-3 p-4 md:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor={`${ids}-paste`} className="sr-only">
              Danh sách email
            </label>
            <Textarea
              id={`${ids}-paste`}
              value={text}
              rows={5}
              placeholder={"nhanvien1@congty.vn\nnhanvien2@congty.vn; nhanvien3@congty.vn"}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              className="max-h-64 font-mono text-[13px]"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="flex-1 text-xs text-foreground-muted" aria-live="polite">
                {text.trim() === "" ? (
                  "Mỗi lần tối đa 2.000 email."
                ) : (
                  <>
                    <span className="font-medium text-foreground">{preview.valid.length}</span>{" "}
                    email hợp lệ
                    {preview.invalid.length > 0 ? (
                      <>
                        {" · "}
                        <span className="text-danger">{preview.invalid.length} không hợp lệ</span>
                      </>
                    ) : null}
                    {tooMany ? " · chỉ 2.000 mục đầu được xử lý" : null}
                  </>
                )}
              </p>
              <Button
                type="submit"
                disabled={mutations.add.isPending || preview.valid.length === 0}
              >
                {mutations.add.isPending ? <Spinner /> : <MailPlus />}
                Thêm vào danh sách
              </Button>
            </div>
            <FormAlert>{error}</FormAlert>
            <AnimatePresence initial={false}>
              {result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ResultSummary result={result} onDismiss={() => setResult(null)} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </form>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Email được phép"
        actions={
          emails.data ? <CountLabel shown={rows.length} total={items.length} noun="email" /> : null
        }
      >
        {items.length > 8 ? (
          <div className="border-b px-4 py-2.5 md:px-5">
            <SearchField
              value={term}
              onChange={setTerm}
              placeholder="Tìm email"
              label="Tìm email"
            />
          </div>
        ) : null}
        {emails.isPending ? (
          <RowsSkeleton rows={4} />
        ) : emails.isError ? (
          <ErrorState size="sm" error={emails.error} onRetry={() => void emails.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={MailCheck}
            title={items.length === 0 ? "Danh sách đang trống" : "Không có email phù hợp"}
            description={
              items.length === 0 && canEdit
                ? "Dán email của nhân viên vào ô phía trên để cho phép đăng nhập."
                : undefined
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map((item) => (
              <li key={item.email} className="flex items-center gap-3 px-4 py-2 md:px-5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">{item.email}</span>
                  <span className="truncate text-xs text-foreground-muted">
                    Thêm ngày {dateFormatter.format(new Date(item.createdAt))}
                    {item.addedBy ? ` · bởi ${item.addedBy}` : ""}
                  </span>
                </span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Xóa ${item.email} khỏi danh sách`}
                    className="text-foreground-subtle hover:text-danger"
                    onClick={() => setRemoving(item.email)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <ConfirmDialog
        open={canEdit && removing !== null}
        onOpenChange={(open) => !open && !mutations.remove.isPending && setRemoving(null)}
        title="Xóa email khỏi danh sách?"
        description={`${removing ?? ""} sẽ không đăng nhập lần đầu được nữa. Tài khoản đã có (nếu có) vẫn giữ nguyên.`}
        confirmLabel="Xóa email"
        destructive
        pending={mutations.remove.isPending}
        onConfirm={() =>
          removing &&
          mutations.remove.mutate(removing, {
            onSuccess: () => {
              toast.success(`Đã xóa ${removing}`);
              setRemoving(null);
            },
            onError: (failure) => toast.error(productionErrorMessage(failure))
          })
        }
      />
    </SettingsPage>
  );
};

const ResultSummary = ({
  result,
  onDismiss
}: {
  result: AddAllowedEmailsResult;
  onDismiss: () => void;
}) => {
  const groups = [
    { key: "added", label: "Đã thêm", items: result.added, tone: "success" as const },
    { key: "already", label: "Đã có sẵn", items: result.alreadyAllowed, tone: "muted" as const },
    { key: "invalid", label: "Không hợp lệ", items: result.invalid, tone: "danger" as const }
  ].filter((group) => group.items.length > 0);
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        {result.invalid.length > 0 ? (
          <CircleAlert className="size-4 text-warning" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        )}
        <p className="flex-1 text-[13px] font-medium">
          Đã thêm {result.added.length}, có sẵn {result.alreadyAllowed.length}, không hợp lệ{" "}
          {result.invalid.length}.
        </p>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Đóng
        </Button>
      </div>
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <p className="text-xs text-foreground-muted">{group.label}</p>
          <ul className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {group.items.map((email) => (
              <li
                key={email}
                className={cn(
                  "max-w-full truncate rounded-md px-1.5 py-0.5 font-mono text-xs",
                  group.tone === "success" && "bg-success-soft text-success",
                  group.tone === "muted" && "bg-muted text-foreground-muted",
                  group.tone === "danger" && "bg-danger-soft text-danger"
                )}
              >
                {email}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
