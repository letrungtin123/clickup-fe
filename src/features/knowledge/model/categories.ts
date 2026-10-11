import type { KnowledgeCategory } from "@/contracts/knowledge";

/**
 * Categories ("Chuyên mục") of a space: at most 2 levels (PD-031), ordered by rank. Pure helpers for the
 * tree, the "Quy trình › Retouch" path labels and the placement sent when moving / reordering.
 */

export type CategoryNode = KnowledgeCategory & { children: KnowledgeCategory[] };

const byRank = (a: KnowledgeCategory, b: KnowledgeCategory) =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.name.localeCompare(b.name, "vi");

/** Roots with their children (orphans whose parent is missing are shown as roots). */
export const buildCategoryTree = (categories: readonly KnowledgeCategory[]): CategoryNode[] => {
  const ids = new Set(categories.map((category) => category.id));
  const roots = categories
    .filter((category) => category.parentId === null || !ids.has(category.parentId))
    .sort(byRank);
  return roots.map((root) => ({
    ...root,
    children: categories.filter((category) => category.parentId === root.id).sort(byRank)
  }));
};

/** Depth-first order (root, its children, next root…) — the order of the tree on screen. */
export const flattenTree = (tree: readonly CategoryNode[]) =>
  tree.flatMap((node) => [{ category: node, depth: 0 as const }, ...node.children.map((child) => ({ category: child, depth: 1 as const }))]);

export const categoryPath = (
  categories: readonly KnowledgeCategory[],
  categoryId: string | null | undefined
): string | null => {
  if (!categoryId) return null;
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category) return null;
  const parent = category.parentId ? categories.find((entry) => entry.id === category.parentId) : null;
  return parent ? `${parent.name} › ${category.name}` : category.name;
};

/** Items in a root category include the items of its sub-categories. */
export const categoryTotal = (node: CategoryNode) =>
  node.itemCount + node.children.reduce((sum, child) => sum + child.itemCount, 0);

/**
 * Categories a category may move under: none for a category that has children (it would become level
 * 3), otherwise every other root.
 */
export const parentChoices = (categories: readonly KnowledgeCategory[], category: KnowledgeCategory) => {
  const hasChildren = categories.some((entry) => entry.parentId === category.id);
  if (hasChildren) return [];
  return categories
    .filter((entry) => entry.parentId === null && entry.id !== category.id && entry.id !== category.parentId)
    .sort(byRank);
};

/** Siblings of a category (same parent), in rank order. */
export const siblingsOf = (categories: readonly KnowledgeCategory[], category: Pick<KnowledgeCategory, "parentId">) =>
  categories.filter((entry) => entry.parentId === category.parentId).sort(byRank);

/** Id of the category and its children (filtering by a root also shows sub-category items). */
export const categoryWithChildren = (categories: readonly KnowledgeCategory[], categoryId: string) => [
  categoryId,
  ...categories.filter((entry) => entry.parentId === categoryId).map((entry) => entry.id)
];
