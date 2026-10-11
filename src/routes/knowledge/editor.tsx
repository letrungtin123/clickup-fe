import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NodeSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { cn } from "cn";
import {
  ArrowLeft,
  CloudCheck,
  CloudOff,
  History,
  Info,
  Lock,
  NotebookPen,
  Paperclip,
  Pin,
  Save,
  ShieldAlert,
  Upload
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/shared/radio-controls";
import { RichTextEditor } from "@/components/shared/rich-text/rich-text-editor";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { AvatarGroup } from "@/components/shared/user-avatar";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { knowledgeLimits, type KnowledgeAttachment, type KnowledgeItemDetail, type KnowledgeSpaceDetail, type UpdateKnowledgeItemRequest } from "@/contracts/knowledge";
import { maxAttachmentBytes } from "@/contracts/work";
import { knowledgeBodySpec, type RichTextDoc } from "@/contracts/rich-text";
import type { UserRef } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";
import { knowledgeApi } from "@/features/knowledge/api";
import { isUploadableImage, knowledgeAttachmentSource, uploadKnowledgeFile, useKnowledgeUploads } from "@/features/knowledge/attachments";
import { ConflictDialog } from "@/features/knowledge/components/conflict-dialog";
import { OwnerPicker } from "@/features/knowledge/components/owner-picker";
import { TagInput } from "@/features/knowledge/components/tag-input";
import { isVersionConflict, knowledgeErrorMessage } from "@/features/knowledge/errors";
import { refreshItem, refreshSpace, useCreateItem, useKnowledgeItem } from "@/features/knowledge/hooks";
import { knowledgeEditorExtensions } from "@/features/knowledge/editor/extensions";
import { useKeepFocusVisible } from "@/features/knowledge/editor/scroll";
import { KnowledgeToolbarExtras } from "@/features/knowledge/editor/toolbar";
import { bodyImageIds } from "@/features/knowledge/model/body";
import { approvalLocked, createStatusChoices, isValidReason, minReasonLength, reasonRequired, statusChoices } from "@/features/knowledge/model/access";
import { buildCategoryTree } from "@/features/knowledge/model/categories";
import { addMonths, todayDay } from "@/features/knowledge/model/dates";
import { clearDraft, draftKey, readDraft, writeDraft, type EditorFields } from "@/features/knowledge/model/drafts";
import {
  buildCreateRequest,
  buildUpdateRequest,
  defaultDraftStatus,
  diffFields,
  fieldsFromItem,
  fieldsToPlainText,
  newItemFields,
  normalizeBody,
  validateFields
} from "@/features/knowledge/model/editor";
import { isUuid } from "@/features/knowledge/model/filters";
import { importanceMeta, importanceOrder, statusGroupMeta } from "@/features/knowledge/model/labels";
import { adoptAutoDraft } from "@/features/knowledge/editor-address";
import { onKnowledgeEvent } from "@/features/knowledge/realtime";
import { useKnowledgeMentionSource } from "@/features/knowledge/use-mention-source";
import "@/features/knowledge/knowledge.css";
import { DateField } from "@/features/production/components/date-field";
import { AttachmentSourceContext } from "@/features/tasks/attachments";
import { FileRow, ImageThumb, UploadRow } from "@/features/tasks/components/detail/attachment-tiles";
import { relativeTime } from "@/features/tasks/time";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/query-keys";
import { toneClass } from "@/lib/colors";

import { KnowledgeNotFound } from "./layout";
import { useKnowledgeSpaceOutlet } from "./space-context";

/** /k/:spaceId/new — a new item (draft status by default). */
export const KnowledgeNewItemRoute = () => {
  const { space, ui } = useKnowledgeSpaceOutlet();
  const [params] = useSearchParams();
  const session = useSessionContext();
  const category = params.get("cat");
  const initial = useMemo(
    () =>
      newItemFields({
        categoryId: isUuid(category) && space.categories.some((entry) => entry.id === category) ? category : null,
        statusId: defaultDraftStatus(space.statuses)?.id ?? null,
        ownerId: session.user.id
      }),
    // The form starts once; later space refreshes must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  if (!ui.canCreateItem) {
    return (
      <CannotEdit
        title="Bạn chưa thể tạo mục trong kho này"
        description={
          ui.readOnly
            ? "Kho đã được lưu trữ, chỉ xem được."
            : "Tạo mục cần quyền Thành viên hoặc Quản lý kho. Hãy nhờ Quản lý kho cấp quyền."
        }
        backHref={`/k/${space.id}`}
        backLabel={`Về kho “${space.name}”`}
      />
    );
  }
  return <ItemEditor space={space} item={null} initial={initial} />;
};

/** Why this item / space cannot be edited by the caller (the editor route opened directly). */
const cannotEditReason = (item: KnowledgeItemDetail, space: KnowledgeSpaceDetail) => {
  if (space.archivedAt) return "Kho đã được lưu trữ, chỉ xem được.";
  if (item.deletedAt) return "Mục đang ở thùng rác. Khôi phục mục trước khi sửa.";
  if (approvalLocked(item, space)) return "Kho này bật bước duyệt: mục đã ban hành chỉ Quản lý kho mới sửa được. Hãy bình luận góp ý.";
  return "Sửa mục cần quyền Thành viên hoặc Quản lý kho. Bạn vẫn đọc, bình luận góp ý và theo dõi mục được.";
};

const CannotEdit = ({ title, description, backHref, backLabel }: { title: string; description: string; backHref: string; backLabel: string }) => (
  <div className="flex h-full items-center justify-center p-4">
    <EmptyState
      icon={Lock}
      title={title}
      description={description}
      action={
        <Button variant="outline" size="sm" render={<Link to={backHref} />} nativeButton={false}>
          <ArrowLeft />
          {backLabel}
        </Button>
      }
    />
  </div>
);

/** /k/:spaceId/i/:itemId/edit — edit an item; every save is a new numbered version. */
export const KnowledgeEditItemRoute = () => {
  const { itemId = "" } = useParams();
  const { space } = useKnowledgeSpaceOutlet();
  const valid = isUuid(itemId);
  const item = useKnowledgeItem(valid ? itemId : undefined);
  if (!valid) return <KnowledgeNotFound />;
  if (item.isPending) return <EditorSkeleton />;
  if (item.isError) {
    if (isApiError(item.error) && (item.error.status === 404 || item.error.status === 403)) return <KnowledgeNotFound />;
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorState error={item.error} onRetry={() => void item.refetch()} retrying={item.isFetching} />
      </div>
    );
  }
  if (item.data.spaceId !== space.id) return <KnowledgeNotFound />;
  if (!item.data.capabilities.canEdit || item.data.deletedAt || space.archivedAt) {
    return (
      <CannotEdit
        title="Bạn không sửa được mục này"
        description={cannotEditReason(item.data, space)}
        backHref={`/k/${space.id}/i/${item.data.id}`}
        backLabel="Về mục"
      />
    );
  }
  return <ItemEditor key={item.data.id} space={space} item={item.data} initial={fieldsFromItem(item.data)} />;
};

type SaveState = "idle" | "saved-local" | "local-failed";

const ItemEditor = ({
  space,
  item,
  initial
}: {
  space: KnowledgeSpaceDetail;
  item: KnowledgeItemDetail | null;
  initial: EditorFields;
}) => {
  const ids = useId();
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useSessionContext();
  const phone = useBreakpoint() === "mobile";
  const mentionSource = useKnowledgeMentionSource(space);
  // A new item is saved as a draft before its first image upload (files need an item): from then on the
  // editor works on that item in place.
  const [created, setCreated] = useState<string | null>(null);
  const itemId = item?.id ?? created;
  const createdDetail = useKnowledgeItem(created ?? undefined);
  const key = draftKey(session.user.id, itemId ? { itemId } : { spaceId: space.id });

  // A local draft left on this device (only when it differs from what is saved) is restored at once.
  const [draftAtOpen] = useState(() => {
    const draft = readDraft(key);
    return draft && diffFields(initial, draft.fields).any ? draft : null;
  });
  const staleDraft = Boolean(item && draftAtOpen?.baseVersion !== null && draftAtOpen && (draftAtOpen.baseVersion ?? 0) < (item?.version ?? 0));

  // The saved state the form compares with; replaced after a conflict is resolved by reloading.
  const [base, setBase] = useState<EditorFields>(initial);
  // A draft written on an older version keeps that version: saving then goes through the conflict choice.
  const [baseVersion, setBaseVersion] = useState<number>(staleDraft ? (draftAtOpen?.baseVersion ?? 0) : (item?.version ?? 0));
  const [fields, setFields] = useState<EditorFields>(draftAtOpen?.fields ?? initial);
  const [versionNote, setVersionNote] = useState(draftAtOpen?.versionNote ?? "");
  const [reason, setReason] = useState("");
  const [bodySeed, setBodySeed] = useState<{ doc: RichTextDoc; key: number }>({ doc: draftAtOpen?.fields.body ?? initial.body, key: 0 });
  const [owner, setOwner] = useState<UserRef | null>(item?.owner ?? (initial.ownerId === session.user.id ? { id: session.user.id, displayName: session.user.displayName, email: session.user.email, avatarUrl: null } : null));
  const [restored, setRestored] = useState<{ savedAt: number; staleFrom: number | null } | null>(() =>
    draftAtOpen ? { savedAt: draftAtOpen.savedAt, staleFrom: staleDraft ? draftAtOpen.baseVersion : null } : null
  );
  const [localState, setLocalState] = useState<SaveState>("idle");
  const [touched, setTouched] = useState(false);
  const [conflict, setConflict] = useState<KnowledgeItemDetail | "loading" | null>(null);
  const [remote, setRemote] = useState<{ version: number } | null>(null);
  const [others, setOthers] = useState<UserRef[]>([]);
  const leaving = useRef(false);

  const create = useCreateItem(space.id);
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateKnowledgeItemRequest }) => knowledgeApi.updateItem(id, input),
    meta: { errorMessage: false },
    onSuccess: (_result, { id }) => refreshItem(client, id, space.id)
  });
  const saving = create.isPending || update.isPending;
  const editorRef = useRef<Editor | null>(null);

  // Images must be files of this very item (server: KNOWLEDGE_IMAGE_INVALID). One copied from another item
  // (pasted HTML keeps its attachment id) is removed at once with an explanation, instead of failing the
  // whole save later (KB-SEC FE-07). Known: the item's files, images already in its saved body (a file
  // hidden from the list but used by a version) and uploads of this session.
  const uploadedIds = useRef(new Set<string>());
  const knownImage = (id: string) =>
    uploadedIds.current.has(id) ||
    bodyImageIds(base.body).includes(id) ||
    ((item ?? createdDetail.data)?.attachments.some((attachment) => attachment.id === id) ?? false);
  const hasForeignImages = (doc: RichTextDoc) => bodyImageIds(doc).some((id) => !knownImage(id));
  const dropForeignImages = () => {
    const instance = editorRef.current;
    if (!instance || instance.isDestroyed) return;
    const ranges: { from: number; to: number }[] = [];
    instance.state.doc.descendants((node, pos) => {
      if (node.type.name === "image" && !knownImage(String(node.attrs.attachmentId ?? ""))) ranges.push({ from: pos, to: pos + node.nodeSize });
    });
    if (ranges.length === 0) return;
    const tr = instance.state.tr;
    for (const range of ranges.reverse()) tr.delete(range.from, range.to);
    instance.view.dispatch(tr);
    toast.error("Ảnh chép từ mục khác không dùng lại được ở đây", {
      description: "Mỗi mục giữ ảnh của riêng mình. Hãy tải ảnh lên lại: dán tệp ảnh, kéo thả hoặc bấm “Chèn ảnh”."
    });
  };
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  // On-screen keyboard: keep the caret (or the focused field) in view when the page area gets shorter.
  useKeepFocusVisible(scroller, () => {
    const instance = editorRef.current;
    if (!instance || instance.isDestroyed || !instance.isFocused) return false;
    instance.commands.scrollIntoView();
    return true;
  });

  // --- Local draft: kept in sync with the form ------------------------------------------------------
  const changes = useMemo(() => diffFields(base, fields), [base, fields]);
  const dirty = changes.any || Boolean(versionNote.trim());

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!dirty) {
        clearDraft(key);
        setLocalState("idle");
        return;
      }
      const ok = writeDraft(key, { baseVersion: itemId ? baseVersion : null, fields, versionNote });
      setLocalState(ok ? "saved-local" : "local-failed");
    }, 500);
    return () => clearTimeout(timer);
  }, [baseVersion, dirty, fields, itemId, key, versionNote]);

  // --- Leaving with unsaved changes ------------------------------------------------------------------
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !leaving.current && dirty && currentLocation.pathname !== nextLocation.pathname
  );
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // --- Edit presence + "someone saved a newer version" ------------------------------------------------
  useEffect(() => {
    if (!item) return undefined;
    let stopped = false;
    const ping = (editing: boolean, keepalive = false) =>
      knowledgeApi
        .editing(item.id, editing, { keepalive })
        .then((state) => {
          if (!stopped) setOthers(state.editing.filter((user) => user.id !== session.user.id));
        })
        .catch(() => undefined);
    api.warmCsrfToken();
    void ping(true);
    const timer = window.setInterval(() => void ping(true), 30_000);
    // Someone else opened / closed the editor (presence change = item event without a version): refresh now.
    const off = onKnowledgeEvent((event) => {
      if (event.itemId === item.id && event.kind === "item_updated" && event.version === null) void ping(true);
    });
    return () => {
      stopped = true;
      off();
      window.clearInterval(timer);
      void ping(false, true);
    };
  }, [item, session.user.id]);

  useEffect(() => {
    if (!item) return undefined;
    return onKnowledgeEvent((event) => {
      if (event.itemId === item.id && event.kind === "item_updated" && event.version !== null && event.version > baseVersion) {
        setRemote({ version: event.version });
      }
    });
  }, [baseVersion, item]);

  // --- Saving -------------------------------------------------------------------------------------------
  const errors = validateFields(fields);
  const needsReason = Boolean(itemId) && reasonRequired(item?.importance ?? base.importance, fields.importance) && changes.any;
  const reasonInvalid = needsReason && !isValidReason(reason);
  const hasErrors = Object.keys(errors).length > 0 || reasonInvalid;

  const finish = (savedId: string) => {
    clearDraft(key);
    leaving.current = true;
    void navigate(`/k/${space.id}/i/${savedId}`, { replace: true });
  };

  const save = (overrideVersion?: number) => {
    setTouched(true);
    if (hasErrors) {
      toast.error(reasonInvalid ? `Mục Rất quan trọng: ghi lý do (ít nhất ${minReasonLength} ký tự).` : "Kiểm tra lại các trường được đánh dấu.");
      return;
    }
    if (!itemId) {
      create.mutate(buildCreateRequest(fields), {
        onSuccess: (created) => {
          toast.success("Đã tạo mục (phiên bản 1)");
          finish(created.id);
        },
        onError: (error) => toast.error(knowledgeErrorMessage(error, "Không tạo được mục."))
      });
      return;
    }
    const request = buildUpdateRequest(base, fields, {
      baseVersion: overrideVersion ?? baseVersion,
      versionNote,
      reason: needsReason ? reason : undefined
    });
    if (!request) {
      if (!item) toast.success("Đã lưu mục");
      else toast("Chưa có thay đổi nào để lưu.");
      finish(itemId);
      return;
    }
    update.mutate({ id: itemId, input: request }, {
      onSuccess: () => {
        setConflict(null);
        toast.success(changes.content ? "Đã lưu phiên bản mới" : "Đã lưu thay đổi");
        finish(itemId);
      },
      onError: (error) => {
        if (isVersionConflict(error)) {
          void openConflict();
          return;
        }
        toast.error(knowledgeErrorMessage(error, "Không lưu được."));
      }
    });
  };

  const openConflict = useCallback(async () => {
    if (!itemId) return;
    setConflict("loading");
    try {
      const latest = await client.fetchQuery({
        queryKey: qk.knowledge.item(itemId),
        queryFn: ({ signal }) => knowledgeApi.item(itemId, signal),
        staleTime: 0
      });
      setConflict(latest);
    } catch (error) {
      setConflict(null);
      toast.error(knowledgeErrorMessage(error, "Không tải được phiên bản mới nhất."));
    }
  }, [client, itemId]);

  // --- Images (and other files) in the body -------------------------------------------------------------
  /** The item id to attach files to; a new item is first saved as a draft (version 1). */
  const ensureItem = async (): Promise<string | null> => {
    if (itemId) return itemId;
    if (!fields.title.trim()) {
      toast.error("Nhập tiêu đề trước: mục sẽ được lưu nháp để giữ ảnh và tệp.");
      document.getElementById(`${ids}-title`)?.focus();
      return null;
    }
    const draftStatus = defaultDraftStatus(space.statuses);
    const request = { ...buildCreateRequest(fields), ...(draftStatus ? { statusId: draftStatus.id } : {}) };
    try {
      const saved = await knowledgeApi.createItem(space.id, request);
      // The editor stays mounted (uploads continue); the address becomes /k/…/i/<id>/edit and the local
      // draft moves to the item, so a reload reopens this draft item instead of an empty form.
      adoptAutoDraft({ userId: session.user.id, spaceId: space.id, itemId: saved.id });
      const savedFields = { ...fields, statusId: draftStatus?.id ?? fields.statusId, body: normalizeBody(fields.body) };
      setBase(savedFields);
      setBaseVersion(1);
      setCreated(saved.id);
      void refreshSpace(client, space.id);
      toast("Đã lưu nháp mục (phiên bản 1) để giữ ảnh", { description: "Soạn tiếp rồi bấm “Lưu phiên bản” khi xong." });
      return saved.id;
    } catch (error) {
      toast.error(knowledgeErrorMessage(error, "Không lưu nháp được mục."));
      return null;
    }
  };

  const insertFiles = async (files: readonly File[]) => {
    const usable = files.filter((file) => {
      if (file.size === 0) {
        toast.error(`“${file.name}” trống, không thể tải lên.`);
        return false;
      }
      if (file.size > maxAttachmentBytes) {
        toast.error(`“${file.name}” vượt quá giới hạn 50 MB.`);
        return false;
      }
      return true;
    });
    if (usable.length === 0 || imageBusy) return;
    setImageBusy(true);
    try {
      const target = await ensureItem();
      if (!target) return;
      for (const file of usable) {
        try {
          const attachment = await uploadKnowledgeFile(target, file, "item");
          uploadedIds.current.add(attachment.id);
          if (isUploadableImage(file) && editorRef.current) {
            // Small pictures keep their own size instead of being stretched to the column ("Rộng").
            const natural = await imageWidth(file);
            placeImage(editorRef.current, {
              attachmentId: attachment.id,
              alt: file.name.replace(/\.[^.]+$/, "").slice(0, knowledgeBodySpec.imageAltLength),
              width: natural !== null && natural < 560 ? Math.max(knowledgeBodySpec.imageMinWidth, natural) : null
            });
          } else {
            toast.success(`Đã đính kèm “${file.name}”`);
          }
        } catch (error) {
          toast.error(`Không tải lên được “${file.name}”`, { description: knowledgeErrorMessage(error) });
        }
      }
      void client.invalidateQueries({ queryKey: qk.knowledge.item(target), exact: true });
    } finally {
      setImageBusy(false);
    }
  };

  const keepMine = () => {
    if (conflict && conflict !== "loading") save(conflict.version);
  };

  const copyMine = async () => {
    if (!conflict || conflict === "loading") return;
    const text = fieldsToPlainText(fields);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã chép nội dung của bạn", { description: "Trình soạn thảo đã chuyển sang phiên bản mới nhất — dán lại phần bạn cần giữ." });
    } catch {
      toast.error("Không chép được vào bộ nhớ tạm. Bản nháp của bạn vẫn được giữ trên máy này.");
      return;
    }
    // Keep a copy of the draft for safety, then continue from the latest version.
    writeDraft(`${key}:copy`, { baseVersion, fields, versionNote });
    const latestFields = fieldsFromItem(conflict);
    setBase(latestFields);
    setFields(latestFields);
    setBaseVersion(conflict.version);
    setBodySeed((seed) => ({ doc: latestFields.body, key: seed.key + 1 }));
    setOwner(conflict.owner);
    setRemote(null);
    setRestored(null);
    setConflict(null);
    void refreshItem(client, conflict.id, space.id);
  };

  const discardDraft = () => {
    clearDraft(key);
    setFields(base);
    setVersionNote("");
    setBaseVersion(item?.version ?? 0);
    setBodySeed((seed) => ({ doc: base.body, key: seed.key + 1 }));
    setOwner(item?.owner ?? owner);
    setRestored(null);
  };

  const set = <K extends keyof EditorFields>(field: K, value: EditorFields[K]) => setFields((current) => ({ ...current, [field]: value }));
  const backHref = itemId ? `/k/${space.id}/i/${itemId}` : `/k/${space.id}`;

  const statusOptions = useMemo(() => {
    if (!item) return createStatusChoices(space.statuses, space);
    return [item.status, ...statusChoices(space.statuses, item)];
  }, [item, space]);

  const mine = useMemo(() => ({ title: fields.title, summary: fields.summary || null, body: normalizeBody(fields.body) }), [fields.body, fields.summary, fields.title]);

  const sidePanel = (
    <div className="flex flex-col gap-4">
      <FieldsCard
        ids={ids}
        space={space}
        fields={fields}
        owner={owner}
        statusOptions={statusOptions}
        errors={touched ? errors : {}}
        onOwner={(user) => {
          setOwner(user);
          set("ownerId", user?.id ?? null);
        }}
        set={set}
      />
      {item ? <EditorAttachments item={item} inBody={bodyImageIds(fields.body)} /> : createdDetail.data ? <EditorAttachments item={createdDetail.data} inBody={bodyImageIds(fields.body)} /> : null}
    </div>
  );

  return (
    <AttachmentSourceContext value={knowledgeAttachmentSource}>
    <div className="kb-editor kb-touch flex h-full min-h-0 flex-col">
      {/* Top bar: back, local draft state, Save. */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-5 pointer-coarse:h-14">
        <Button variant="ghost" size="sm" onClick={() => void navigate(backHref)} className="text-foreground-muted">
          <ArrowLeft />
          <span className="max-sm:sr-only">{itemId ? "Quay lại mục" : "Quay lại kho"}</span>
        </Button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground-muted max-sm:hidden">
          {item ? `Sửa · ${item.title}` : `Mục mới · ${space.name}`}
        </span>
        <LocalDraftBadge state={localState} dirty={dirty} />
        <Button size="sm" onClick={() => save()} disabled={saving} className="max-sm:ml-auto">
          {saving ? <Spinner /> : <Save />}
          {itemId ? "Lưu phiên bản" : "Tạo mục"}
        </Button>
      </div>

      <div ref={setScroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[80rem] gap-x-8 gap-y-6 px-4 pt-5 pb-16 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pt-7">
          <div className="flex min-w-0 flex-col gap-4">
            {others.length > 0 ? (
              <Notice tone="brand" icon={<AvatarGroup users={others} size="xs" max={3} />}>
                <span className="font-medium">{others.map((user) => user.displayName).join(", ")}</span> cũng đang sửa hoặc vừa lưu mục này. Khi
                hai người cùng lưu, người lưu sau sẽ được chọn cách xử lý — không ai bị ghi đè.
              </Notice>
            ) : null}
            {remote ? (
              <Notice tone="warning" icon={<History className="size-4 text-warning" />}>
                Vừa có phiên bản mới (v{remote.version}). Bạn vẫn soạn tiếp được; khi lưu, bạn sẽ chọn giữ bản của mình hay chuyển sang bản mới.
              </Notice>
            ) : null}
            {restored ? (
              <Notice
                tone={restored.staleFrom ? "warning" : "muted"}
                icon={<NotebookPen className="size-4 text-brand-text" />}
                action={
                  <Button variant="ghost" size="xs" onClick={discardDraft}>
                    Bỏ bản nháp
                  </Button>
                }
              >
                Đã khôi phục bản nháp chưa lưu trên máy này ({relativeTime(new Date(restored.savedAt).toISOString())}).
                {restored.staleFrom && item ? ` Bản nháp soạn từ phiên bản ${restored.staleFrom}; hiện đã có phiên bản ${item.version}.` : ""}
              </Notice>
            ) : null}

            {/* Font size on the wrapper too: touch devices force fields to max(1rem, 1em of the parent). */}
            <div className="flex flex-col gap-1 text-[26px] font-bold sm:text-[30px]">
              <label htmlFor={`${ids}-title`} className="sr-only">
                Tiêu đề
              </label>
              <textarea
                id={`${ids}-title`}
                value={fields.title}
                rows={1}
                maxLength={200}
                autoFocus={!item}
                placeholder="Tiêu đề mục"
                aria-invalid={touched && Boolean(errors.title)}
                onChange={(event) => set("title", event.target.value.replace(/\n/g, " "))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                className="field-sizing-content min-h-10 w-full resize-none bg-transparent text-[26px] leading-tight font-bold tracking-[-0.025em] outline-none placeholder:text-foreground-subtle/70 sm:text-[30px]"
              />
              {touched && errors.title ? <p className="text-[13px] font-normal text-danger">{errors.title}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-summary`} className="sr-only">
                Tóm tắt
              </label>
              <textarea
                id={`${ids}-summary`}
                value={fields.summary}
                rows={2}
                maxLength={400}
                placeholder="Tóm tắt 1–2 câu (hiện ở danh sách và kết quả tìm kiếm)"
                onChange={(event) => set("summary", event.target.value)}
                className="field-sizing-content min-h-12 w-full resize-none bg-transparent text-[16px] leading-relaxed text-foreground-muted outline-none placeholder:text-foreground-subtle/70"
              />
              {fields.summary.length > 320 ? (
                <p className="self-end text-[11px] text-foreground-subtle tabular-nums">{fields.summary.length}/400</p>
              ) : null}
            </div>

            <div className="rounded-xl border bg-surface shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
              <RichTextEditor
                key={bodySeed.key}
                variant="description"
                value={bodySeed.doc}
                toolbar
                mentionSource={mentionSource}
                placeholder="Viết nội dung… Dùng Tiêu đề 2/3 để tạo mục lục, Trích dẫn làm khối “Lưu ý”, gõ @ để nhắc tên."
                onChange={(doc) => {
                  set("body", doc);
                  if (hasForeignImages(doc)) queueMicrotask(dropForeignImages);
                }}
                extensions={knowledgeEditorExtensions}
                onEditorReady={(instance) => {
                  editorRef.current = instance;
                }}
                onPasteFiles={(files) => void insertFiles(files)}
                toolbarExtras={(instance) => (
                  <KnowledgeToolbarExtras editor={instance} uploading={imageBusy} onPickImages={(files) => void insertFiles(files)} />
                )}
                toolbarClassName={cn(
                  "sticky top-0 z-10 flex-nowrap overflow-x-auto scrollbar-none rounded-t-xl border-b bg-surface/95 px-2 py-1.5 backdrop-blur",
                  phone && "gap-0"
                )}
                contentClassName="kb-body min-h-72 px-4 py-4 sm:px-6"
                aria-label="Nội dung mục"
              />
            </div>
            {touched && errors.body ? <p className="text-[13px] text-danger">{errors.body}</p> : null}

            {itemId ? (
              <SaveCard
                ids={ids}
                versionNote={versionNote}
                onVersionNote={setVersionNote}
                needsReason={needsReason}
                reason={reason}
                onReason={setReason}
                reasonError={touched && reasonInvalid}
                contentChanged={changes.content}
                nextVersion={baseVersion + 1}
              />
            ) : null}
            {phone ? sidePanel : null}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
              <Button variant="ghost" onClick={() => void navigate(backHref)}>
                Hủy
              </Button>
              <Button onClick={() => save()} disabled={saving}>
                {saving ? <Spinner /> : <Save />}
                {itemId ? "Lưu phiên bản" : "Tạo mục"}
              </Button>
            </div>
          </div>
          {phone ? null : <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">{sidePanel}</aside>}
        </div>
      </div>

      <ConflictDialog
        open={conflict !== null}
        latest={conflict === "loading" ? null : conflict}
        mine={mine}
        saving={update.isPending}
        onKeepMine={keepMine}
        onCopyMine={() => void copyMine()}
        onClose={() => setConflict(null)}
      />
      <LeaveDialog
        open={blocker.state === "blocked"}
        onStay={() => blocker.reset?.()}
        onLeave={() => blocker.proceed?.()}
        onDiscard={() => {
          clearDraft(key);
          blocker.proceed?.();
        }}
      />
    </div>
    </AttachmentSourceContext>
  );
};

// --- Pieces ---------------------------------------------------------------------------------------------

/** Pixel width of an image file (null when the browser cannot decode it here). */
const imageWidth = async (file: File) => {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    bitmap.close();
    return width;
  } catch {
    return null;
  }
};

/**
 * Puts an uploaded image at the cursor, then a text cursor right below it (in the next paragraph, created
 * when nothing follows) — so the next upload or keystroke never replaces the image just placed (a new
 * block image is otherwise left selected).
 */
const placeImage = (editor: Editor, attrs: { attachmentId: string; alt: string; width: number | null }) => {
  const image = { type: "image", attrs };
  const { selection } = editor.state;
  const chain = editor.chain().focus();
  (selection instanceof NodeSelection ? chain.insertContentAt(selection.to, image) : chain.insertContent(image)).run();
  const placed = editor.state.selection;
  if (!(placed instanceof NodeSelection) || placed.node.type.name !== "image") return;
  const end = placed.to;
  if (editor.state.doc.resolve(end).nodeAfter?.isTextblock) editor.chain().setTextSelection(end + 1).scrollIntoView().run();
  else editor.chain().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).scrollIntoView().run();
};

const Notice = ({
  tone,
  icon,
  action,
  children
}: {
  tone: "brand" | "warning" | "muted";
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div
    role="status"
    className={cn(
      "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed",
      tone === "warning" ? "border-warning/40 bg-warning-soft" : tone === "brand" ? "border-brand/25 bg-brand-soft/60" : "bg-muted/50"
    )}
  >
    <span className="mt-0.5 shrink-0">{icon}</span>
    <p className="min-w-0 flex-1">{children}</p>
    {action}
  </div>
);

const LocalDraftBadge = ({ state, dirty }: { state: SaveState; dirty: boolean }) => {
  if (!dirty) return null;
  return (
    <span role="status" aria-live="polite" className="hidden items-center gap-1 text-[11px] text-foreground-subtle sm:inline-flex">
      {state === "local-failed" ? (
        <>
          <CloudOff className="size-3.5 text-warning" aria-hidden="true" />
          Không lưu nháp được trên máy
        </>
      ) : (
        <>
          <CloudCheck className="size-3.5" aria-hidden="true" />
          Đã lưu nháp trên máy · chưa thành phiên bản
        </>
      )}
    </span>
  );
};

const FieldsCard = ({
  ids,
  space,
  fields,
  owner,
  statusOptions,
  errors,
  onOwner,
  set
}: {
  ids: string;
  space: KnowledgeSpaceDetail;
  fields: EditorFields;
  owner: UserRef | null;
  statusOptions: KnowledgeSpaceDetail["statuses"];
  errors: ReturnType<typeof validateFields>;
  onOwner: (user: UserRef | null) => void;
  set: <K extends keyof EditorFields>(field: K, value: EditorFields[K]) => void;
}) => {
  const tree = buildCategoryTree(space.categories);
  const categoryLabel = (id: string | null) => {
    if (!id) return "Chưa phân loại";
    const category = space.categories.find((entry) => entry.id === id);
    const parent = category?.parentId ? space.categories.find((entry) => entry.id === category.parentId) : null;
    return category ? `${parent ? `${parent.name} › ` : ""}${category.name}` : "Chưa phân loại";
  };
  const status = statusOptions.find((entry) => entry.id === fields.statusId);
  const today = todayDay();

  return (
    <section aria-label="Thông tin mục" className="flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-xs">
      <Field>
        <FieldLabel id={`${ids}-importance`}>Mức quan trọng</FieldLabel>
        <SegmentedControl
          aria-labelledby={`${ids}-importance`}
          size="sm"
          value={fields.importance}
          onChange={(value) => set("importance", value)}
          options={importanceOrder
            .slice()
            .reverse()
            .map((importance) => ({ value: importance, label: importanceMeta[importance].short, description: importanceMeta[importance].description }))}
          className="w-full"
        />
        <FieldDescription className={cn("text-xs", fields.importance === "critical" && "flex items-start gap-1.5 text-foreground")}>
          {fields.importance === "critical" ? <ShieldAlert className="mt-px size-3.5 shrink-0 text-danger" aria-hidden="true" /> : null}
          {importanceMeta[fields.importance].description}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${ids}-status`}>Trạng thái</FieldLabel>
        <Select value={fields.statusId ?? ""} onValueChange={(value) => value && set("statusId", String(value))}>
          <SelectTrigger id={`${ids}-status`} className="w-full">
            <SelectValue>
              {status ? (
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={cn(toneClass(status.color), "size-2 rounded-full bg-(--tone)")} />
                  {status.name}
                  <span className="text-xs text-foreground-subtle">· {statusGroupMeta[status.group].label}</span>
                </span>
              ) : (
                "Chọn trạng thái"
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                <span aria-hidden="true" className={cn(toneClass(entry.color), "size-2 rounded-full bg-(--tone)")} />
                {entry.name}
                <span className="text-xs text-foreground-subtle">· {statusGroupMeta[entry.group].label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {space.approvalRequired && !space.capabilities.canManage ? (
          <FieldDescription className="text-xs">Kho bật bước duyệt: Quản lý kho sẽ ban hành mục.</FieldDescription>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor={`${ids}-category`}>Chuyên mục</FieldLabel>
        <Select value={fields.categoryId ?? "none"} onValueChange={(value) => set("categoryId", value && value !== "none" ? String(value) : null)}>
          <SelectTrigger id={`${ids}-category`} className="w-full">
            <SelectValue>{categoryLabel(fields.categoryId)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Chưa phân loại</SelectItem>
            {tree.flatMap((node) => [
              <SelectItem key={node.id} value={node.id}>
                {node.name}
              </SelectItem>,
              ...node.children.map((child) => (
                <SelectItem key={child.id} value={child.id} className="pl-6">
                  <span className="text-foreground-subtle">›</span> {child.name}
                </SelectItem>
              ))
            ])}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${ids}-owner`}>Người phụ trách</FieldLabel>
        <OwnerPicker id={`${ids}-owner`} space={space} value={owner} onChange={onOwner} />
        <FieldDescription className="text-xs">Chịu trách nhiệm nội dung đúng, được nhắc khi tới hạn rà soát.</FieldDescription>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Field>
          <FieldLabel id={`${ids}-effective`}>Hiệu lực từ</FieldLabel>
          <DateField aria-labelledby={`${ids}-effective`} value={fields.effectiveFrom} onChange={(day) => set("effectiveFrom", day)} clearable today={today} placeholder="Chọn ngày" />
        </Field>
        <Field data-invalid={Boolean(errors.dates)}>
          <FieldLabel id={`${ids}-review`}>Hạn rà soát</FieldLabel>
          <DateField aria-labelledby={`${ids}-review`} value={fields.reviewBy} onChange={(day) => set("reviewBy", day)} clearable today={today} placeholder="Chọn ngày" />
          <div className="flex flex-wrap gap-1">
            {[6, 12].map((months) => (
              <Button key={months} type="button" variant="ghost" size="xs" className="text-foreground-muted" onClick={() => set("reviewBy", addMonths(fields.effectiveFrom ?? today, months))}>
                +{months === 12 ? "1 năm" : `${months} tháng`}
              </Button>
            ))}
          </div>
          {errors.dates ? <FieldError>{errors.dates}</FieldError> : null}
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`${ids}-tags`}>Tag</FieldLabel>
        <TagInput id={`${ids}-tags`} value={fields.tags} onChange={(tags) => set("tags", tags)} suggestions={space.tags} />
      </Field>
    </section>
  );
};

const SaveCard = ({
  ids,
  versionNote,
  onVersionNote,
  needsReason,
  reason,
  onReason,
  reasonError,
  contentChanged,
  nextVersion
}: {
  ids: string;
  versionNote: string;
  onVersionNote: (value: string) => void;
  needsReason: boolean;
  reason: string;
  onReason: (value: string) => void;
  reasonError: boolean;
  contentChanged: boolean;
  nextVersion: number;
}) => (
  <section aria-label="Lưu phiên bản" className="flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-xs">
    <p className="flex items-start gap-2 text-[13px] text-foreground-muted">
      <Info className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
      {contentChanged
        ? `Bấm “Lưu phiên bản” để tạo phiên bản ${nextVersion}. Các phiên bản cũ được giữ nguyên, khôi phục được bất cứ lúc nào.`
        : "Bản nháp tự lưu trên máy này cho tới khi bạn lưu phiên bản."}
    </p>
    <Field>
      <FieldLabel htmlFor={`${ids}-note`}>
        Ghi chú phiên bản <span className="font-normal text-foreground-subtle">(không bắt buộc)</span>
      </FieldLabel>
      <Input id={`${ids}-note`} value={versionNote} maxLength={200} placeholder="Ví dụ: Sửa bước 3, thêm ảnh minh hoạ" onChange={(event) => onVersionNote(event.target.value)} />
    </Field>
    {needsReason ? (
      <Field data-invalid={reasonError}>
        <FieldLabel htmlFor={`${ids}-reason`} className="flex items-center gap-1.5">
          <ShieldAlert className="size-3.5 text-danger" aria-hidden="true" />
          Lý do thay đổi
        </FieldLabel>
        <Textarea
          id={`${ids}-reason`}
          value={reason}
          rows={2}
          maxLength={500}
          aria-invalid={reasonError}
          placeholder="Mục Rất quan trọng: ghi lý do (lưu trong nhật ký)"
          onChange={(event) => onReason(event.target.value)}
          className="min-h-16 resize-none"
        />
        {reasonError ? <FieldError>{`Nhập lý do (ít nhất ${minReasonLength} ký tự).`}</FieldError> : null}
      </Field>
    ) : null}
  </section>
);

/** Files of the item: upload (or paste into the body), delete. Images show as tiles. */
const EditorAttachments = ({ item, inBody: bodyImages }: { item: KnowledgeItemDetail; inBody: readonly string[] }) => {
  const input = useRef<HTMLInputElement | null>(null);
  const client = useQueryClient();
  const uploads = useKnowledgeUploads(item.id, "item", (attachment: KnowledgeAttachment) => toast.success(`Đã tải lên “${attachment.fileName}”`));
  // Images placed in the body are shown there, not in this list.
  const inBody = new Set(bodyImages);
  const files = item.attachments.filter((attachment) => attachment.commentId === null && !inBody.has(attachment.id));
  const pending = uploads.items.filter((entry) => entry.status !== "done");
  const remove = async (attachment: KnowledgeAttachment) => {
    try {
      await knowledgeApi.deleteAttachment(attachment.id);
      toast.success("Đã xoá tệp");
      void client.invalidateQueries({ queryKey: qk.knowledge.item(item.id), exact: true });
    } catch (error) {
      toast.error(knowledgeErrorMessage(error, "Không xoá được tệp."));
    }
  };
  return (
    <AttachmentSourceContext value={knowledgeAttachmentSource}>
      <section aria-label="Tệp đính kèm" className="flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <Paperclip className="size-3.5 text-foreground-muted" aria-hidden="true" />
            Tệp đính kèm
          </h2>
          <span className="text-xs text-foreground-subtle tabular-nums">{item.attachments.filter((attachment) => attachment.commentId === null).length}/{knowledgeLimits.attachmentsPerItem}</span>
          <Button variant="ghost" size="xs" className="ml-auto text-foreground-muted" onClick={() => input.current?.click()}>
            <Upload />
            Tải lên
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              uploads.start(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
        {files.length === 0 && pending.length === 0 ? (
          <p className="text-xs text-foreground-subtle">Tài liệu tham khảo, ảnh minh hoạ (tối đa 50 MB mỗi tệp). Tệp được thêm ngay, không cần lưu phiên bản.</p>
        ) : null}
        {pending.map((entry) => (
          <UploadRow key={entry.id} item={entry} onRemove={() => uploads.remove(entry.id)} />
        ))}
        {files.filter((file) => file.isImage).length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5">
            {files
              .filter((file) => file.isImage)
              .map((file) => (
                <ImageThumb key={file.id} attachment={file} size="md" onOpen={() => undefined} onDelete={file.canDelete ? () => void remove(file) : undefined} />
              ))}
          </div>
        ) : null}
        {files
          .filter((file) => !file.isImage)
          .map((file) => (
            <FileRow key={file.id} attachment={file} compact onDelete={file.canDelete ? () => void remove(file) : undefined} />
          ))}
      </section>
    </AttachmentSourceContext>
  );
};

const LeaveDialog = ({
  open,
  onStay,
  onLeave,
  onDiscard
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
  onDiscard: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={(next) => (next ? undefined : onStay())}>
    <AlertDialogContent onKeyDown={(event) => event.key === "Escape" && event.stopPropagation()}>
      <AlertDialogHeader>
        <AlertDialogTitle>Rời trang khi chưa lưu phiên bản?</AlertDialogTitle>
        <AlertDialogDescription>
          Thay đổi của bạn chưa thành phiên bản. Bản nháp vẫn được giữ trên máy này để bạn quay lại soạn tiếp.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="sm:flex-wrap">
        <AlertDialogCancel autoFocus>Tiếp tục soạn</AlertDialogCancel>
        <Button variant="outline" onClick={onLeave}>
          <Pin className="rotate-45" />
          Giữ nháp, rời đi
        </Button>
        <Button variant="destructive" onClick={onDiscard}>
          Bỏ nháp, rời đi
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const EditorSkeleton = () => (
  <div className="flex h-full flex-col" aria-busy="true" aria-label="Đang mở trình soạn thảo">
    <div className="flex h-12 items-center gap-2 border-b px-4">
      <Skeleton className="h-7 w-28 rounded-lg" />
      <Skeleton className="ml-auto h-7 w-28 rounded-lg" />
    </div>
    <div className="mx-auto grid w-full max-w-[80rem] gap-8 px-4 pt-7 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
      <Skeleton className="hidden h-96 rounded-xl lg:block" />
    </div>
  </div>
);
