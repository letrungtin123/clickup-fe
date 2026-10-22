import { cn } from "cn";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { AvatarUser } from "@/components/shared/user-avatar";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionProject, ProjectOwnerPick } from "@/contracts/production-catalog";
import { useSessionContext } from "@/features/auth/hooks";

import { productionErrorMessage } from "../../errors";
import { useProductionAccess, useProjectMutations } from "../../hooks";
import { useProductionPeople } from "../../people";
import { projectCodeTaken } from "../../projects";
import { sheetOnPhone } from "../../ui";
import { PersonSelect } from "../jobs/pickers";
import { FormAlert } from "../settings-kit";
import { OwnersDisplay, OwnersMultiSelect } from "./owners-select";

const codeConflict = "Mã Project đã tồn tại (không phân biệt hoa thường). Hãy chọn mã khác.";
/** An older Project without owner, opened by an Admin: shown at once until one is picked (the API asks the same). */
export const ownerMissingError = "Project chưa có người phụ trách — chọn người phụ trách để lưu.";
export const ownerRequiredError = "Chọn người phụ trách cho Project.";

/** How the owners are shown in the dialog. */
type OwnerMode = "self" | "one" | "many" | "readonly";

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * PD-078 / PD-079 — create / edit a Project: Mã, Tên Project, Mô tả and "Người phụ trách" (members holding LEADER or
 * ADMIN). New Project (`ownerPick` of the list): the superadmin picks one or more owners (multi-select, the first is the
 * main one), an Admin or an Account exactly one (required), a Leader owns it (locked). Editing (`capabilities.ownerEdit`):
 * the superadmin the whole list, an Admin the single owner of a Project that has at most one, anyone else read-only (an
 * Account never changes the owner after creating); an older Project without owner must get one. The API enforces the same.
 */
export const ProjectDialog = ({
  open,
  project,
  projects,
  ownerPick,
  onClose
}: {
  open: boolean;
  /** null: a new Project. */
  project: ProductionProject | null;
  /** How a new Project's owners are picked (the list's `ownerPick`); ignored when editing. */
  ownerPick: ProjectOwnerPick | null;
  /** Every Project (duplicate code check before the API answers 409). */
  projects: readonly ProductionProject[];
  onClose: () => void;
}) => {
  const ids = useId();
  const session = useSessionContext();
  const access = useProductionAccess();
  const mutations = useProjectMutations();
  const people = useProductionPeople(project?.owners ?? []);
  const me = session.user.id;
  const mode: OwnerMode = project
    ? project.capabilities.ownerEdit === "none"
      ? "readonly"
      : project.capabilities.ownerEdit
    : (ownerPick ?? "self");
  const choosesOwner = mode === "one" || mode === "many";
  const currentOwnerIds = project?.owners.map((owner) => owner.id) ?? [];
  const [code, setCode] = useState(project?.code ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  // A new Project: a Leader (also Account / Admin) starts as its owner; an Admin or an Account alone picks.
  const [ownerIds, setOwnerIds] = useState<string[]>(() =>
    project
      ? currentOwnerIds
      : mode === "self" || (mode !== "many" && access.roles.includes("LEADER"))
        ? [me]
        : []
  );
  const [errors, setErrors] = useState<{ code?: string; name?: string; owner?: string }>(() =>
    project && project.owners.length === 0 && choosesOwner ? { owner: ownerMissingError } : {}
  );
  const [formError, setFormError] = useState<string | null>(null);
  const pending = mutations.create.isPending || mutations.update.isPending;

  const candidates = people.withRole("LEADER", "ADMIN");
  // Current owners who lost the role stay listed (and selectable away).
  const ownerChoices = [
    ...(project?.owners ?? []).filter(
      (owner) => !candidates.some((person) => person.id === owner.id)
    ),
    ...candidates
  ];
  const meAsOwner: AvatarUser = people.byId(me) ?? {
    id: me,
    displayName: session.user.displayName
  };

  const clearOwnerError = () =>
    setErrors((previous) => {
      const rest = { ...previous };
      delete rest.owner;
      return rest;
    });

  const submit = () => {
    const next = { code: code.trim(), name: name.trim(), description: description.trim() };
    const problems: typeof errors = {};
    if (!next.code) problems.code = "Nhập mã Project.";
    else if (projectCodeTaken(projects, next.code, project?.id ?? null))
      problems.code = codeConflict;
    if (!next.name) problems.name = "Nhập tên Project.";
    if (choosesOwner && ownerIds.length === 0)
      problems.owner = project ? ownerMissingError : ownerRequiredError;
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const callbacks = {
      onSuccess: () => {
        toast.success(project ? `Đã cập nhật Project ${next.code}` : `Đã tạo Project ${next.code}`);
        onClose();
      },
      onError: (failure: unknown) =>
        setFormError(productionErrorMessage(failure, { conflict: codeConflict }))
    };
    if (project) {
      mutations.update.mutate(
        {
          id: project.id,
          input: {
            ...(next.code !== project.code ? { code: next.code } : {}),
            ...(next.name !== project.name ? { name: next.name } : {}),
            ...((next.description || null) !== project.description
              ? { description: next.description || null }
              : {}),
            ...(choosesOwner && !sameIds(ownerIds, currentOwnerIds) ? { ownerIds } : {})
          }
        },
        callbacks
      );
    } else {
      mutations.create.mutate(
        {
          code: next.code,
          name: next.name,
          description: next.description || null,
          ...(choosesOwner ? { ownerIds: mode === "many" ? ownerIds : ownerIds.slice(0, 1) } : {})
        },
        callbacks
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !pending && onClose()}>
      <DialogContent className={cn("sm:max-w-lg", sheetOnPhone)}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="[overflow-wrap:anywhere]">
              {project ? `Sửa Project ${project.code}` : "Tạo Project"}
            </DialogTitle>
            <DialogDescription>
              Project › Job Code › Task › Subtask. Mã Project hiện trên job và dùng trong Bảng đơn
              giá (cột project_code).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Field data-invalid={Boolean(errors.code)}>
              <FieldLabel htmlFor={`${ids}-code`}>Mã</FieldLabel>
              <Input
                id={`${ids}-code`}
                autoFocus
                value={code}
                maxLength={40}
                placeholder="VD: AXP"
                className="font-mono"
                aria-invalid={Boolean(errors.code)}
                onChange={(event) => {
                  setCode(event.target.value);
                  setFormError(null);
                }}
              />
              {errors.code ? <FieldError>{errors.code}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor={`${ids}-name`}>Tên Project</FieldLabel>
              <Input
                id={`${ids}-name`}
                value={name}
                maxLength={160}
                aria-invalid={Boolean(errors.name)}
                onChange={(event) => setName(event.target.value)}
              />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.owner)}>
            <FieldLabel htmlFor={`${ids}-owner`}>Người phụ trách</FieldLabel>
            {choosesOwner ? (
              <>
                {mode === "many" ? (
                  <OwnersMultiSelect
                    id={`${ids}-owner`}
                    candidates={ownerChoices}
                    value={ownerIds}
                    onChange={(next) => {
                      setOwnerIds(next);
                      if (next.length > 0) clearOwnerError();
                    }}
                    invalid={Boolean(errors.owner)}
                    disabled={!people.canList}
                  />
                ) : (
                  <PersonSelect
                    id={`${ids}-owner`}
                    people={ownerChoices}
                    value={ownerIds[0] ?? null}
                    onChange={(next) => {
                      setOwnerIds(next ? [next] : []);
                      if (next) clearOwnerError();
                    }}
                    placeholder={people.isPending ? "Đang tải…" : "Chọn Leader hoặc Quản trị"}
                    invalid={Boolean(errors.owner)}
                    disabled={!people.canList}
                  />
                )}
                {errors.owner ? (
                  <FieldError>{errors.owner}</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    {mode === "many"
                      ? "Một hoặc nhiều Leader / Quản trị (chỉ Siêu quản trị đặt được nhiều người); người đầu tiên là người phụ trách chính, được điền sẵn làm Leader khi tạo job."
                      : !project && !access.roles.includes("ADMIN")
                        ? "Chọn một Leader hoặc Quản trị — sau khi tạo, chỉ Quản trị đổi được."
                        : "Leader hoặc Quản trị — quản lý mọi Job Code, task của Project (tab “Tôi quản lý”)."}
                  </FieldDescription>
                )}
              </>
            ) : (
              <OwnersDisplay
                owners={project ? project.owners : [meAsOwner]}
                note={
                  !project
                    ? "Project do bạn tạo luôn do bạn phụ trách."
                    : project.owners.length > 1 && access.roles.includes("ADMIN")
                      ? "Project có nhiều người phụ trách — chỉ Siêu quản trị đổi được danh sách này."
                      : "Chỉ Quản trị đổi được người phụ trách."
                }
              />
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-description`}>
              Mô tả <span className="font-normal text-foreground-subtle">(tùy chọn)</span>
            </FieldLabel>
            <Textarea
              id={`${ids}-description`}
              value={description}
              maxLength={2000}
              rows={3}
              placeholder="Khách hàng, yêu cầu chung, ghi chú cho đội…"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <FormAlert>{formError}</FormAlert>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {project ? "Lưu thay đổi" : "Tạo Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
