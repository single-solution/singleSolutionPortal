"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type Connection,
  Position,
  Handle,
  type NodeProps,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { PERMISSION_CATEGORIES, PERMISSION_KEYS, PERMISSION_META, type IPermissions } from "@/lib/permissions.shared";

/* ────────── Permission sets per node type ────────── */

const DEPT_PERM_KEYS: Set<keyof IPermissions> = new Set([
  "departments_view", "departments_create", "departments_edit", "departments_delete",
]);
const EMP_PERM_KEYS: Set<keyof IPermissions> = new Set([
  "employees_view", "employees_viewDetail", "employees_create", "employees_edit",
  "employees_delete", "employees_toggleStatus", "employees_resendInvite",
]);

function permSetForNodeType(nodeType: string): Set<keyof IPermissions> {
  if (nodeType === "dept") return DEPT_PERM_KEYS;
  if (nodeType === "emp") return EMP_PERM_KEYS;
  return DEPT_PERM_KEYS;
}

function permSetLabel(nodeType: string): string {
  if (nodeType === "dept") return "Departments";
  if (nodeType === "emp") return "Employees";
  return "Departments";
}

/* ────────── Types ────────── */

interface DesigOption { _id: string; name: string; color: string }

interface MembershipRow {
  _id: string;
  user: { _id: string; about: { firstName: string; lastName: string }; email: string };
  department: { _id: string; title: string };
  designation: { _id: string; name: string; color: string } | null;
  permissions?: Record<string, boolean>;
}

interface Employee {
  _id: string; email: string; username: string;
  about: { firstName: string; lastName: string; profileImage?: string };
  isActive: boolean;
}
interface Department { _id: string; title: string; employeeCount: number }

function idStr(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object" && x !== null && "_id" in x) return idStr((x as { _id: unknown })._id);
  return String(x);
}

/* ────────── Custom Nodes ────────── */

function DeptNode({ data }: NodeProps) {
  return (
    <div className="rounded-2xl border-2 px-5 py-3 shadow-lg min-w-[180px]" style={{ background: "var(--bg-elevated)", borderColor: "#8b5cf6" }}>
      <Handle type="source" position={Position.Top} id="top" className="!bg-[#8b5cf6] !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "#8b5cf6", color: "white" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold truncate max-w-[140px]" style={{ color: "var(--fg)" }}>{String(data.label ?? "")}</p>
          {data.sub ? <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>{String(data.sub)}</p> : null}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-[#8b5cf6] !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

function EmpNode({ data }: NodeProps) {
  const initials = String(data.initials ?? "");
  const isActive = data.active !== false;
  return (
    <div className={`rounded-xl border px-3 py-2 shadow-sm min-w-[140px] ${isActive ? "" : "opacity-50 grayscale"}`} style={{ background: "var(--bg-elevated)", borderColor: "var(--border-strong)" }}>
      <Handle type="source" position={Position.Top} id="top" className="!bg-[var(--teal)] !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: isActive ? "var(--teal)" : "var(--fg-tertiary)" }}>{initials}</span>
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold truncate max-w-[100px]" style={{ color: "var(--fg)" }}>{String(data.label ?? "")}</p>
          <p className="text-[9px] truncate max-w-[100px]" style={{ color: "var(--fg-tertiary)" }}>{String(data.email ?? "")}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-[var(--teal)] !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

/* ────────── Custom Edge ────────── */

interface DesigEdgeData {
  designation?: DesigOption | null; membershipId?: string; designations?: DesigOption[];
  onChangeDesignation?: (mId: string, dId: string) => void;
  onOpenPrivileges?: (mId: string) => void;
  onDeleteMembership?: (mId: string) => void;
  hidePill?: boolean;
  readOnly?: boolean;
}

function DesignationEdge(props: EdgeProps & { data?: DesigEdgeData }) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const desig = data?.designation;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (data?.hidePill) return <BaseEdge path={edgePath} style={style} />;

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      <EdgeLabelRenderer>
        <div ref={ref} style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all", zIndex: open ? 100 : 1 }} className="nodrag nopan">
          <button type="button" onClick={() => { if (!data?.readOnly) setOpen(!open); }}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold shadow-sm transition-all hover:shadow-md"
            style={{ background: desig?.color ?? "var(--bg-grouped)", color: desig ? "white" : "var(--fg-tertiary)", borderColor: desig?.color ?? "var(--border)", cursor: data?.readOnly ? "default" : "pointer" }}>
            {desig?.name ?? "Assign"}
            {!data?.readOnly && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>}
          </button>
          <AnimatePresence>
            {open && data?.membershipId && (
              <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.12 }}
                className="absolute left-1/2 top-full mt-1 -translate-x-1/2 z-50 rounded-xl border shadow-xl overflow-hidden min-w-[160px]"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                <div className="p-1 max-h-36 overflow-y-auto border-b" style={{ borderColor: "var(--border)" }}>
                  <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Designation</p>
                  {(data.designations ?? []).map((d) => (
                    <button key={d._id} type="button"
                      onClick={() => { data.onChangeDesignation?.(data.membershipId!, d._id); setOpen(false); }}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors hover:bg-[var(--bg-grouped)]"
                      style={{ color: desig?._id === d._id ? d.color : "var(--fg-secondary)" }}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                      {d.name}
                      {desig?._id === d._id && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="ml-auto"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  ))}
                </div>
                <div className="p-1">
                  <button type="button" onClick={() => { data.onOpenPrivileges?.(data.membershipId!); setOpen(false); }}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--primary)" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Edit Privileges
                  </button>
                  <button type="button" onClick={() => { setOpen(false); data.onDeleteMembership?.(data.membershipId!); }}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--rose)" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    Remove
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/* ────────── Main ────────── */

const nodeTypes = { dept: DeptNode, emp: EmpNode };
const edgeTypes = { designation: DesignationEdge };

interface Props {
  departments: Department[]; employees: Employee[];
  designations: DesigOption[]; isSuperAdmin: boolean;
}

export function OrgFlowTree({ departments, employees, designations, isSuperAdmin }: Props) {
  interface EmpLink { source: string; target: string; sourceHandle: string; targetHandle: string; permissions?: Record<string, boolean>; designationId?: string }

  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [empLinks, setEmpLinks] = useState<EmpLink[]>([]);
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Connection modal ── */
  const [connOpen, setConnOpen] = useState(false);
  const [connSource, setConnSource] = useState("");
  const [connTarget, setConnTarget] = useState("");
  const [connSourceLabel, setConnSourceLabel] = useState("");
  const [connTargetLabel, setConnTargetLabel] = useState("");
  const [connDesig, setConnDesig] = useState("");
  const [connSaving, setConnSaving] = useState(false);
  const [connFullAccess, setConnFullAccess] = useState(true);
  const [connTargetNodeType, setConnTargetNodeType] = useState("dept");

  /* ── Privileges modal (shared for memberships & emp links) ── */
  const [privOpen, setPrivOpen] = useState(false);
  const [privMembershipId, setPrivMembershipId] = useState("");
  const [privLinkIdx, setPrivLinkIdx] = useState(-1); // ≥0 when editing an emp-link
  const [privPerms, setPrivPerms] = useState<Record<string, boolean>>({});
  const [privSaving, setPrivSaving] = useState(false);
  const [privLabel, setPrivLabel] = useState("");

  /* ── Remove modal (shared for memberships & emp links) ── */
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeMembershipId, setRemoveMembershipId] = useState("");
  const [removeLinkIdx, setRemoveLinkIdx] = useState(-1);
  const [removeLabel, setRemoveLabel] = useState("");
  const [removeDeleting, setRemoveDeleting] = useState(false);

  /* ── Restriction modal ── */
  const [restrictOpen, setRestrictOpen] = useState(false);
  const [restrictMsg, setRestrictMsg] = useState("");

  const refetchMemberships = useCallback(async () => {
    const res = await fetch("/api/memberships");
    if (res.ok) setMemberships(await res.json());
  }, []);

  const syncHierarchy = useCallback(() => {
    return fetch("/api/hierarchy-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canvasId: "org" }) });
  }, []);

  const saveEmpLinks = useCallback(async (newLinks: EmpLink[]) => {
    setEmpLinks(newLinks);
    await fetch("/api/flow-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canvasId: "org", links: newLinks }) });
    await syncHierarchy();
    refetchMemberships();
  }, [syncHierarchy, refetchMemberships]);

  useEffect(() => {
    Promise.all([
      fetch("/api/memberships").then((r) => r.ok ? r.json() : []),
      fetch("/api/flow-layout?canvasId=org").then((r) => r.ok ? r.json() : { positions: {}, links: [] }),
    ]).then(([mems, layout]) => {
      setMemberships(Array.isArray(mems) ? mems : []);
      const l = layout && typeof layout === "object" ? layout : { positions: {}, links: [] };
      setSavedPositions(l.positions ?? {});
      setEmpLinks(Array.isArray(l.links) ? l.links : []);
      setLoaded(true);
    });
  }, []);

  function getNodeLabel(nodeId: string): string {
    if (nodeId.startsWith("dept-")) { const d = departments.find((x) => x._id === nodeId.slice(5)); return d?.title ?? nodeId; }
    if (nodeId.startsWith("emp-")) { const e = employees.find((x) => x._id === nodeId.slice(4)); return e ? `${e.about.firstName} ${e.about.lastName}` : nodeId; }
    return nodeId;
  }

  /**
   * Cycle detection: would adding an edge from upperNode→lowerNode create a cycle?
   * "upper" = the node whose bottom handle is used, "lower" = the node whose top handle is used.
   */
  const wouldCycle = useCallback((upperNode: string, lowerNode: string, links: EmpLink[]): boolean => {
    const visited = new Set<string>();
    const queue = [upperNode];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === lowerNode) continue;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const l of links) {
        // Walk upward: who is above `cur`?
        if (l.target === cur && l.sourceHandle === "bottom" && l.targetHandle === "top") {
          if (l.source === lowerNode) return true;
          queue.push(l.source);
        }
        if (l.source === cur && l.sourceHandle === "top" && l.targetHandle === "bottom") {
          if (l.target === lowerNode) return true;
          queue.push(l.target);
        }
      }
    }
    return false;
  }, []);

  /* ── Connection handler ── */
  const onConnect = useCallback((connection: Connection) => {
    if (!isSuperAdmin) return;
    if (!connection.source || !connection.target) return;
    const srcType = connection.source.split("-")[0];
    const tgtType = connection.target.split("-")[0];
    const srcIsEmp = srcType === "emp";
    const tgtIsEmp = tgtType === "emp";

    if (!srcIsEmp && !tgtIsEmp) {
      setRestrictMsg(`Cannot connect ${getNodeLabel(connection.source)} to ${getNodeLabel(connection.target)}. Only employees can form connections.`);
      setRestrictOpen(true);
      return;
    }

    const srcHandle = connection.sourceHandle ?? "";
    const tgtHandle = connection.targetHandle ?? "";

    if (srcIsEmp && tgtIsEmp) {
      const linkId = `${connection.source}-${srcHandle}-${connection.target}-${tgtHandle}`;
      const exists = empLinks.some((l) => `${l.source}-${l.sourceHandle}-${l.target}-${l.targetHandle}` === linkId);
      if (exists) return;

      // Determine upper/lower based on handles
      const upperNode = srcHandle === "bottom" ? connection.source : connection.target;
      const lowerNode = srcHandle === "bottom" ? connection.target : connection.source;

      if (upperNode === lowerNode) return;
      if (wouldCycle(upperNode, lowerNode, empLinks)) {
        setRestrictMsg(`Cannot connect ${getNodeLabel(connection.source)} to ${getNodeLabel(connection.target)}. This would create a circular hierarchy.`);
        setRestrictOpen(true);
        return;
      }

      const defaultPerms: Record<string, boolean> = {};
      for (const k of PERMISSION_KEYS) defaultPerms[k] = k === "employees_view" || k === "employees_viewDetail";
      saveEmpLinks([...empLinks, { source: connection.source, target: connection.target, sourceHandle: srcHandle, targetHandle: tgtHandle, permissions: defaultPerms, designationId: designations[0]?._id ?? undefined }]);
      return;
    }

    setConnSource(connection.source);
    setConnTarget(connection.target);
    setConnSourceLabel(getNodeLabel(connection.source));
    setConnTargetLabel(getNodeLabel(connection.target));
    setConnDesig(designations[0]?._id ?? "");

    if (srcIsEmp && tgtType === "dept") {
      setConnFullAccess(srcHandle === "bottom" && tgtHandle === "top");
      setConnTargetNodeType("dept");
    } else if (srcType === "dept" && tgtIsEmp) {
      setConnFullAccess(!(srcHandle === "bottom" && tgtHandle === "top"));
      setConnTargetNodeType("dept");
    } else {
      setConnFullAccess(true);
      setConnTargetNodeType("dept");
    }

    setConnOpen(true);
  }, [isSuperAdmin, departments, employees, designations, empLinks, saveEmpLinks, wouldCycle]);

  const handleCreateConnection = useCallback(async () => {
    if (!connDesig) return;
    setConnSaving(true);
    try {
      const srcType = connSource.split("-")[0];
      const srcId = connSource.slice(srcType.length + 1);
      const tgtType = connTarget.split("-")[0];
      const tgtId = connTarget.slice(tgtType.length + 1);

      const body: Record<string, unknown> = { designation: connDesig };

      if (tgtType === "emp" && srcType === "dept") {
        body.user = tgtId;
        body.department = srcId;
      } else if (srcType === "emp" && tgtType === "dept") {
        body.user = srcId;
        body.department = tgtId;
      } else {
        setConnOpen(false); setConnSaving(false);
        return;
      }

      if (body.user && body.department) {
        const perms: Record<string, boolean> = {};
        if (connFullAccess) {
          const enableSet = permSetForNodeType(connTargetNodeType);
          for (const k of PERMISSION_KEYS) perms[k] = enableSet.has(k);
        } else {
          for (const k of PERMISSION_KEYS) perms[k] = false;
        }
        body.permissions = perms;
        await fetch("/api/memberships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        // Backfill: if this employee has superiors via emp-to-emp links,
        // auto-create hierarchy memberships for them in this department.
        await syncHierarchy();
      }
      await refetchMemberships();
      setConnOpen(false);
    } catch { /* ignore */ }
    setConnSaving(false);
  }, [connSource, connTarget, connDesig, connFullAccess, connTargetNodeType, departments, refetchMemberships, syncHierarchy]);

  /* ── Edge actions (membership) ── */
  const handleChangeDesignation = useCallback(async (membershipId: string, designationId: string) => {
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designation: designationId }) });
      if (res.ok) setMemberships((prev) => prev.map((m) => m._id === membershipId ? { ...m, designation: designations.find((d) => d._id === designationId) ?? m.designation } : m));
    } catch { /* ignore */ }
  }, [designations]);

  /* ── Edge actions (emp link) ── */
  const handleChangeLinkDesignation = useCallback((linkIdx: number, designationId: string) => {
    setEmpLinks((prev) => {
      const updated = [...prev];
      updated[linkIdx] = { ...updated[linkIdx], designationId };
      saveEmpLinks(updated);
      return updated;
    });
  }, [saveEmpLinks]);

  const openPrivileges = useCallback(async (membershipId: string) => {
    const mem = memberships.find((m) => m._id === membershipId);
    if (!mem) return;
    setPrivMembershipId(membershipId);
    setPrivLinkIdx(-1);
    const name = mem.user ? `${mem.user.about?.firstName ?? ""} ${mem.user.about?.lastName ?? ""}`.trim() : "";
    setPrivLabel(`${name} → ${mem.department?.title ?? ""}`);
    try {
      const res = await fetch(`/api/memberships/${membershipId}`);
      if (res.ok) { const full = await res.json(); const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = !!full.permissions?.[k]; setPrivPerms(p); }
    } catch { /* ignore */ }
    setPrivOpen(true);
  }, [memberships]);

  const openLinkPrivileges = useCallback((linkIdx: number) => {
    const link = empLinks[linkIdx];
    if (!link) return;
    setPrivMembershipId("");
    setPrivLinkIdx(linkIdx);
    const srcLabel = getNodeLabel(link.source);
    const tgtLabel = getNodeLabel(link.target);
    setPrivLabel(`${srcLabel} → ${tgtLabel}`);
    const p: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) p[k] = !!link.permissions?.[k];
    setPrivPerms(p);
    setPrivOpen(true);
  }, [empLinks, departments, employees]);

  const handleSavePrivileges = useCallback(async () => {
    setPrivSaving(true);
    try {
      if (privLinkIdx >= 0) {
        // Saving emp-to-emp link privileges
        setEmpLinks((prev) => {
          const updated = [...prev];
          updated[privLinkIdx] = { ...updated[privLinkIdx], permissions: { ...privPerms } };
          saveEmpLinks(updated);
          return updated;
        });
        setPrivOpen(false);
      } else if (privMembershipId) {
        await fetch(`/api/memberships/${privMembershipId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: privPerms }) });
        setPrivOpen(false);
      }
    } catch { /* ignore */ }
    setPrivSaving(false);
  }, [privMembershipId, privLinkIdx, privPerms, saveEmpLinks]);

  const handleDeleteMembership = useCallback((membershipId: string) => {
    const mem = memberships.find((m) => m._id === membershipId);
    if (!mem) return;
    const name = mem.user ? `${mem.user.about?.firstName ?? ""} ${mem.user.about?.lastName ?? ""}`.trim() : "";
    setRemoveMembershipId(membershipId);
    setRemoveLinkIdx(-1);
    setRemoveLabel(`${name} → ${mem.department?.title ?? ""}`);
    setRemoveOpen(true);
  }, [memberships]);

  const handleDeleteLink = useCallback((linkIdx: number) => {
    const link = empLinks[linkIdx];
    if (!link) return;
    setRemoveMembershipId("");
    setRemoveLinkIdx(linkIdx);
    setRemoveLabel(`${getNodeLabel(link.source)} → ${getNodeLabel(link.target)}`);
    setRemoveOpen(true);
  }, [empLinks, departments, employees]);

  const confirmDelete = useCallback(async () => {
    setRemoveDeleting(true);
    try {
      if (removeLinkIdx >= 0) {
        const newLinks = empLinks.filter((_, i) => i !== removeLinkIdx);
        await saveEmpLinks(newLinks);
      } else if (removeMembershipId) {
        const res = await fetch(`/api/memberships/${removeMembershipId}`, { method: "DELETE" });
        if (res.ok) {
          await syncHierarchy();
          await refetchMemberships();
        }
      }
    } catch { /* ignore */ }
    setRemoveDeleting(false);
    setRemoveOpen(false);
  }, [removeMembershipId, removeLinkIdx, empLinks, refetchMemberships, syncHierarchy, saveEmpLinks]);

  /* ── Build graph ── */
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const DEPT_X = 340; const EMP_X = 190; const LEVEL = 170;

    departments.forEach((dept, dIdx) => {
      const dId = `dept-${dept._id}`;
      nodes.push({ id: dId, type: "dept", position: savedPositions[dId] ?? { x: dIdx * DEPT_X, y: 0 }, data: { label: dept.title, sub: `${dept.employeeCount} people` } });
    });

    const empSet = new Set<string>();
    employees.forEach((emp, eIdx) => {
      const eId = `emp-${emp._id}`;
      if (empSet.has(eId)) return;
      empSet.add(eId);
      const initials = (emp.about.firstName?.[0] ?? "") + (emp.about.lastName?.[0] ?? "");
      const empMems = memberships.filter((m) => idStr(m.user?._id) === emp._id);
      let yGuess = LEVEL; let xGuess = eIdx * EMP_X;
      if (empMems.length > 0) {
        const first = empMems[0];
        const n = nodes.find((n) => n.id === `dept-${idStr(first?.department)}`);
        if (n) { xGuess = n.position.x; yGuess = n.position.y + LEVEL; }
      }
      nodes.push({ id: eId, type: "emp", position: savedPositions[eId] ?? { x: xGuess, y: yGuess }, data: { label: `${emp.about.firstName} ${emp.about.lastName}`, email: emp.email, initials, active: emp.isActive, empId: emp._id } });
    });

    const edgeData = (m: MembershipRow): Record<string, unknown> => ({ designation: m.designation ?? null, membershipId: m._id, designations, onChangeDesignation: handleChangeDesignation, onOpenPrivileges: openPrivileges, onDeleteMembership: handleDeleteMembership, hidePill: false, readOnly: !isSuperAdmin } as DesigEdgeData as unknown as Record<string, unknown>);

    memberships.forEach((m) => {
      if (!m.user?._id) return;
      const eId = `emp-${idStr(m.user._id)}`;
      const dId = `dept-${idStr(m.department)}`;
      if (!nodes.find((n) => n.id === eId) || !nodes.find((n) => n.id === dId)) return;

      const perms = m.permissions ?? {};
      const relevantOn = [...DEPT_PERM_KEYS].filter((k) => perms[k]).length;
      const isUpward = relevantOn > DEPT_PERM_KEYS.size / 2;

      // source = dept, target = emp
      const srcHandle = isUpward ? "top" : "bottom";
      const tgtHandle = isUpward ? "bottom" : "top";

      edges.push({ id: `mem-${m._id}`, source: dId, target: eId, sourceHandle: srcHandle, targetHandle: tgtHandle, type: "designation", data: edgeData(m), style: { stroke: m.designation?.color ?? "#8b5cf6", strokeWidth: 2 } });
    });

    // Emp ↔ Emp hierarchy links (with pill for designation + privileges)
    empLinks.forEach((link, idx) => {
      if (!nodes.find((n) => n.id === link.source) || !nodes.find((n) => n.id === link.target)) return;
      const linkDesig = link.designationId ? designations.find((d) => d._id === link.designationId) ?? null : null;
      const linkIdx = idx;
      edges.push({
        id: `link-${idx}`,
        source: link.source,
        target: link.target,
        sourceHandle: link.sourceHandle || "bottom",
        targetHandle: link.targetHandle || "top",
        type: "designation",
        data: {
          designation: linkDesig, membershipId: `link-${idx}`, designations,
          onChangeDesignation: (_id: string, dId: string) => handleChangeLinkDesignation(linkIdx, dId),
          onOpenPrivileges: () => openLinkPrivileges(linkIdx),
          onDeleteMembership: () => handleDeleteLink(linkIdx),
          readOnly: !isSuperAdmin,
        } as DesigEdgeData as unknown as Record<string, unknown>,
        style: { stroke: linkDesig?.color ?? "var(--teal)", strokeWidth: 1.5, strokeDasharray: "6 3" },
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [departments, employees, memberships, empLinks, savedPositions, designations, handleChangeDesignation, handleChangeLinkDesignation, openPrivileges, openLinkPrivileges, handleDeleteMembership, handleDeleteLink]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  useEffect(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    if (!isSuperAdmin) { onEdgesChange(changes.filter((c) => c.type !== "remove")); return; }
    const removals = changes.filter((c): c is Extract<typeof c, { type: "remove" }> => c.type === "remove" && "id" in c && (c as { id?: string }).id?.startsWith("link-") === true);
    if (removals.length > 0) {
      const removeIds = new Set(removals.map((c) => (c as unknown as { id: string }).id));
      const newLinks = empLinks.filter((_, idx) => !removeIds.has(`link-${idx}`));
      saveEmpLinks(newLinks);
    }
    onEdgesChange(changes);
  }, [isSuperAdmin, onEdgesChange, empLinks, saveEmpLinks]);

  const savePositions = useCallback((currentNodes: Node[]) => {
    if (!isSuperAdmin) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pos: Record<string, { x: number; y: number }> = {};
      for (const n of currentNodes) pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      setSavedPositions(pos);
      fetch("/api/flow-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canvasId: "org", positions: pos }) });
    }, 800);
  }, [isSuperAdmin]);

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    if (changes.some((c) => c.type === "position" && c.dragging === false)) setNodes((cur) => { savePositions(cur); return cur; });
  }, [onNodesChange, savePositions, setNodes]);

  if (!loaded) return <div className="card-xl shimmer" style={{ height: "calc(70vh - 154px)", minHeight: 340 }} />;

  return (
    <>
      <div className="card-xl overflow-hidden relative" style={{ height: "calc(70vh - 154px)", minHeight: 340 }}>
        <ReactFlow
          nodes={nodes} edges={edgesState}
          onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          connectionMode={"loose" as never}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.1} maxZoom={3}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "designation" }}
          connectionLineStyle={{ stroke: "var(--primary)", strokeWidth: 2, strokeDasharray: "6 3" }}
        >
          <Controls position="top-right" showInteractive={false}
            className="!bg-[var(--bg-elevated)] !border-[var(--border)] !shadow-lg !rounded-xl [&>button]:!bg-[var(--bg-elevated)] [&>button]:!border-[var(--border)] [&>button]:!fill-[var(--fg-secondary)] [&>button:hover]:!bg-[var(--bg-grouped)]" />
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
        </ReactFlow>
        <div className="absolute left-3 bottom-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 shadow-sm" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
          <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#10b981" }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
            Bottom→Top = Full access
          </span>
          <span className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>•</span>
          <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#f43f5e" }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
            Top→Bottom = No access
          </span>
          <span className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>•</span>
          <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--teal)" }}>
            <svg width="16" height="4" viewBox="0 0 16 4"><line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" /></svg>
            Reports to
          </span>
          <span className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>•</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Click pill to edit</span>
        </div>
      </div>

      {/* ── New Connection Modal ── */}
      <AnimatePresence>
        {connOpen && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConnOpen(false)} />
            <motion.div className="relative w-full max-w-md mx-4 rounded-2xl border p-6 shadow-xl"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-1" style={{ color: "var(--fg)" }}>New Connection</h2>
              <p className="text-xs mb-4" style={{ color: "var(--fg-secondary)" }}>
                <span className="font-semibold">{connSourceLabel}</span> → <span className="font-semibold">{connTargetLabel}</span>
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: connFullAccess ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)", border: `1px solid ${connFullAccess ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.25)"}` }}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: connFullAccess ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)" }}>
                    {connFullAccess
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: connFullAccess ? "#10b981" : "#f43f5e" }}>
                      {connFullAccess ? `${permSetLabel(connTargetNodeType)} Access` : "No Access"}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--fg-tertiary)" }}>
                      {connFullAccess
                        ? <>{permSetForNodeType(connTargetNodeType).size} <span className="font-semibold">{permSetLabel(connTargetNodeType).toLowerCase()}</span> privileges enabled</>
                        : "All privileges disabled — edit later via pill"}
                    </p>
                  </div>
                  <button type="button" onClick={() => setConnFullAccess(!connFullAccess)}
                    className="text-[10px] font-semibold rounded-lg px-2.5 py-1 border transition-colors"
                    style={{ color: "var(--fg-secondary)", borderColor: "var(--border)" }}>
                    Switch
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Designation *</label>
                  <select value={connDesig} onChange={(e) => setConnDesig(e.target.value)} className="input w-full">
                    {designations.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <motion.button type="button" onClick={handleCreateConnection} disabled={connSaving || !connDesig} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{connSaving ? "Saving…" : "Create Connection"}</motion.button>
                  <button type="button" onClick={() => setConnOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Privileges Modal ── */}
      <AnimatePresence>
        {privOpen && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPrivOpen(false)} />
            <motion.div className="relative w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col rounded-2xl border shadow-xl"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold" style={{ color: "var(--fg)" }}>Edit Privileges</h2>
                  <p className="text-xs truncate" style={{ color: "var(--fg-secondary)" }}>{privLabel}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = true; setPrivPerms(p); }}
                    className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold border transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "#10b981", borderColor: "rgba(16,185,129,0.3)" }}>
                    All On
                  </button>
                  <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = false; setPrivPerms(p); }}
                    className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold border transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "var(--rose)", borderColor: "rgba(244,63,94,0.3)" }}>
                    All Off
                  </button>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {PERMISSION_CATEGORIES.map((cat) => {
                  const allOn = cat.keys.every((k) => !!privPerms[k]);
                  const someOn = !allOn && cat.keys.some((k) => !!privPerms[k]);
                  return (
                    <div key={cat.label}>
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="h-4 w-4 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--fg-secondary)" }}>{cat.label}</span>
                        <button type="button" onClick={() => { const val = !allOn; setPrivPerms((p) => { const next = { ...p }; for (const k of cat.keys) next[k] = val; return next; }); }}
                          className="ml-auto rounded px-2 py-0.5 text-[9px] font-semibold border transition-colors hover:bg-[var(--hover-bg)]"
                          style={{ color: allOn ? "var(--rose)" : "var(--primary)", borderColor: "var(--border)" }}>
                          {allOn ? "Disable all" : someOn ? "Enable rest" : "Enable all"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                        {cat.keys.map((k) => {
                          const meta = PERMISSION_META[k];
                          return (
                            <label key={k} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors hover:bg-[var(--hover-bg)]">
                              <input type="checkbox" checked={!!privPerms[k]} onChange={(e) => setPrivPerms((p) => ({ ...p, [k]: e.target.checked }))}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                              <div className="min-w-0">
                                <span className="text-[11px] font-medium leading-tight block" style={{ color: privPerms[k] ? "var(--fg)" : "var(--fg-secondary)" }}>{meta.label}</span>
                                <span className="text-[9px] leading-tight block" style={{ color: "var(--fg-tertiary)" }}>{meta.desc}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="flex gap-2 border-t px-6 py-4 shrink-0" style={{ borderColor: "var(--border)" }}>
                <motion.button type="button" onClick={handleSavePrivileges} disabled={privSaving} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{privSaving ? "Saving…" : "Save Privileges"}</motion.button>
                <button type="button" onClick={() => setPrivOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Remove Confirmation Modal ── */}
      <AnimatePresence>
        {removeOpen && (
          <motion.div className="fixed inset-0 z-[80] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !removeDeleting && setRemoveOpen(false)} />
            <motion.div className="relative w-full max-w-sm mx-4 rounded-2xl border p-6 shadow-xl"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Remove Assignment</h2>
                  <p className="text-xs" style={{ color: "var(--fg-secondary)" }}>This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm mb-5 rounded-lg p-3" style={{ color: "var(--fg-secondary)", background: "var(--bg-grouped)" }}>
                Remove <span className="font-semibold" style={{ color: "var(--fg)" }}>{removeLabel}</span>?
              </p>
              <div className="flex gap-2">
                <motion.button type="button" onClick={confirmDelete} disabled={removeDeleting} whileTap={{ scale: 0.98 }}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                  style={{ background: "var(--rose)" }}>
                  {removeDeleting ? "Removing…" : "Remove"}
                </motion.button>
                <button type="button" onClick={() => setRemoveOpen(false)} disabled={removeDeleting}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-colors"
                  style={{ color: "var(--fg-secondary)", borderColor: "var(--border)" }}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Restriction Modal ── */}
      <AnimatePresence>
        {restrictOpen && (
          <motion.div className="fixed inset-0 z-[80] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRestrictOpen(false)} />
            <motion.div className="relative w-full max-w-sm mx-4 rounded-2xl border p-6 shadow-xl"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(245,158,11,0.12)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l-8.01 14A2 2 0 004.09 21h15.82a2 2 0 001.81-3.14l-8.01-14a2 2 0 00-3.42 0z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Not Allowed</h2>
                  <p className="text-xs" style={{ color: "var(--fg-secondary)" }}>Connection restricted</p>
                </div>
              </div>
              <p className="text-sm mb-5 rounded-lg p-3" style={{ color: "var(--fg-secondary)", background: "var(--bg-grouped)" }}>
                {restrictMsg}
              </p>
              <button type="button" onClick={() => setRestrictOpen(false)}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold border transition-colors"
                style={{ color: "var(--fg-secondary)", borderColor: "var(--border)" }}>
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
