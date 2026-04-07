"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Position,
  Handle,
  type NodeProps,
  useNodesState,
  useEdgesState,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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

function OrgNode({ data }: NodeProps) {
  return (
    <div className="rounded-xl border px-4 py-3 shadow-md min-w-[160px] text-center" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
      <Handle type="target" position={Position.Top} className="!bg-[var(--primary)] !w-2 !h-2 !border-0" />
      <div className="flex items-center justify-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: data.color as string ?? "var(--primary)", color: "white" }}>
          {data.icon === "dept" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          )}
          {data.icon === "team" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          {data.icon === "person" && (
            <span className="text-[10px] font-bold">{data.initials as string}</span>
          )}
        </div>
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold truncate max-w-[120px]" style={{ color: "var(--fg)" }}>{String(data.label ?? "")}</p>
          {data.sub ? <p className="text-[10px] truncate max-w-[120px]" style={{ color: "var(--fg-tertiary)" }}>{String(data.sub)}</p> : null}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--primary)] !w-2 !h-2 !border-0" />
    </div>
  );
}

const nodeTypes = { org: OrgNode };

interface OrgFlowTreeProps {
  departments: Department[];
  teams: TeamRow[];
  employees: Employee[];
  teamsByDept: Map<string, TeamRow[]>;
}

export function OrgFlowTree({ departments, teams, employees, teamsByDept }: OrgFlowTreeProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const DEPT_SPACING_X = 320;
    const TEAM_SPACING_X = 220;
    const EMP_SPACING_X = 180;
    const LEVEL_Y = 140;

    const rootId = "org-root";
    nodes.push({
      id: rootId,
      type: "org",
      position: { x: Math.max(0, (departments.length - 1) * DEPT_SPACING_X / 2), y: 0 },
      data: { label: "Organization", sub: `${employees.length} people`, icon: "dept", color: "var(--primary)" },
    });

    departments.forEach((dept, dIdx) => {
      const dId = `dept-${dept._id}`;
      const dTeams = teamsByDept.get(dept._id) ?? [];
      const deptEmps = employees.filter((e) => idStr(e.department?._id) === dept._id);

      nodes.push({
        id: dId,
        type: "org",
        position: { x: dIdx * DEPT_SPACING_X, y: LEVEL_Y },
        data: { label: dept.title, sub: `${dept.employeeCount} people · ${dTeams.length} teams`, icon: "dept", color: "#8b5cf6" },
      });
      edges.push({
        id: `e-root-${dId}`,
        source: rootId,
        target: dId,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
        style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
      });

      if (dTeams.length > 0) {
        const teamStartX = dIdx * DEPT_SPACING_X - ((dTeams.length - 1) * TEAM_SPACING_X) / 2;
        dTeams.forEach((team, tIdx) => {
          const tId = `team-${team._id}`;
          const tMembers = deptEmps.filter((e) => (e.teams ?? []).some((t) => idStr(t._id) === team._id));

          nodes.push({
            id: tId,
            type: "org",
            position: { x: teamStartX + tIdx * TEAM_SPACING_X, y: LEVEL_Y * 2 },
            data: { label: team.name, sub: `${tMembers.length} members`, icon: "team", color: "#3b82f6" },
          });
          edges.push({
            id: `e-${dId}-${tId}`,
            source: dId,
            target: tId,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
            style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
          });

          const empStartX = (teamStartX + tIdx * TEAM_SPACING_X) - ((tMembers.length - 1) * EMP_SPACING_X) / 2;
          tMembers.forEach((emp, eIdx) => {
            const eId = `emp-${emp._id}-${team._id}`;
            const initials = (emp.about.firstName?.[0] ?? "") + (emp.about.lastName?.[0] ?? "");
            nodes.push({
              id: eId,
              type: "org",
              position: { x: empStartX + eIdx * EMP_SPACING_X, y: LEVEL_Y * 3 },
              data: {
                label: `${emp.about.firstName} ${emp.about.lastName}`,
                sub: emp.email,
                icon: "person",
                initials,
                color: emp.isActive ? "var(--teal)" : "var(--fg-tertiary)",
              },
            });
            edges.push({
              id: `e-${tId}-${eId}`,
              source: tId,
              target: eId,
              type: "smoothstep",
              style: { stroke: "var(--border)", strokeWidth: 1 },
            });
          });
        });
      } else {
        const empStartX = dIdx * DEPT_SPACING_X - ((deptEmps.length - 1) * EMP_SPACING_X) / 2;
        deptEmps.forEach((emp, eIdx) => {
          const eId = `emp-${emp._id}-nodept`;
          const initials = (emp.about.firstName?.[0] ?? "") + (emp.about.lastName?.[0] ?? "");
          nodes.push({
            id: eId,
            type: "org",
            position: { x: empStartX + eIdx * EMP_SPACING_X, y: LEVEL_Y * 2 },
            data: {
              label: `${emp.about.firstName} ${emp.about.lastName}`,
              sub: emp.email,
              icon: "person",
              initials,
              color: emp.isActive ? "var(--teal)" : "var(--fg-tertiary)",
            },
          });
          edges.push({
            id: `e-${dId}-${eId}`,
            source: dId,
            target: eId,
            type: "smoothstep",
            style: { stroke: "var(--border)", strokeWidth: 1 },
          });
        });
      }
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [departments, employees, teamsByDept]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback(() => {}, []);

  return (
    <div className="card-xl overflow-hidden" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Controls
          position="top-right"
          showInteractive={false}
          className="!bg-[var(--bg-elevated)] !border-[var(--border)] !shadow-lg !rounded-xl [&>button]:!bg-[var(--bg-elevated)] [&>button]:!border-[var(--border)] [&>button]:!fill-[var(--fg-secondary)] [&>button:hover]:!bg-[var(--bg-grouped)]"
        />
        <MiniMap
          position="bottom-right"
          nodeColor={() => "var(--primary)"}
          maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
          className="!bg-[var(--bg-elevated)] !border-[var(--border)] !rounded-xl !shadow-lg"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
      </ReactFlow>
    </div>
  );
}
