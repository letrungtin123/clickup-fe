import { Check, UserRound, UserRoundX } from "lucide-react";
import { useEffect, useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { KnowledgeSpace } from "@/contracts/knowledge";
import type { UserRef } from "@/contracts/work";
import { useSessionContext } from "@/features/auth/hooks";

import { useKnowledgeMentionSource } from "../use-mention-source";

/**
 * "Người phụ trách" picker: people who can read the space (members of a private space, anyone for a
 * public one). The owner answers for the content and is reminded at review time.
 */
export const OwnerPicker = ({
  space,
  value,
  onChange,
  id,
  disabled
}: {
  space: Pick<KnowledgeSpace, "id" | "visibility">;
  value: UserRef | null;
  onChange: (user: UserRef | null) => void;
  id?: string;
  disabled?: boolean;
}) => {
  const session = useSessionContext();
  const search = useKnowledgeMentionSource(space);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      search(term, controller.signal)
        .then((users) => {
          if (!controller.signal.aborted) setResults(users);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, search, term]);

  const me: UserRef = {
    id: session.user.id,
    displayName: session.user.displayName,
    email: session.user.email,
    avatarUrl: null
  };
  const people = [me, ...results.filter((user) => user.id !== me.id)];

  const pick = (user: UserRef | null) => {
    onChange(user);
    setOpen(false);
    setTerm("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-start font-normal" />}
      >
        {value ? <UserAvatar user={value} size="xs" /> : <UserRound className="text-foreground-subtle" />}
        <span className={value ? "truncate" : "truncate text-foreground-subtle"}>{value?.displayName ?? "Chọn người phụ trách"}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput value={term} onValueChange={setTerm} placeholder="Tìm theo tên hoặc email…" />
          <CommandList>
            <CommandEmpty>
              {loading ? (
                <span className="inline-flex items-center gap-2 text-foreground-muted">
                  <Spinner className="size-3.5" /> Đang tìm…
                </span>
              ) : (
                "Không tìm thấy ai."
              )}
            </CommandEmpty>
            <CommandGroup>
              {people.map((user) => (
                <CommandItem key={user.id} value={user.id} onSelect={() => pick(user)}>
                  <UserAvatar user={user} size="xs" />
                  <span className="min-w-0 flex-1 truncate">
                    {user.displayName}
                    {user.id === me.id ? <span className="text-foreground-muted"> (bạn)</span> : null}
                  </span>
                  {value?.id === user.id ? <Check className="size-3.5 text-brand-text" aria-hidden="true" /> : null}
                </CommandItem>
              ))}
              {value ? (
                <CommandItem value="none" onSelect={() => pick(null)}>
                  <UserRoundX className="text-foreground-subtle" />
                  Bỏ người phụ trách
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
