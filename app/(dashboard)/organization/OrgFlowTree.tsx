"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
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

/* ────────── Types ────────── */

interface DesigOption {
  _id: string;
  name: string;
  color: string;
}

interface MembershipEdge {
  _id: string;
  user: { _id: string; about: { firstName: string; lastName: string }; email: string };
  department: { _id: string; title: string };
  team: { _id: string; name: string } | null;
  designation: { _id: string; name: string; color: string } | null;
}

interface Employee {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; profileImage?: string };
  userRole: string;
  department?: { _id: string; title: string };
  teams?: { _id: string; name: string }[];
  isActive: boolean;
}

interface Department {
  _id: string;
  title: string;
  employeeCount: number;
  teamCount: number;
}

interface TeamRow {
  _id: string;
  name: string;
  memberCount: number;
  department: { _id: string; title: string; slug: string };
}

function idStr(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object" && x !== null && "_id" in x) return idStr((x as { _id: unknown })._id);
  return String(x);
}

/* ────────── Custom Nodes ────────── */

function DeptNode({ data }: NodeProps) {
  return (
    <div className="rounded-2xl border-2 px-5 py-3 shadow-lg min-w-[180px] text-center" style={{ background: "var(--bg-elevated)", borderColor: "#8b5cf6" }}>
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
    <div className="rounded-2xl border-2 px-4 py-2.5 shadow-md min-w-[150px] text-center" style={{ background: "var(--bg-elevated)", borderColor: "#3b82f6" }}>
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
  return (
    <div className={`rounded-xl border px-3 py-2 shadow-sm min-w-[140px] ${isActive ? "" : "opacity-50 grayscale"}`} style={{ background: "var(--bg-elevated)", borderColor: "var(--border-strong)" }}>
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

/* ────────── Custom Edge with Designation Pill ────────── */

function DesignationEdge(props: EdgeProps & { data?: { designation?: DesigOption | null; membershipId?: string; designations?: DesigOption[]; onChangeDesignation?: (membershipId: string, designationId: string) => void } }) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data } = props;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const desig = data?.designation;
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as HTMLElement)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      <EdgeLabelRenderer>
        <div
          ref={pillRef}
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
          className="nodrag nopan"
        >
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold shadow-sm transition-all hover:shadow-md"
            style={{
              background: desig?.color ?? "var(--bg-grouped)",
              color: desig ? "white" : "var(--fg-tertiary)",
              borderColor: desig?.color ?? "var(--border)",
            }}
          >
            {desig?.name ?? "No designation"}
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <AnimatePresence>
            {open && data?.designations && data.membershipId && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className="absolute left-1/2 top-full mt-1 -translate-x-1/2 z-50 rounded-lg border shadow-lg p-1 max-h-40 overflow-y-auto min-w-[120px]"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              >
                {data.designations.map((d) => (
                  <button
                    key={d._id}
                    type="button"
                    onClick={() => {
                      data.onChangeDesignation?.(data.membershipId!, d._id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors hover:bg-[var(--bg-grouped)]"
                    style={{ color: desig?._id === d._id ? d.color : "var(--fg-secondary)" }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/* ────────── Main Component ────────── */

const nodeTypes = { dept: DeptNode, team: TeamNode, emp: EmpNode };
const edgeTypes = { designation: DesignationEdge };

interface OrgFlowTreeProps {
  departments: Department[];
  teams: TeamRow[];
  employees: Employee[];
  teamsByDept: Map<string, TeamRow[]>;
  designations: DesigOption[];
  isSuperAdmin: boolean;
}

export function OrgFlowTree({ departments, teams, employees, teamsByDept, designations, isSuperAdmin: isSA }: OrgFlowTreeProps) {
  const [memberships, setMemberships] = useState<MembershipEdge[]>([]);
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const DEPT_X = 300;
    const TEAM_X = 220;
    const EMP_X = 180;
    const LEVEL = 160;

    departments.forEach((dept, dIdx) => {
      const dId = `dept-${dept._id}`;
      const pos = savedPositions[dId] ?? { x: dIdx * DEPT_X, y: 0 };
      const dTeams = teamsByDept.get(dept._id) ?? [];
      nodes.push({
        id: dId, type: "dept", position: pos,
        data: { label: dept.title, sub: `${dept.employeeCount} people · ${dTeams.length} teams` },
      });

      dTeams.forEach((team, tIdx) => {
        const tId = `team-${team._id}`;
        const tPos = savedPositions[tId] ?? { x: dIdx * DEPT_X + (tIdx - (dTeams.length - 1) / 2) * TEAM_X, y: LEVEL };
        nodes.push({
          id: tId, type: "team", position: tPos,
          data: { label: team.name, sub: `${team.memberCount} members` },
        });
        edges.push({
          id: `struct-${dId}-${tId}`, source: dId, target: tId, type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
          style: { stroke: "#8b5cf6", strokeWidth: 1.5, strokeDasharray: "6 3" },
        });
      });
    });

    const empSet = new Set<string>();
    employees.forEach((emp, eIdx) => {
      const eId = `emp-${emp._id}`;
      if (empSet.has(eId)) return;
      empSet.add(eId);
      const initials = (emp.about.firstName?.[0] ?? "") + (emp.about.lastName?.[0] ?? "");

      const empMems = memberships.filter((m) => idStr(m.user?._id) === emp._id);
      let yGuess = LEVEL * 2;
      let xGuess = eIdx * EMP_X;

      if (empMems.length > 0) {
        const firstTeam = empMems.find((m) => m.team);
        if (firstTeam?.team) {
          const tNode = nodes.find((n) => n.id === `team-${idStr(firstTeam.team)}`);
          if (tNode) { xGuess = tNode.position.x; yGuess = tNode.position.y + LEVEL; }
        } else {
          const dNode = nodes.find((n) => n.id === `dept-${idStr(firstTeam?.department)}`);
          if (dNode) { xGuess = dNode.position.x; yGuess = dNode.position.y + LEVEL; }
        }
      }

      const pos = savedPositions[eId] ?? { x: xGuess, y: yGuess };
      nodes.push({
        id: eId, type: "emp", position: pos,
        data: { label: `${emp.about.firstName} ${emp.about.lastName}`, email: emp.email, initials, active: emp.isActive },
      });
    });

    memberships.forEach((m) => {
      if (!m.user?._id) return;
      const eId = `emp-${idStr(m.user._id)}`;
      const targetTeam = m.team ? `team-${idStr(m.team)}` : null;
      const targetDept = `dept-${idStr(m.department)}`;
      const target = targetTeam ?? targetDept;

      if (!nodes.find((n) => n.id === eId) || !nodes.find((n) => n.id === target)) return;

      edges.push({
        id: `mem-${m._id}`,
        source: target,
        target: eId,
        type: "designation",
        data: {
          designation: m.designation ?? null,
          membershipId: m._id,
          designations,
          onChangeDesignation: undefined,
        },
        style: { stroke: m.designation?.color ?? "var(--border-strong)", strokeWidth: 2 },
      });
    });

    const membershipEmpIds = new Set(memberships.map((m) => idStr(m.user?._id)));
    employees.forEach((emp) => {
      if (membershipEmpIds.has(emp._id)) return;
      const eId = `emp-${emp._id}`;
      if (!nodes.find((n) => n.id === eId)) return;

      const empTeams = emp.teams ?? [];
      const empDept = emp.department?._id;

      if (empTeams.length > 0) {
        empTeams.forEach((t) => {
          const tId = `team-${idStr(t._id)}`;
          if (nodes.find((n) => n.id === tId)) {
            edges.push({
              id: `legacy-${eId}-${tId}`, source: tId, target: eId, type: "smoothstep",
              style: { stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "4 4" },
            });
          }
        });
      } else if (empDept) {
        const dId = `dept-${empDept}`;
        if (nodes.find((n) => n.id === dId)) {
          edges.push({
            id: `legacy-${eId}-${dId}`, source: dId, target: eId, type: "smoothstep",
            style: { stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "4 4" },
          });
        }
      }
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [departments, teams, employees, teamsByDept, memberships, savedPositions, designations]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleChangeDesignation = useCallback(async (membershipId: string, designationId: string) => {
    try {
      const res = await fetch(`/api/memberships/${membershipId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation: designationId }),
      });
      if (res.ok) {
        setMemberships((prev) =>
          prev.map((m) =>
            m._id === membershipId
              ? { ...m, designation: designations.find((d) => d._id === designationId) ?? m.designation }
              : m,
          ),
        );
      }
    } catch { /* ignore */ }
  }, [designations]);

  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => {
        if (e.type !== "designation" || !e.data) return e;
        return { ...e, data: { ...e.data, onChangeDesignation: handleChangeDesignation } };
      }),
    );
  }, [handleChangeDesignation, setEdges]);

  const savePositions = useCallback((currentNodes: Node[]) => {
    if (!isSA) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pos: Record<string, { x: number; y: number }> = {};
      for (const n of currentNodes) {
        pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      }
      fetch("/api/flow-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId: "org", positions: pos }),
      });
    }, 800);
  }, [isSA]);

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      const hasDrag = changes.some((c) => c.type === "position" && c.dragging === false);
      if (hasDrag) {
        setNodes((cur) => { savePositions(cur); return cur; });
      }
    },
    [onNodesChange, savePositions, setNodes],
  );

  if (!loaded) {
    return <div className="card-xl shimmer" style={{ height: "calc(100vh - 280px)", minHeight: 400 }} />;
  }

  return (
    <div className="card-xl overflow-hidden" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edgesState}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "designation" }}
      >
        <Controls
          position="top-right"
          showInteractive={false}
          className="!bg-[var(--bg-elevated)] !border-[var(--border)] !shadow-lg !rounded-xl [&>button]:!bg-[var(--bg-elevated)] [&>button]:!border-[var(--border)] [&>button]:!fill-[var(--fg-secondary)] [&>button:hover]:!bg-[var(--bg-grouped)]"
        />
        <MiniMap
          position="bottom-right"
          nodeColor={(n) => n.type === "dept" ? "#8b5cf6" : n.type === "team" ? "#3b82f6" : "var(--teal)"}
          maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
          className="!bg-[var(--bg-elevated)] !border-[var(--border)] !rounded-xl !shadow-lg"
        />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
      </ReactFlow>
    </div>
  );
}
