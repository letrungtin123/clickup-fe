import { cn } from "cn";
import { AnimatePresence, motion } from "motion/react";
import { Bookmark, Ellipsis, Pin, PinOff, Share2, Trash2, UsersRound } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  reportDimensionInfo,
  reportMeasureInfo,
  type ReportConfig,
  type SavedReport
} from "@/contracts/production-reports";
import { useSessionContext } from "@/features/auth/hooks";

import { touchTargets } from "../../ui";
import { reportErrorMessage } from "../errors";
import {
  useCreateSavedReport,
  useDeleteSavedReport,
  useSavedReports,
  useUpdateSavedReport
} from "../hooks";
import { rangeOfConfig, rangePresetLabels } from "../model";
import { formatRange } from "../format";

/** One line describing a config: "Nhân viên × Tuần · Điểm, Số tấm done · Tháng này". */
const describe = (config: ReportConfig) => {
  const dims = config.dimensions
    .map((dimension) => reportDimensionInfo[dimension].label)
    .join(" × ");
  const measures = config.measures.map((measure) => reportMeasureInfo[measure].label).join(", ");
  const range = rangeOfConfig(config);
  const when =
    range.kind === "preset" ? rangePresetLabels[range.preset] : formatRange(range.from, range.to);
  return [dims || "Tổng", measures, when].join(" · ");
};

// Save --------------------------------------------------------------------------------------------

export const SaveReportDialog = ({
  open,
  onOpenChange,
  config,
  current,
  suggestedName,
  isAdmin,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ReportConfig;
  /** The saved report being edited (owner only), or null for a new one. */
  current: SavedReport | null;
  suggestedName: string;
  isAdmin: boolean;
  onSaved: (report: SavedReport) => void;
}) => {
  const id = useId();
  const editing = current?.canEdit ? current : null;
  const [name, setName] = useState(editing?.name ?? suggestedName);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [shared, setShared] = useState(editing?.shared ?? false);
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSavedReport();
  const update = useUpdateSavedReport();
  const pending = create.isPending || update.isPending;

  const submit = async (mode: "update" | "create") => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Hãy đặt tên cho báo cáo.");
      return;
    }
    setError(null);
    const input = {
      name: trimmed,
      description: description.trim() || null,
      config,
      shared: shared || pinned,
      ...(isAdmin ? { pinned } : {})
    };
    try {
      const saved =
        mode === "update" && editing
          ? await update.mutateAsync({ id: editing.id, input })
          : await create.mutateAsync(input);
      toast.success(mode === "update" ? "Đã lưu thay đổi" : "Đã lưu báo cáo", {
        description: saved.name
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (cause) {
      setError(reportErrorMessage(cause, "Không lưu được báo cáo. Thử lại sau."));
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(editing ? "update" : "create");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", touchTargets)}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Lưu báo cáo" : "Lưu báo cáo mới"}</DialogTitle>
            <DialogDescription className="line-clamp-2">{describe(config)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>Tên báo cáo</Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={120}
              autoFocus
              aria-invalid={error !== null && !name.trim()}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ví dụ: Điểm theo team từng tuần"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-description`}>
              Ghi chú <span className="font-normal text-foreground-muted">(không bắt buộc)</span>
            </Label>
            <Textarea
              id={`${id}-description`}
              value={description}
              maxLength={1000}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Chia sẻ</span>
              <span className="text-xs text-foreground-muted">
                Mọi Leader và Quản trị thấy và mở được báo cáo này.
              </span>
            </span>
            <Switch
              checked={shared || pinned}
              disabled={pinned}
              onCheckedChange={setShared}
              aria-label="Chia sẻ báo cáo"
            />
          </label>
          {isAdmin ? (
            <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Ghim lên trang Quản trị số liệu</span>
                <span className="text-xs text-foreground-muted">
                  Báo cáo ghim luôn được chia sẻ.
                </span>
              </span>
              <Switch checked={pinned} onCheckedChange={setPinned} aria-label="Ghim báo cáo" />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            {editing ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void submit("create")}
              >
                Lưu thành bản mới
              </Button>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : <Bookmark />}
              {editing ? "Lưu thay đổi" : "Lưu báo cáo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// List --------------------------------------------------------------------------------------------

type Tab = "mine" | "shared";

const SavedItem = ({
  report,
  active,
  mine,
  onOpen,
  onPin,
  onDelete,
  busy
}: {
  report: SavedReport;
  active: boolean;
  mine: boolean;
  onOpen: () => void;
  onPin: () => void;
  onDelete: () => void;
  busy: boolean;
}) => (
  <motion.li
    layout
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, height: 0 }}
    transition={{ duration: 0.16 }}
    className={cn(
      "group/item flex min-w-0 items-start gap-1 rounded-lg border bg-surface p-1 transition-colors",
      active ? "border-brand/50 bg-brand-soft" : "hover:border-border-strong"
    )}
  >
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-medium">{report.name}</span>
        {report.pinned ? (
          <Badge variant="secondary" className="h-4.5 gap-0.5 px-1.5 text-[10px]">
            <Pin aria-hidden="true" />
            Ghim
          </Badge>
        ) : null}
        {report.shared && !report.pinned && mine ? (
          <Badge variant="outline" className="h-4.5 gap-0.5 px-1.5 text-[10px]">
            <Share2 aria-hidden="true" />
            Chia sẻ
          </Badge>
        ) : null}
      </span>
      <span className="line-clamp-2 text-xs text-foreground-muted">
        {report.description || describe(report.config)}
      </span>
      {!mine ? (
        <span className="flex items-center gap-1.5 text-xs text-foreground-subtle">
          <UserAvatar user={report.owner} size="xs" />
          {report.owner.displayName}
        </span>
      ) : null}
    </button>
    {report.canPin || report.canDelete ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-foreground-muted"
              aria-label={`Tuỳ chọn ${report.name}`}
              disabled={busy}
            />
          }
        >
          {busy ? <Spinner /> : <Ellipsis />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {report.canPin ? (
            <DropdownMenuItem onClick={onPin}>
              {report.pinned ? <PinOff /> : <Pin />}
              {report.pinned ? "Bỏ ghim khỏi Quản trị số liệu" : "Ghim lên Quản trị số liệu"}
            </DropdownMenuItem>
          ) : null}
          {report.canPin && report.canDelete ? <DropdownMenuSeparator /> : null}
          {report.canDelete ? (
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              Xoá báo cáo
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null}
  </motion.li>
);

export const SavedReportsSheet = ({
  open,
  onOpenChange,
  activeId,
  onOpen,
  onDeleted
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: string | null;
  onOpen: (report: SavedReport) => void;
  onDeleted: (id: string) => void;
}) => {
  const session = useSessionContext();
  const saved = useSavedReports(open);
  const update = useUpdateSavedReport();
  const remove = useDeleteSavedReport();
  const [tab, setTab] = useState<Tab>("mine");
  const [confirm, setConfirm] = useState<SavedReport | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = saved.data?.items ?? [];
  const mine = items.filter((item) => item.owner.id === session.user.id);
  const shared = items.filter((item) => item.owner.id !== session.user.id);
  const list = tab === "mine" ? mine : shared;

  const pin = async (report: SavedReport) => {
    setBusyId(report.id);
    try {
      await update.mutateAsync({ id: report.id, input: { pinned: !report.pinned } });
      toast.success(report.pinned ? "Đã bỏ ghim" : "Đã ghim lên Quản trị số liệu", {
        description: report.name
      });
    } catch (cause) {
      toast.error(reportErrorMessage(cause, "Không cập nhật được báo cáo."));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const report = confirm;
    if (!report) return;
    setBusyId(report.id);
    try {
      await remove.mutateAsync(report.id);
      toast.success("Đã xoá báo cáo", { description: report.name });
      onDeleted(report.id);
      setConfirm(null);
    } catch (cause) {
      toast.error(reportErrorMessage(cause, "Không xoá được báo cáo."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn("w-full gap-0 p-0 sm:max-w-md", touchTargets)}>
          <SheetHeader className="border-b px-4 pt-4 pb-3">
            <SheetTitle>Báo cáo đã lưu</SheetTitle>
            <SheetDescription>
              Mở lại cấu hình đã lưu, ghim lên trang Quản trị số liệu hoặc xoá.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)}>
              <TabsList className="w-full">
                <TabsTrigger value="mine">
                  Của tôi{saved.data ? ` · ${mine.length}` : ""}
                </TabsTrigger>
                <TabsTrigger value="shared">
                  Được chia sẻ{saved.data ? ` · ${shared.length}` : ""}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {saved.isPending ? (
              <SkeletonRows rows={5} className="py-2" />
            ) : saved.isError ? (
              <ErrorState
                size="sm"
                error={saved.error}
                onRetry={() => void saved.refetch()}
                retrying={saved.isFetching}
              />
            ) : list.length === 0 ? (
              <EmptyState
                size="sm"
                icon={tab === "mine" ? Bookmark : UsersRound}
                title={tab === "mine" ? "Bạn chưa lưu báo cáo nào" : "Chưa có báo cáo được chia sẻ"}
                description={
                  tab === "mine"
                    ? "Dựng báo cáo rồi bấm Lưu để mở lại nhanh lần sau."
                    : "Khi Leader hoặc Quản trị bật Chia sẻ, báo cáo sẽ hiện ở đây."
                }
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                <AnimatePresence initial={false}>
                  {list.map((report) => (
                    <SavedItem
                      key={report.id}
                      report={report}
                      active={report.id === activeId}
                      mine={tab === "mine"}
                      busy={busyId === report.id}
                      onOpen={() => {
                        onOpen(report);
                        onOpenChange(false);
                      }}
                      onPin={() => void pin(report)}
                      onDelete={() => setConfirm(report)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá báo cáo "{confirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.pinned
                ? "Báo cáo đang được ghim và sẽ biến mất khỏi trang Quản trị số liệu. "
                : ""}
              {confirm?.shared ? "Người được chia sẻ cũng không mở được nữa. " : ""}
              Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={busyId !== null}
            >
              Xoá báo cáo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
