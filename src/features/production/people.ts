import { useMemo } from "react";

import type { ProductionMember, ProductionRole } from "@/contracts/production-catalog";
import type { UserRef } from "@/contracts/work";

import { useProductionAccess, useProductionMembers } from "./hooks";

export type Person = Pick<UserRef, "id" | "displayName" | "avatarUrl"> & { email?: string | null };

const toPerson = (member: ProductionMember): Person => ({
  id: member.userId,
  displayName: member.displayName,
  avatarUrl: member.avatarUrl,
  email: member.email
});

/**
 * Production people for pickers, mentions and log sentences. Leaders, Accounts, QC and Admins can
 * list members (with roles); everyone else falls back to the people already visible on the job or
 * task (`known`), so names still resolve and mentions stay possible.
 */
export const useProductionPeople = (known: readonly (Person | null | undefined)[] = []) => {
  const access = useProductionAccess();
  const canList = access.can("LEADER", "ACCOUNT", "QC");
  const members = useProductionMembers(canList);
  const knownKey = known.map((person) => person?.id ?? "").join(",");

  return useMemo(() => {
    const active = (members.data?.items ?? []).filter((member) => member.active && member.roles.length > 0);
    const people = new Map<string, Person>();
    for (const member of active) people.set(member.userId, toPerson(member));
    for (const person of known) if (person && !people.has(person.id)) people.set(person.id, person);
    const roles = new Map<string, readonly ProductionRole[]>(active.map((member) => [member.userId, member.roles]));
    const withRole = (...wanted: ProductionRole[]) =>
      active.filter((member) => wanted.some((role) => member.roles.includes(role))).map(toPerson);
    return {
      canList,
      isPending: canList && members.isPending,
      people: [...people.values()],
      roles,
      withRole,
      nameOf: (id: string) => people.get(id)?.displayName,
      byId: (id: string | null | undefined) => (id ? (people.get(id) ?? null) : null)
    };
    // `known` is keyed by its ids so a new array with the same people does not recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.data, members.isPending, canList, knownKey]);
};
