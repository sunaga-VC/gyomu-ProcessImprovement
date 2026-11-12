const UNSET_LABEL = "未設定";

function sortLabels(a: string, b: string) {
  if (a === UNSET_LABEL) return 1;
  if (b === UNSET_LABEL) return -1;
  return a.localeCompare(b, "ja");
}

export function groupByDepartment<T extends { departmentName?: string | null }>(
  items: T[],
): { departmentName: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.departmentName || UNSET_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => sortLabels(a, b))
    .map(([departmentName, items]) => ({ departmentName, items }));
}

export function groupByDivisionAndDepartment<T extends { departmentName?: string | null; divisionName?: string | null }>(
  items: T[],
): { divisionName: string; departments: { departmentName: string; items: T[] }[] }[] {
  const divisionGroups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.divisionName || UNSET_LABEL;
    if (!divisionGroups.has(key)) divisionGroups.set(key, []);
    divisionGroups.get(key)!.push(item);
  }
  return Array.from(divisionGroups.entries())
    .sort(([a], [b]) => sortLabels(a, b))
    .map(([divisionName, divisionItems]) => ({
      divisionName,
      departments: groupByDepartment(divisionItems),
    }));
}

// ─── Multi-department / multi-division grouping (processes, issues) ──────────
//
// Unlike hearings/improvements, processes and issues can belong to several
// departments and several divisions at once (both are independent, non-hierarchical
// classification axes — see the "部署別/部門別/部署×部門" views). An item that is
// missing a department or a division entirely is deliberately excluded from these
// groupings; it is surfaced only via getUnsetCounts() and the warning banner, not
// as a normal "未設定" group, so genuine gaps in the data don't get lost inside a
// huge catch-all bucket.

export type GroupableRef = { id: number; name: string };
export type Groupable = {
  departments?: GroupableRef[] | null;
  divisions?: GroupableRef[] | null;
};

/** Fans each item out into every department it belongs to. Items with no department are excluded. */
export function groupByDepartments<T extends Groupable>(
  items: T[],
): { departmentId: number; departmentName: string; items: T[] }[] {
  const buckets = new Map<number, { departmentName: string; items: T[] }>();
  for (const item of items) {
    for (const dept of item.departments ?? []) {
      if (!buckets.has(dept.id)) buckets.set(dept.id, { departmentName: dept.name, items: [] });
      buckets.get(dept.id)!.items.push(item);
    }
  }
  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => a.departmentName.localeCompare(b.departmentName, "ja"))
    .map(([departmentId, g]) => ({ departmentId, departmentName: g.departmentName, items: g.items }));
}

/**
 * Divison -> department -> items. Only items that have at least one department AND
 * at least one division participate (see the module doc comment above).
 */
export function groupByDivisionThenDepartment<T extends Groupable>(
  items: T[],
): { divisionId: number; divisionName: string; departments: { departmentId: number; departmentName: string; items: T[] }[] }[] {
  const divisionBuckets = new Map<number, { divisionName: string; departments: Map<number, { departmentName: string; items: T[] }> }>();
  for (const item of items) {
    const departments = item.departments ?? [];
    const divisions = item.divisions ?? [];
    if (departments.length === 0 || divisions.length === 0) continue;
    for (const division of divisions) {
      if (!divisionBuckets.has(division.id)) divisionBuckets.set(division.id, { divisionName: division.name, departments: new Map() });
      const divBucket = divisionBuckets.get(division.id)!;
      for (const dept of departments) {
        if (!divBucket.departments.has(dept.id)) divBucket.departments.set(dept.id, { departmentName: dept.name, items: [] });
        divBucket.departments.get(dept.id)!.items.push(item);
      }
    }
  }
  return Array.from(divisionBuckets.entries())
    .sort(([, a], [, b]) => a.divisionName.localeCompare(b.divisionName, "ja"))
    .map(([divisionId, div]) => ({
      divisionId,
      divisionName: div.divisionName,
      departments: Array.from(div.departments.entries())
        .sort(([, a], [, b]) => a.departmentName.localeCompare(b.departmentName, "ja"))
        .map(([departmentId, d]) => ({ departmentId, departmentName: d.departmentName, items: d.items })),
    }));
}

/** 部署×部門 matrix. Same both-required rule as groupByDivisionThenDepartment. */
export function buildDepartmentDivisionMatrix<T extends Groupable>(items: T[]) {
  const departmentNames = new Map<number, string>();
  const divisionNames = new Map<number, string>();
  const cellItems = new Map<string, T[]>();

  for (const item of items) {
    const departments = item.departments ?? [];
    const divisions = item.divisions ?? [];
    if (departments.length === 0 || divisions.length === 0) continue;
    for (const dept of departments) {
      departmentNames.set(dept.id, dept.name);
      for (const division of divisions) {
        divisionNames.set(division.id, division.name);
        const key = `${dept.id}:${division.id}`;
        if (!cellItems.has(key)) cellItems.set(key, []);
        cellItems.get(key)!.push(item);
      }
    }
  }

  const departments = Array.from(departmentNames.entries())
    .sort(([, a], [, b]) => a.localeCompare(b, "ja"))
    .map(([departmentId, departmentName]) => ({ departmentId, departmentName }));
  const divisions = Array.from(divisionNames.entries())
    .sort(([, a], [, b]) => a.localeCompare(b, "ja"))
    .map(([divisionId, divisionName]) => ({ divisionId, divisionName }));

  return {
    departments,
    divisions,
    getItems: (departmentId: number, divisionId: number): T[] => cellItems.get(`${departmentId}:${divisionId}`) ?? [],
  };
}

/** Independent counts: an item can count toward both if it is missing both. */
export function getUnsetCounts<T extends Groupable>(items: T[]): { missingDepartment: number; missingDivision: number } {
  let missingDepartment = 0;
  let missingDivision = 0;
  for (const item of items) {
    if (!item.departments || item.departments.length === 0) missingDepartment++;
    if (!item.divisions || item.divisions.length === 0) missingDivision++;
  }
  return { missingDepartment, missingDivision };
}

// ─── Local (section-scoped) parent/child hierarchy ────────────────────────────

export type Hierarchical = {
  id: number;
  parentId?: number | null;
  sortOrder?: number;
};

export type LocalTreeNode<T> = T & { children: LocalTreeNode<T>[] };

function byOrder<T extends Hierarchical>(a: T, b: T): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id;
}

/**
 * Builds a parent/child tree restricted to `items` (e.g. everything in one
 * department's section). If a node's true parent isn't part of `items` — it
 * belongs to a different section, or there is no parent — the node becomes a
 * local root instead of being dropped or attached elsewhere. This keeps each
 * section internally consistent without duplicating a process across sections.
 */
export function buildLocalHierarchy<T extends Hierarchical>(items: T[]): LocalTreeNode<T>[] {
  const idSet = new Set(items.map((i) => i.id));
  const childrenByParent = new Map<number, T[]>();
  const roots: T[] = [];
  for (const item of items) {
    if (item.parentId && idSet.has(item.parentId)) {
      const list = childrenByParent.get(item.parentId) ?? [];
      list.push(item);
      childrenByParent.set(item.parentId, list);
    } else {
      roots.push(item);
    }
  }
  function attach(node: T): LocalTreeNode<T> {
    const children = (childrenByParent.get(node.id) ?? []).sort(byOrder).map(attach);
    return { ...node, children };
  }
  return roots.sort(byOrder).map(attach);
}

/** Returns processId plus every descendant id, for excluding invalid "move under" targets (would create a cycle). */
export function getDescendantIds<T extends Hierarchical>(processId: number, allItems: T[]): Set<number> {
  return expandWithDescendants(new Set([processId]), allItems);
}

/**
 * Expands `seedIds` to include every descendant found in `allItems` (following parentId
 * links), even when the descendant itself doesn't carry the same tag as its ancestor — so e.g.
 * a business without its own 管理業務 assignment still nests under a tagged parent instead of
 * disappearing from that management task's section.
 */
export function expandWithDescendants<T extends Hierarchical>(seedIds: Set<number>, allItems: T[]): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  for (const item of allItems) {
    if (item.parentId) {
      const list = childrenByParent.get(item.parentId) ?? [];
      list.push(item.id);
      childrenByParent.set(item.parentId, list);
    }
  }
  const result = new Set(seedIds);
  const stack = Array.from(seedIds);
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}
