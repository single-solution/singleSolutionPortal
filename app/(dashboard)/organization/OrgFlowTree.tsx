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
import { PERMISSION_CATEGORIES, PERMISSION_KEYS, PERMISSION_META } from "@/lib/permissions.shared";


/* ────────── Types ────────── */

interface DesigOption { _id: string; name: string; color: string }

interface MembershipRow {
  _id: string;
  user: { _id: string; about: { firstName: string; lastName: string }; email: string };
  department: { _id: string; title: string };
  designation: { _id: string; name: string; color: string; defaultPermissions?: Record<string, boolean> } | null;
  permissions?: Record<string, boolean>;
  direction?: "above" | "below";
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
  const onEdit = data.onEdit as (() => void) | undefined;
  return (
    <div
      className={`rounded-xl border px-3 py-2 shadow-sm min-w-[140px] transition-shadow ${isActive ? "" : "opacity-50 grayscale"} ${onEdit ? "cursor-pointer hover:shadow-md hover:border-[var(--teal)]" : ""}`}
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border-strong)" }}
      onClick={() => onEdit?.()}
    >
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
  isCustomPermissions?: boolean;
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

  if (data?.hidePill) {
    return (
      <>
        <BaseEdge path={edgePath} style={style} />
        {!data?.readOnly && data?.onDeleteMembership && data?.membershipId && (
          <EdgeLabelRenderer>
            <div style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all", zIndex: 1 }} className="nodrag nopan">
              <button
                type="button"
                onClick={() => data.onDeleteMembership!(data.membershipId!)}
                className="flex h-5 w-5 items-center justify-center rounded-full border opacity-40 transition-all hover:opacity-100 hover:scale-110"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--rose)" }}
                title="Remove connection"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      <EdgeLabelRenderer>
        <div ref={ref} style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all", zIndex: open ? 100 : 1 }} className="nodrag nopan">
          <button type="button" onClick={() => { if (!data?.readOnly) setOpen(!open); }}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm transition-all hover:shadow-md"
            style={{ background: desig?.color ?? "var(--bg-grouped)", color: desig ? "white" : "var(--fg-tertiary)", borderColor: desig?.color ?? "var(--border)", cursor: data?.readOnly ? "default" : "pointer" }}>
            {desig?.name ?? "Assign"}
            {data?.isCustomPermissions && desig && <span className="rounded-sm px-1 py-px text-[8px] font-bold uppercase leading-none" style={{ background: "rgba(255,255,255,0.25)" }}>Custom</span>}
            {!data?.readOnly && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>}
          </button>
          <AnimatePresence>
            {open && data?.membershipId && (
              <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.12 }}
                className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 z-50 rounded-xl border shadow-xl overflow-hidden min-w-[190px]"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                <div className="p-1.5 max-h-44 overflow-y-auto border-b" style={{ borderColor: "var(--border)" }}>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Designation</p>
                  {(data.designations ?? []).map((d) => (
                    <button key={d._id} type="button"
                      onClick={() => { data.onChangeDesignation?.(data.membershipId!, d._id); setOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-[var(--bg-grouped)]"
                      style={{ color: desig?._id === d._id ? d.color : "var(--fg-secondary)" }}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                      {d.name}
                      {desig?._id === d._id && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="ml-auto"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </button>
                  ))}
                </div>
                <div className="p-1.5">
                  <button type="button" onClick={() => { data.onOpenPrivileges?.(data.membershipId!); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--primary)" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Edit Privileges
                  </button>
                  <button type="button" onClick={() => { setOpen(false); data.onDeleteMembership?.(data.membershipId!); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--rose)" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
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
  designations: DesigOption[]; canEditCanvas: boolean;
  /** When set, only these employee IDs can be edited/connected. Undefined = all (SuperAdmin). */
  editableEmployeeIds?: string[];
  onEditEmployee?: (empId: string) => void;
}

export function OrgFlowTree({ departments, employees, designations, canEditCanvas, editableEmployeeIds, onEditEmployee }: Props) {
  interface EmpLink { source: string; target: string; sourceHandle: string; targetHandle: string; permissions?: Record<string, boolean>; designationId?: string }

  const canEditEmp = useCallback((empId: string) => {
    if (canEditCanvas) return true;
    if (!editableEmployeeIds) return true;
    return editableEmployeeIds.includes(empId);
  }, [canEditCanvas, editableEmployeeIds]);

  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [empLinks, setEmpLinks] = useState<EmpLink[]>([]);
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Connection modal ── */
  const [connOpen, setConnOpen] = useState(false);
  const [connEmpId, setConnEmpId] = useState("");
  const [connDeptId, setConnDeptId] = useState("");
  const [connEmpLabel, setConnEmpLabel] = useState("");
  const [connDeptLabel, setConnDeptLabel] = useState("");
  const [connDesig, setConnDesig] = useState("");
  const [connSaving, setConnSaving] = useState(false);
  const [connAbove, setConnAbove] = useState(false);

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
    if (!canEditCanvas) return;
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
      let upperNode: string;
      let lowerNode: string;
      let upperHandle: string;
      let lowerHandle: string;
      if (srcHandle === "bottom") {
        upperNode = connection.source; lowerNode = connection.target;
        upperHandle = "bottom"; lowerHandle = tgtHandle || "top";
      } else {
        upperNode = connection.target; lowerNode = connection.source;
        upperHandle = "bottom"; lowerHandle = "top";
      }

      const lowerEmpId = lowerNode.slice(4);
      if (!canEditEmp(lowerEmpId)) {
        setRestrictMsg("You can only manage employees within your hierarchy.");
        setRestrictOpen(true);
        return;
      }

      const linkId = `${upperNode}-${upperHandle}-${lowerNode}-${lowerHandle}`;
      const exists = empLinks.some((l) => `${l.source}-${l.sourceHandle}-${l.target}-${l.targetHandle}` === linkId);
      if (exists) return;
      if (upperNode === lowerNode) return;
      if (wouldCycle(upperNode, lowerNode, empLinks)) {
        setRestrictMsg(`Cannot create this link — it would form a circular hierarchy.`);
        setRestrictOpen(true);
        return;
      }

      const defaultPerms: Record<string, boolean> = {};
      for (const k of PERMISSION_KEYS) defaultPerms[k] = k === "employees_view" || k === "employees_viewDetail";
      saveEmpLinks([...empLinks, { source: upperNode, target: lowerNode, sourceHandle: upperHandle, targetHandle: lowerHandle, permissions: defaultPerms, designationId: designations[0]?._id ?? undefined }]);
      return;
    }

    // Employee ↔ Department: determine direction from handles, not drag order
    const empNode = srcIsEmp ? connection.source : connection.target;
    const deptNode = srcIsEmp ? connection.target : connection.source;
    const empHandle = srcIsEmp ? srcHandle : tgtHandle;

    const empId = empNode.slice(4);
    if (!canEditEmp(empId)) {
      setRestrictMsg("You can only manage employees within your hierarchy.");
      setRestrictOpen(true);
      return;
    }

    // Employee's bottom handle used → employee is above the department
    const isAbove = empHandle === "bottom";

    if (!isAbove) {
      // Employee below department — no designation needed, create membership directly
      const userId = empNode.replace(/^emp-/, "");
      const deptId = deptNode.replace(/^dept-/, "");
      fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userId, department: deptId, designation: designations[0]?._id, direction: "below" }),
      }).then(() => { syncHierarchy(); refetchMemberships(); });
      return;
    }

    setConnEmpId(empNode);
    setConnDeptId(deptNode);
    setConnEmpLabel(getNodeLabel(empNode));
    setConnDeptLabel(getNodeLabel(deptNode));
    setConnDesig(designations[0]?._id ?? "");
    setConnAbove(true);
    setConnOpen(true);
  }, [canEditCanvas, departments, employees, designations, empLinks, saveEmpLinks, wouldCycle, canEditEmp, syncHierarchy, refetchMemberships]);

  const handleCreateConnection = useCallback(async () => {
    if (!connDesig) return;
    setConnSaving(true);
    try {
      const userId = connEmpId.replace(/^emp-/, "");
      const deptId = connDeptId.replace(/^dept-/, "");

      await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userId, department: deptId, designation: connDesig, direction: connAbove ? "above" : "below" }),
      });
      await syncHierarchy();
      await refetchMemberships();
      setConnOpen(false);
    } catch { /* ignore */ }
    setConnSaving(false);
  }, [connEmpId, connDeptId, connDesig, connAbove, refetchMemberships, syncHierarchy]);

  /* ── Edge actions (membership) ── */
  const handleChangeDesignation = useCallback(async (membershipId: string, designationId: string) => {
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designation: designationId }) });
      if (res.ok) {
        const updated = await res.json();
        setMemberships((prev) => prev.map((m) => m._id === membershipId ? updated : m));
      }
    } catch { /* ignore */ }
  }, []);

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
      const editable = canEditEmp(emp._id);
      nodes.push({ id: eId, type: "emp", position: savedPositions[eId] ?? { x: xGuess, y: yGuess }, data: { label: `${emp.about.firstName} ${emp.about.lastName}`, email: emp.email, initials, active: emp.isActive, empId: emp._id, onEdit: onEditEmployee && editable ? () => onEditEmployee(emp._id) : undefined } });
    });

    const edgeData = (m: MembershipRow): Record<string, unknown> => {
      let isCustom = false;
      if (m.designation?.defaultPermissions && m.permissions) {
        const dp = m.designation.defaultPermissions;
        const mp = m.permissions;
        isCustom = PERMISSION_KEYS.some((k) => Boolean(dp[k]) !== Boolean(mp[k]));
      }
      const empEditable = m.user?._id ? canEditEmp(idStr(m.user._id)) : false;
      const isAboveDirection = m.direction === "above";
      return { designation: isAboveDirection ? (m.designation ?? null) : null, membershipId: m._id, designations, onChangeDesignation: handleChangeDesignation, onOpenPrivileges: openPrivileges, onDeleteMembership: handleDeleteMembership, hidePill: !isAboveDirection, readOnly: !canEditCanvas || !empEditable, isCustomPermissions: isAboveDirection && isCustom } as DesigEdgeData as unknown as Record<string, unknown>;
    };

    memberships.forEach((m) => {
      if (!m.user?._id) return;
      const eId = `emp-${idStr(m.user._id)}`;
      const dId = `dept-${idStr(m.department)}`;
      if (!nodes.find((n) => n.id === eId) || !nodes.find((n) => n.id === dId)) return;

      const isAbove = m.direction === "above";

      const srcHandle = isAbove ? "top" : "bottom";
      const tgtHandle = isAbove ? "bottom" : "top";

      edges.push({ id: `mem-${m._id}`, source: dId, target: eId, sourceHandle: srcHandle, targetHandle: tgtHandle, type: "designation", data: edgeData(m), style: { stroke: isAbove ? (m.designation?.color ?? "#8b5cf6") : "#8b5cf6", strokeWidth: isAbove ? 2 : 1.5, ...(isAbove ? {} : { strokeDasharray: "4 3" }) } });
    });

    // Emp ↔ Emp hierarchy links (with pill for designation + privileges)
    empLinks.forEach((link, idx) => {
      if (!nodes.find((n) => n.id === link.source) || !nodes.find((n) => n.id === link.target)) return;
      const linkDesig = link.designationId ? designations.find((d) => d._id === link.designationId) ?? null : null;
      const linkIdx = idx;
      const lowerEmpId = link.target.startsWith("emp-") ? link.target.slice(4) : link.source.startsWith("emp-") ? link.source.slice(4) : "";
      const linkEditable = lowerEmpId ? canEditEmp(lowerEmpId) : false;
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
          readOnly: !canEditCanvas || !linkEditable,
        } as DesigEdgeData as unknown as Record<string, unknown>,
        style: { stroke: linkDesig?.color ?? "var(--teal)", strokeWidth: 1.5, strokeDasharray: "6 3" },
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [departments, employees, memberships, empLinks, savedPositions, designations, handleChangeDesignation, handleChangeLinkDesignation, openPrivileges, openLinkPrivileges, handleDeleteMembership, handleDeleteLink, onEditEmployee, canEditEmp]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  useEffect(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    if (!canEditCanvas) { onEdgesChange(changes.filter((c) => c.type !== "remove")); return; }
    const removals = changes.filter((c): c is Extract<typeof c, { type: "remove" }> => c.type === "remove" && "id" in c && (c as { id?: string }).id?.startsWith("link-") === true);
    if (removals.length > 0) {
      const removeIds = new Set(removals.map((c) => (c as unknown as { id: string }).id));
      const newLinks = empLinks.filter((_, idx) => !removeIds.has(`link-${idx}`));
      saveEmpLinks(newLinks);
    }
    onEdgesChange(changes);
  }, [canEditCanvas, onEdgesChange, empLinks, saveEmpLinks]);

  const savePositions = useCallback((currentNodes: Node[]) => {
    if (!canEditCanvas) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pos: Record<string, { x: number; y: number }> = {};
      for (const n of currentNodes) pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      setSavedPositions(pos);
      fetch("/api/flow-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canvasId: "org", positions: pos }) });
    }, 800);
  }, [canEditCanvas]);

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    if (changes.some((c) => c.type === "position" && c.dragging === false)) setNodes((cur) => { savePositions(cur); return cur; });
  }, [onNodesChange, savePositions, setNodes]);

  if (!loaded) return <div className="card-xl shimmer h-full" style={{ minHeight: 340 }} />;

  return (
    <>
      <div className="card-xl overflow-hidden relative h-full" style={{ minHeight: 340 }}>
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
              <p className="text-xs mb-3" style={{ color: "var(--fg-secondary)" }}>
                <span className="font-semibold" style={{ color: "var(--teal)" }}>{connEmpLabel}</span>
                {" managing "}
                <span className="font-semibold" style={{ color: "#8b5cf6" }}>{connDeptLabel}</span>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Designation</label>
                  <select value={connDesig} onChange={(e) => setConnDesig(e.target.value)} className="input w-full">
                    {designations.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                  <p className="text-[10px] mt-1" style={{ color: "var(--fg-tertiary)" }}>
                    Privileges from this designation will be applied. You can fine-tune them later via the pill.
                  </p>
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
            <motion.div className="relative w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col rounded-2xl border shadow-xl"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b px-6 py-5 shrink-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold" style={{ color: "var(--fg)" }}>Edit Privileges</h2>
                  <p className="text-sm truncate mt-0.5" style={{ color: "var(--fg-secondary)" }}>{privLabel}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = true; setPrivPerms(p); }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "#10b981", borderColor: "rgba(16,185,129,0.3)" }}>
                    All On
                  </button>
                  <button type="button" onClick={() => { const p: Record<string, boolean> = {}; for (const k of PERMISSION_KEYS) p[k] = false; setPrivPerms(p); }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "var(--rose)", borderColor: "rgba(244,63,94,0.3)" }}>
                    All Off
                  </button>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {PERMISSION_CATEGORIES.map((cat) => {
                  const allOn = cat.keys.every((k) => !!privPerms[k]);
                  const someOn = !allOn && cat.keys.some((k) => !!privPerms[k]);
                  return (
                    <div key={cat.label}>
                      <div className="flex items-center gap-2.5 mb-3">
                        <svg className="h-5 w-5 shrink-0" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                        </svg>
                        <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--fg-secondary)" }}>{cat.label}</span>
                        <button type="button" onClick={() => { const val = !allOn; setPrivPerms((p) => { const next = { ...p }; for (const k of cat.keys) next[k] = val; return next; }); }}
                          className="ml-auto rounded-lg px-2.5 py-1 text-[10px] font-semibold border transition-colors hover:bg-[var(--hover-bg)]"
                          style={{ color: allOn ? "var(--rose)" : "var(--primary)", borderColor: "var(--border)" }}>
                          {allOn ? "Disable all" : someOn ? "Enable rest" : "Enable all"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5">
                        {cat.keys.map((k) => {
                          const meta = PERMISSION_META[k];
                          return (
                            <label key={k} className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors hover:bg-[var(--hover-bg)]">
                              <input type="checkbox" checked={!!privPerms[k]} onChange={(e) => setPrivPerms((p) => ({ ...p, [k]: e.target.checked }))}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                              <div className="min-w-0">
                                <span className="text-xs font-medium leading-tight block" style={{ color: privPerms[k] ? "var(--fg)" : "var(--fg-secondary)" }}>{meta.label}</span>
                                <span className="text-[10px] leading-snug block mt-0.5" style={{ color: "var(--fg-tertiary)" }}>{meta.desc}</span>
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
              <div className="flex gap-3 border-t px-6 py-5 shrink-0" style={{ borderColor: "var(--border)" }}>
                <motion.button type="button" onClick={handleSavePrivileges} disabled={privSaving} whileTap={{ scale: 0.98 }} className="btn btn-primary flex-1">{privSaving ? "Saving…" : "Save Privileges"}</motion.button>
                <button type="button" onClick={() => setPrivOpen(false)} className="btn btn-secondary flex-1">Cancel</button>
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
