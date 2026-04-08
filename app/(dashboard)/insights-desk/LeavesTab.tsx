"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveTypeOpt =
  | "annual"
  | "sick"
  | "casual"
  | "unpaid"
  | "maternity"
  | "paternity"
  | "bereavement"
  | "other";

interface PopulatedUser {
  _id?: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
}

interface LeaveDoc {
  _id: string;
  type: LeaveTypeOpt;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  isPastCorrection?: boolean;
  reviewNote?: string;
  user?: PopulatedUser | string;
  reviewedBy?: PopulatedUser | string;
}

interface BalancePayload {
  year: number;
  annual: number;
  sick: number;
  casual: number;
  used: { annual: number; sick: number; casual: number };
  remaining: { annual: number; sick: number; casual: number };
}

interface DropdownEmp {
  _id: string;
  about?: { firstName?: string; lastName?: string };
  email?: string;
}

function nameOf(u: PopulatedUser | string | undefined): string {
  if (!u || typeof u === "string") return "—";
  const f = u.about?.firstName ?? "";
  const l = u.about?.lastName ?? "";
  const n = `${f} ${l}`.trim();
  return n || u.email || "—";
}

function leaveUserId(row: LeaveDoc): string | undefined {
  const u = row.user;
  if (u && typeof u === "object" && "_id" in u && u._id) return String(u._id);
  return undefined;
}

export function LeavesTab() {
  const { data: session } = useSession();
  const yearNow = new Date().getFullYear();

  const [year, setYear] = useState(yearNow);
  const [month, setMonth] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [balance, setBalance] = useState<BalancePayload | null>(null);
  const [leaves, setLeaves] = useState<LeaveDoc[]>([]);
  const [employees, setEmployees] = useState<DropdownEmp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formType, setFormType] = useState<LeaveTypeOpt>("annual");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formUserId, setFormUserId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const canApproveReject = isSuperAdmin;

  const loadBalance = useCallback(async () => {
    const uid = userFilter || session?.user?.id;
    if (!uid) return;
    const q = new URLSearchParams({ year: String(year) });
    if (userFilter) q.set("userId", userFilter);
    const res = await fetch(`/api/leaves/balance?${q}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Failed to load balance");
    }
    const data = await res.json();
    setBalance(data);
  }, [year, userFilter, session?.user?.id]);

  const loadLeaves = useCallback(async () => {
    const q = new URLSearchParams();
    q.set("year", String(year));
    if (month) q.set("month", month);
    if (statusFilter) q.set("status", statusFilter);
    if (userFilter) q.set("userId", userFilter);
    const res = await fetch(`/api/leaves?${q}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Failed to load leaves");
    }
    setLeaves(await res.json());
  }, [year, month, statusFilter, userFilter]);

  const refresh = useCallback(async () => {
    if (!session?.user?.id) return;
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadBalance(), loadLeaves()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, loadBalance, loadLeaves]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void (async () => {
      const res = await fetch("/api/employees/dropdown");
      if (!res.ok) return;
      setEmployees(await res.json());
    })();
  }, [isSuperAdmin]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formStart || !formEnd) {
      setError("Start and end dates are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        type: formType,
        startDate: formStart,
        endDate: formEnd,
        reason: formReason,
      };
      if (isSuperAdmin && formUserId) body.userId = formUserId;
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Request failed");
      setFormReason("");
      setFormStart("");
      setFormEnd("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchLeave(id: string, status: LeaveStatus, reviewNote = "") {
    setError(null);
    const res = await fetch(`/api/leaves/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNote }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || "Update failed");
      return;
    }
    await refresh();
  }

  async function removeLeave(id: string) {
    if (!confirm("Permanently delete this leave record?")) return;
    setError(null);
    const res = await fetch(`/api/leaves/${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || "Delete failed");
      return;
    }
    await refresh();
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    borderRadius: "12px",
    padding: "1rem",
    border: "1px solid var(--border-subtle)",
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--danger, #dc2626)" }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
          Year
          <input
            type="number"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || yearNow)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
          Month
          <select
            className="rounded-lg border px-3 py-2 text-sm min-w-[8rem]"
            style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="">All months</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {new Date(2000, i, 1).toLocaleString("default", { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
          Status
          <select
            className="rounded-lg border px-3 py-2 text-sm min-w-[8rem]"
            style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        {isSuperAdmin && (
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Employee
            <select
              className="rounded-lg border px-3 py-2 text-sm min-w-[12rem]"
              style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">Everyone (scope)</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {nameOf(emp)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--primary-light)", color: "var(--primary)" }}
        >
          Refresh
        </button>
      </div>

      {balance && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["annual", "sick", "casual"] as const).map((k) => (
            <div key={k} style={cardStyle}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-tertiary)" }}>
                {k} leave
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--fg)" }}>
                {balance.remaining[k]} <span className="text-sm font-normal" style={{ color: "var(--fg-tertiary)" }}>days left</span>
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--fg-tertiary)" }}>
                Used {balance.used[k]} / {balance[k]}
              </p>
            </div>
          ))}
        </div>
      )}

      <div style={cardStyle}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "var(--fg)" }}>
          New leave request
        </h2>
        <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isSuperAdmin && (
            <label className="flex flex-col gap-1 text-xs font-semibold md:col-span-2 lg:col-span-3" style={{ color: "var(--fg-tertiary)" }}>
              On behalf of (optional — defaults to you)
              <select
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
              >
                <option value="">Yourself</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {nameOf(emp)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Type
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
              value={formType}
              onChange={(e) => setFormType(e.target.value as LeaveTypeOpt)}
            >
              <option value="annual">Annual</option>
              <option value="sick">Sick</option>
              <option value="casual">Casual</option>
              <option value="unpaid">Unpaid</option>
              <option value="maternity">Maternity</option>
              <option value="paternity">Paternity</option>
              <option value="bereavement">Bereavement</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            Start
            <input
              type="date"
              required
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
              value={formStart}
              onChange={(e) => setFormStart(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--fg-tertiary)" }}>
            End
            <input
              type="date"
              required
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
              value={formEnd}
              onChange={(e) => setFormEnd(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold md:col-span-2 lg:col-span-3" style={{ color: "var(--fg-tertiary)" }}>
            Reason
            <input
              type="text"
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-subtle)", color: "var(--fg)", background: "var(--bg)" }}
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="md:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--primary)", color: "var(--primary-fg, #fff)" }}
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "var(--fg)" }}>
          Requests
        </h2>
        {loading ? (
          <div className="shimmer h-24 rounded-lg" />
        ) : leaves.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fg-tertiary)" }}>
            No leave records for these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            {(() => {
              const showWhoCol =
                isSuperAdmin ||
                leaves.some((l) => leaveUserId(l) && leaveUserId(l) !== session?.user?.id);
              return (
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: "var(--fg-tertiary)" }}>
                  {showWhoCol && <th className="pb-2 pr-3">Who</th>}
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Dates</th>
                  <th className="pb-2 pr-3">Days</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((row) => {
                  const uid = leaveUserId(row) ?? session?.user?.id ?? "";
                  return (
                    <tr key={row._id} style={{ color: "var(--fg)", borderTop: "1px solid var(--border-subtle)" }}>
                      {showWhoCol && <td className="py-2 pr-3">{nameOf(row.user as PopulatedUser)}</td>}
                      <td className="py-2 pr-3 capitalize">{row.type}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(row.startDate).toLocaleDateString()} – {new Date(row.endDate).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-3">{row.days}</td>
                      <td className="py-2 pr-3 capitalize">{row.status}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.status === "pending" && canApproveReject && (isSuperAdmin || uid !== session?.user?.id) && (
                            <>
                              <button
                                type="button"
                                className="rounded-md px-2 py-1 text-xs font-semibold"
                                style={{ background: "var(--primary-light)", color: "var(--primary)" }}
                                onClick={() => void patchLeave(row._id, "approved")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="rounded-md px-2 py-1 text-xs font-semibold"
                                style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--danger, #dc2626)" }}
                                onClick={() => void patchLeave(row._id, "rejected")}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {row.status === "pending" && (uid === session?.user?.id || isSuperAdmin) && (
                            <button
                              type="button"
                              className="rounded-md px-2 py-1 text-xs font-semibold"
                              style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}
                              onClick={() => void patchLeave(row._id, "cancelled")}
                            >
                              Cancel
                            </button>
                          )}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              className="rounded-md px-2 py-1 text-xs font-semibold"
                              style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--danger, #dc2626)" }}
                              onClick={() => void removeLeave(row._id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
