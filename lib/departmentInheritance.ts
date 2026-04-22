type DeptInfo = { deptId: string; deptName: string; [key: string]: unknown };

interface EmpLink {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

const MAX_DEPTH = 20;

/**
 * Mutates `deptMap` in-place: for every employee in `empIds` that has no
 * entry (or an empty `deptName`), walks up the FlowLayout org-chart links
 * until it finds a manager who *does* have a department, then copies that
 * department info into the map.
 */
export function inheritDepartments(
  empIds: string[],
  deptMap: Map<string, DeptInfo>,
  links: EmpLink[],
): void {
  const managerOf = new Map<string, string>();

  for (const link of links) {
    if (!link.source.startsWith("emp-") || !link.target.startsWith("emp-")) continue;

    if (link.sourceHandle === "bottom" && link.targetHandle === "top") {
      managerOf.set(link.target.slice(4), link.source.slice(4));
    } else if (link.sourceHandle === "top" && link.targetHandle === "bottom") {
      managerOf.set(link.source.slice(4), link.target.slice(4));
    }
  }

  for (const empId of empIds) {
    const existing = deptMap.get(empId);
    if (existing && existing.deptName) continue;

    let current = empId;
    const visited = new Set<string>();
    let depth = 0;

    while (depth < MAX_DEPTH) {
      const mgr = managerOf.get(current);
      if (!mgr || visited.has(mgr)) break;
      visited.add(mgr);

      const mgrDept = deptMap.get(mgr);
      if (mgrDept && mgrDept.deptName) {
        deptMap.set(empId, { ...mgrDept });
        break;
      }

      current = mgr;
      depth++;
    }
  }
}
