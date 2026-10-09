import { useSearchParams } from "react-router";

import { PageHeader } from "@/components/shared/page-header";
import { Switch } from "@/components/ui/switch";
import { MyTasksList } from "@/features/tasks/components/my-tasks-list";

/** /my-tasks — everything assigned to me across projects, grouped by deadline. */
export const MyTasksRoute = () => {
  const [params, setParams] = useSearchParams();
  const includeDone = params.get("done") === "1";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Việc của tôi"
        description="Công việc được giao cho bạn ở mọi dự án, gom theo hạn chót."
        actions={
          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-foreground-muted hover:bg-surface-hover">
            <Switch
              size="sm"
              checked={includeDone}
              onCheckedChange={(checked) =>
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    if (checked) next.set("done", "1");
                    else next.delete("done");
                    return next;
                  },
                  { replace: true }
                )
              }
            />
            Hiện việc đã xong
          </label>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
          <MyTasksList key={String(includeDone)} includeDone={includeDone} />
        </div>
      </div>
    </div>
  );
};
