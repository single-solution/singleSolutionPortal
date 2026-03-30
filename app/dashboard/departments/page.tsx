"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import DataTable, { StatusToggle, type Column } from "../components/DataTable";
import SidebarModal from "../components/SidebarModal";
import { buttonHover, slideUpItem, staggerContainer } from "@/lib/motion";

interface Employee {
  _id: string;
  about: { firstName: string; lastName: string };
  userRole: string;
}

interface Department {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  manager?: { _id: string; about: { firstName: string; lastName: string } };
  employeeCount: number;
  isActive: boolean;
  createdAt: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", managerId: "" });

  const load = useCallback(async () => {
    const [deptRes, empRes] = await Promise.all([
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]);
    setDepartments(Array.isArray(deptRes) ? deptRes : []);
    const emps: Employee[] = Array.isArray(empRes) ? empRes : [];
    setManagers(emps.filter((e) => e.userRole === "manager"));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ title: "", description: "", managerId: "" });
    setSidebarOpen(true);
  }

  function openEdit(dept: Department) {
    setEditing(dept);
    setForm({
      title: dept.title,
      description: dept.description ?? "",
      managerId: dept.manager?._id ?? "",
    });
    setSidebarOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await fetch(`/api/departments/${editing._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      } else {
        await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      }
      setSidebarOpen(false);
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this department?")) return;
    await fetch(`/api/departments/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleActive(dept: Department) {
    await fetch(`/api/departments/${dept._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !dept.isActive }),
    });
    await load();
  }

  const columns: Column<Department>[] = [
    {
      key: "name", label: "Department", sortable: true,
      render: (d) => <span className="text-callout font-semibold" style={{ color: "var(--fg)" }}>{d.title}</span>,
    },
    {
      key: "manager", label: "Manager",
      render: (d) => {
        const mgr = d.manager;
        return mgr ? (
          <span className="text-subhead">{mgr.about.firstName} {mgr.about.lastName}</span>
        ) : (
          <span className="text-caption">—</span>
        );
      },
    },
    {
      key: "count", label: "Employees", sortable: true,
      render: (d) => <span className="text-subhead tabular-nums">{d.employeeCount}</span>,
    },
    {
      key: "active", label: "Active",
      render: (d) => <StatusToggle active={d.isActive !== false} onChange={() => toggleActive(d)} />,
    },
    {
      key: "actions", label: "Actions",
      render: (d) => (
        <div className="flex items-center gap-1">
          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(d)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--primary)" }} title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </motion.button>
          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleDelete(d._id)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--rose)" }} title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </motion.button>
        </div>
      ),
    },
  ];

  return (
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div className="flex items-start justify-between gap-3" variants={slideUpItem}>
        <div>
          <h1 className="text-title"><span className="gradient-text">Departments</span></h1>
          <p className="text-subhead mt-1">{departments.length} department{departments.length !== 1 ? "s" : ""}</p>
        </div>
        <motion.button type="button" whileHover={buttonHover} onClick={openCreate} className="btn btn-primary btn-sm shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Department
        </motion.button>
      </motion.div>

      <motion.div variants={slideUpItem}>
        <DataTable
          columns={columns}
          data={departments}
          loading={loading}
          searchPlaceholder="Search departments..."
          searchKey={(d) => d.title}
          rowKey={(d) => d._id}
        />
      </motion.div>

      <SidebarModal
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title={editing ? "Edit Department" : "Create Department"}
        subtitle="Add a new department to the organization."
      >
        <form id="dept-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Department Name</label>
            <input className="input" placeholder="e.g. Marketing" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Description</label>
            <textarea className="input" rows={3} placeholder="Brief description of this department..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Assign Manager</label>
            <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">Select a manager</option>
              {managers.map((m) => <option key={m._id} value={m._id}>{m.about.firstName} {m.about.lastName}</option>)}
            </select>
          </div>
          <motion.button type="submit" disabled={saving} className="btn btn-primary w-full" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>
            {saving ? "Saving..." : editing ? "Update Department" : "Create Department"}
          </motion.button>
        </form>
      </SidebarModal>
    </motion.div>
  );
}
