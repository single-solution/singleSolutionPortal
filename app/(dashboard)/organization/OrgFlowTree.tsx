"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  Position,
  Handle,
  type NodeProps,
  useNodesState,
  useEdgesState,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { PERMISSION_CATEGORIES, PERMISSION_KEYS } from "@/lib/permissions.shared";

/* ────────── Types ────────── */

interface DesigOption { _id: string; name: string; color: string }

interface MembershipRow {
  _id: string;
  user: { _id: string; about: { firstName: string; lastName: string }; email: string };
  department: { _id: string; title: string };
  team: { _id: string; name: string } | null;
  designation: { _id: string; name: string; color: string } | null;
  permissions?: Record<string, boolean>;
}

interface Employee {
  _id: string; email: string; username: string;
  about: { firstName: string; lastName: string; profileImage?: string };
  userRole: string;
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
  isActive: boolean;
}
interface Department { _id: string; title: string; employeeCount: number; teamCount: number }
interface TeamRow { _id: string; name: string; memberCount: number; department: { _id: string; title: string; slug: string } }

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
      <Handle type="target" position={Position.Top} className="!bg-[#8b5cf6] !w-2.5 !h-2.5 !border-0" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "#8b5cf6", color: "white" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold truncate max-w-[140px]" style={{ color: "var(--fg)" }}>{String(data.label ?? "")}</p>
          {data.sub ? <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>{String(data.sub)}</p> : null}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#8b5cf6] !w-2.5 !h-2.5 !border-0" />
    </div>
  );
}

function TeamNode({ data }: NodeProps) {
  return (
    <div className="rounded-2xl border-2 px-4 py-2.5 shadow-md min-w-[150px]" style={{ background: "var(--bg-elevated)", borderColor: "#3b82f6" }}>
      <Handle type="target" position={Position.Top} className="!bg-[#3b82f6] !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "#3b82f6", color: "white" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold truncate max-w-[120px]" style={{ color: "var(--fg)" }}>{String(data.label ?? "")}</p>
          {data.sub ? <p className="text-[10px] truncate" style={{ color: "var(--fg-tertiary)" }}>{String(data.sub)}</p> : null}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#3b82f6] !w-2 !h-2 !border-0" />
    </div>
  );
}

function EmpNode({ data }: NodeProps) {
  const initials = String(data.initials ?? "");
  const isActive = data.active !== false;
  const onClickNode = data.onClickNode as ((empId: string) => void) | undefined;
  return (
    <div
      className={`rounded-xl border px-3 py-2 shadow-sm min-w-[140px] cursor-pointer transition-shadow hover:shadow-md ${isActive ? "" : "opacity-50 grayscale"}`}
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border-strong)" }}
      onClick={() => onClickNode?.(String(data.empId ?? ""))}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--teal)] !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: isActive ? "var(--teal)" : "var(--fg-tertiary)" }}>
          {initials}
        </span>
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold truncate max-w-[100px]" style={{ color: "var(--fg)" }}>{String(data.label ?? "")}</p>
          <p className="text-[9px] truncate max-w-[100px]" style={{ color: "var(--fg-tertiary)" }}>{String(data.email ?? "")}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--teal)] !w-2 !h-2 !border-0" />
    </div>
  );
}

/* ────────── Custom Edge ────────── */

interface DesigEdgeData {
  designation?: DesigOption | null;
  membershipId?: string;
  designations?: DesigOption[];
  onChangeDesignation?: (mId: string, dId: string) => void;
  onOpenPrivileges?: (mId: string) => void;
  onDeleteMembership?: (mId: string) => void;
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

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      <EdgeLabelRenderer>
        <div ref={ref} style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }} className="nodrag nopan">
          <button type="button" onClick={() => setOpen(!open)}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold shadow-sm transition-all hover:shadow-md"
            style={{ background: desig?.color ?? "var(--bg-grouped)", color: desig ? "white" : "var(--fg-tertiary)", borderColor: desig?.color ?? "var(--border)" }}>
            {desig?.name ?? "Assign designation"}
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <AnimatePresence>
            {open && data?.membershipId && (
              <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.12 }}
                className="absolute left-1/2 top-full mt-1 -translate-x-1/2 z-50 rounded-xl border shadow-xl overflow-hidden min-w-[160px]"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                {/* Designation list */}
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
                {/* Actions */}
                <div className="p-1">
                  <button type="button"
                    onClick={() => { data.onOpenPrivileges?.(data.membershipId!); setOpen(false); }}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors hover:bg-[var(--bg-grouped)]"
                    style={{ color: "var(--primary)" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Edit Privileges
                  </button>
                  <button type="button"
                    onClick={() => { if (confirm("Remove this assignment?")) { data.onDeleteMembership?.(data.membershipId!); } setOpen(false); }}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors hover:bg-[var(--bg-grouped)]"
                    style={{ color: "var(--rose)" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    Remove Assignment
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

const nodeTypes = { dept: DeptNode, team: TeamNode, emp: EmpNode };
const edgeTypes = { designation: DesignationEdge };

interface Props {
  departments: Department[]; teams: TeamRow[]; employees: Employee[];
  teamsByDept: Map<string, TeamRow[]>; designations: DesigOption[]; isSuperAdmin: boolean;
}

export function OrgFlowTree({ departments, teams, employees, teamsByDept, designations, isSuperAdmin: isSA }: Props) {
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Assign modal state ── */
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmpId, setAssignEmpId] = useState("");
  const [assignEmpName, setAssignEmpName] = useState("");
  const [assignDept, setAssignDept] = useState("");
  const [assignTeam, setAssignTeam] = useState("");
  const [assignDesig, setAssignDesig] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  /* ── Privileges panel state ── */
  const [privOpen, setPrivOpen] = useState(false);
  const [privMembershipId, setPrivMembershipId] = useState("");
  const [privPerms, setPrivPerms] = useState<Record<string, boolean>>({});
  const [privSaving, setPrivSaving] = useState(false);
  const [privLabel, setPrivLabel] = useState("");

  const refetchMemberships = useCallback(async () => {
    const res = await fetch("/api/memberships");
    if (res.ok) setMemberships(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/memberships").then((r) => r.ok ? r.json() : []),
      fetch("/api/flow-layout?canvasId=org").then((r) => r.ok ? r.json() : {}),
    ]).then(([mems, pos]) => {
      setMemberships(Array.isArray(mems) ? mems : []);
      setSavedPositions(pos && typeof pos === "object" ? pos as Record<string, { x: number; y: number }> : {});
      setLoaded(true);
    });
  }, []);

  /* ── Handlers ── */
  const openAssign = useCallback((empId: string) => {
    const emp = employees.find((e) => e._id === empId);
    if (!emp) return;
    setAssignEmpId(empId);
    setAssignEmpName(`${emp.about.firstName} ${emp.about.lastName}`);
    setAssignDept(departments[0]?._id ?? "");
    setAssignTeam("");
    setAssignDesig(designations[0]?._id ?? "");
    setAssignOpen(true);
  }, [employees, departments, designations]);

  const handleAssign = useCallback(async () => {
    if (!assignEmpId || !assignDept || !assignDesig) return;
    setAssignSaving(true);
    try {
      const body: Record<string, unknown> = { user: assignEmpId, department: assignDept, designation: assignDesig };
      if (assignTeam) body.team = assignTeam;
      const res = await fetch("/api/memberships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { await refetchMemberships(); setAssignOpen(false); }
    } catch { /* ignore */ }
    setAssignSaving(false);
  }, [assignEmpId, assignDept, assignTeam, assignDesig, refetchMemberships]);

  const handleChangeDesignation = useCallback(async (membershipId: string, designationId: string) => {
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designation: designationId }) });
      if (res.ok) setMemberships((prev) => prev.map((m) => m._id === membershipId ? { ...m, designation: designations.find((d) => d._id === designationId) ?? m.designation } : m));
    } catch { /* ignore */ }
  }, [designations]);

  const openPrivileges = useCallback(async (membershipId: string) => {
    const mem = memberships.find((m) => m._id === membershipId);
    if (!mem) return;
    setPrivMembershipId(membershipId);
    const userName = mem.user ? `${mem.user.about?.firstName ?? ""} ${mem.user.about?.lastName ?? ""}`.trim() : "";
    const teamName = mem.team?.name ?? "";
    const deptName = mem.department?.title ?? "";
    setPrivLabel(`${userName} → ${teamName || deptName}`);
    try {
      const res = await fetch(`/api/memberships/${membershipId}`);
      if (res.ok) {
        const full = await res.json();
        const p: Record<string, boolean> = {};
        for (const k of PERMISSION_KEYS) p[k] = !!full.permissions?.[k];
        setPrivPerms(p);
      }
    } catch { /* ignore */ }
    setPrivOpen(true);
  }, [memberships]);

  const handleSavePrivileges = useCallback(async () => {
    if (!privMembershipId) return;
    setPrivSaving(true);
    try {
      await fetch(`/api/memberships/${privMembershipId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: privPerms }) });
      setPrivOpen(false);
    } catch { /* ignore */ }
    setPrivSaving(false);
  }, [privMembershipId, privPerms]);

  const handleDeleteMembership = useCallback(async (membershipId: string) => {
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, { method: "DELETE" });
      if (res.ok) await refetchMemberships();
    } catch { /* ignore */ }
  }, [refetchMemberships]);

  /* ── Build graph ── */
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const DEPT_X = 300; const TEAM_X = 220; const EMP_X = 180; const LEVEL = 160;

    departments.forEach((dept, dIdx) => {
      const dId = `dept-${dept._id}`;
      const dTeams = teamsByDept.get(dept._id) ?? [];
      nodes.push({ id: dId, type: "dept", position: savedPositions[dId] ?? { x: dIdx * DEPT_X, y: 0 }, data: { label: dept.title, sub: `${dept.employeeCount} people · ${dTeams.length} teams` } });
      dTeams.forEach((team, tIdx) => {
        const tId = `team-${team._id}`;
        nodes.push({ id: tId, type: "team", position: savedPositions[tId] ?? { x: dIdx * DEPT_X + (tIdx - (dTeams.length - 1) / 2) * TEAM_X, y: LEVEL }, data: { label: team.name, sub: `${team.memberCount} members` } });
        edges.push({ id: `struct-${dId}-${tId}`, source: dId, target: tId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 }, style: { stroke: "#8b5cf6", strokeWidth: 1.5, strokeDasharray: "6 3" } });
      });
    });

    const empSet = new Set<string>();
    employees.forEach((emp, eIdx) => {
      const eId = `emp-${emp._id}`;
      if (empSet.has(eId)) return;
      empSet.add(eId);
      const initials = (emp.about.firstName?.[0] ?? "") + (emp.about.lastName?.[0] ?? "");
      const empMems = memberships.filter((m) => idStr(m.user?._id) === emp._id);
      let yGuess = LEVEL * 2; let xGuess = eIdx * EMP_X;
      if (empMems.length > 0) {
        const first = empMems.find((m) => m.team) ?? empMems[0];
        const ref = first?.team ? nodes.find((n) => n.id === `team-${idStr(first.team)}`) : nodes.find((n) => n.id === `dept-${idStr(first?.department)}`);
        if (ref) { xGuess = ref.position.x; yGuess = ref.position.y + LEVEL; }
      }
      nodes.push({ id: eId, type: "emp", position: savedPositions[eId] ?? { x: xGuess, y: yGuess }, data: { label: `${emp.about.firstName} ${emp.about.lastName}`, email: emp.email, initials, active: emp.isActive, empId: emp._id, onClickNode: openAssign } });
    });

    memberships.forEach((m) => {
      if (!m.user?._id) return;
      const eId = `emp-${idStr(m.user._id)}`;
      const target = m.team ? `team-${idStr(m.team)}` : `dept-${idStr(m.department)}`;
      if (!nodes.find((n) => n.id === eId) || !nodes.find((n) => n.id === target)) return;
      edges.push({
        id: `mem-${m._id}`, source: target, target: eId, type: "designation",
        data: { designation: m.designation ?? null, membershipId: m._id, designations, onChangeDesignation: handleChangeDesignation, onOpenPrivileges: openPrivileges, onDeleteMembership: handleDeleteMembership } as DesigEdgeData as unknown as Record<string, unknown>,
        style: { stroke: m.designation?.color ?? "var(--border-strong)", strokeWidth: 2 },
      });
    });

    const memEmpIds = new Set(memberships.map((m) => idStr(m.user?._id)));
    employees.forEach((emp) => {
      if (memEmpIds.has(emp._id)) return;
      const eId = `emp-${emp._id}`;
      if (!nodes.find((n) => n.id === eId)) return;
      const et = emp.teams ?? [];
      if (et.length > 0) { et.forEach((t) => { const tId = `team-${idStr(t._id)}`; if (nodes.find((n) => n.id === tId)) edges.push({ id: `legacy-${eId}-${tId}`, source: tId, target: eId, type: "smoothstep", style: { stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "4 4" } }); }); }
      else if (emp.department?._id) { const dId = `dept-${emp.department._id}`; if (nodes.find((n) => n.id === dId)) edges.push({ id: `legacy-${eId}-${dId}`, source: dId, target: eId, type: "smoothstep", style: { stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "4 4" } }); }
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [departments, employees, teamsByDept, memberships, savedPositions, designations, openAssign, handleChangeDesignation, openPrivileges, handleDeleteMembership]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  useEffect(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges, setNodes, setEdges]);

  const savePositions = useCallback((currentNodes: Node[]) => {
    if (!isSA) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pos: Record<string, { x: number; y: number }> = {};
      for (const n of currentNodes) pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      fetch("/api/flow-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canvasId: "org", positions: pos }) });
    }, 800);
  }, [isSA]);

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    if (changes.some((c) => c.type === "position" && c.dragging === false)) setNodes((cur) => { savePositions(cur); return cur; });
  }, [onNodesChange, savePositions, setNodes]);

  const teamsInDept = useMemo(() => (teams ?? []).filter((t) => !assignDept || idStr(t.department?._id ?? t.department) === assignDept), [teams, assignDept]);

  if (!loaded) return <div className="card-xl shimmer" style={{ height: "calc(100vh - 280px)", minHeight: 400 }} />;

  return (
    <>
      <div className="card-xl overflow-hidden relative" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
        <ReactFlow
          nodes={nodes} edges={edgesState}
          onNodesChange={handleNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.15} maxZoom={2.5}
          proOptions={{ hideAttribution: true }} defaultEdgeOptions={{ type: "designation" }}
        >
          <Controls position="top-right" showInteractive={false}
            className="!bg-[var(--bg-elevated)] !border-[var(--border)] !shadow-lg !rounded-xl [&>button]:!bg-[var(--bg-elevated)] [&>button]:!border-[var(--border)] [&>button]:!fill-[var(--fg-secondary)] [&>button:hover]:!bg-[var(--bg-grouped)]" />
          <MiniMap position="bottom-right" nodeColor={(n) => n.type === "dept" ? "#8b5cf6" : n.type === "team" ? "#3b82f6" : "var(--teal)"}
            maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
            className="!bg-[var(--bg-elevated)] !border-[var(--border)] !rounded-xl !shadow-lg" />
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
        </ReactFlow>

        {/* Legend */}
        <div className="absolute left-3 bottom-3 z-10 flex items-center gap-3 rounded-xl border px-3 py-2 shadow-sm" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Click employee to assign</span>
          <span className="text-[9px]" style={{ color: "var(--fg-tertiary)" }}>•</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-tertiary)" }}>Click pill to edit</span>
        </div>
      </div>

      {/* ── Assign Modal ── */}
      <AnimatePresence>
        {assignOpen && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAssignOpen(false)} />
            <motion.div className="relative w-full max-w-md mx-4 rounded-2xl border p-6 shadow-xl" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-1" style={{ color: "var(--fg)" }}>Assign to Team / Department</h2>
              <p className="text-xs mb-4" style={{ color: "var(--fg-secondary)" }}>{assignEmpName}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Department *</label>
                  <select value={assignDept} onChange={(e) => { setAssignDept(e.target.value); setAssignTeam(""); }} className="input w-full">
                    {departments.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Team (optional)</label>
                  <select value={assignTeam} onChange={(e) => setAssignTeam(e.target.value)} className="input w-full">
                    <option value="">Department only</option>
                    {teamsInDept.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--fg-secondary)" }}>Designation *</label>
                  <select value={assignDesig} onChange={(e) => setAssignDesig(e.target.value)} className="input w-full">
                    {designations.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <motion.button type="button" onClick={handleAssign} disabled={assignSaving || !assignDept || !assignDesig} whileTap={{ scale: 0.98 }} className="btn btn-primary btn-sm flex-1">{assignSaving ? "Saving…" : "Assign"}</motion.button>
                  <button type="button" onClick={() => setAssignOpen(false)} className="btn btn-secondary btn-sm flex-1">Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Privileges Slide-over ── */}
      <AnimatePresence>
        {privOpen && (
          <motion.div className="fixed inset-0 z-[70] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setPrivOpen(false)} />
            <motion.div
              className="relative w-full max-w-md h-full overflow-y-auto border-l shadow-xl p-6"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--fg)" }}>Privileges</h2>
                  <p className="text-[11px]" style={{ color: "var(--fg-secondary)" }}>{privLabel}</p>
                </div>
                <button type="button" onClick={() => setPrivOpen(false)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-grouped)]" style={{ color: "var(--fg-secondary)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <div className="space-y-4">
                {PERMISSION_CATEGORIES.map((cat) => (
                  <div key={cat.label}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--fg-tertiary)" }}>{cat.label}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {cat.keys.map((k) => (
                        <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={!!privPerms[k]} onChange={(e) => setPrivPerms((p) => ({ ...p, [k]: e.target.checked }))} className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                          <span className="text-[11px] capitalize" style={{ color: "var(--fg-secondary)" }}>{k.split("_").slice(1).join(" ")}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="sticky bottom-0 pt-4 pb-2" style={{ background: "var(--bg-elevated)" }}>
                <motion.button type="button" onClick={handleSavePrivileges} disabled={privSaving} whileTap={{ scale: 0.98 }} className="btn btn-primary w-full">{privSaving ? "Saving…" : "Save Privileges"}</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
