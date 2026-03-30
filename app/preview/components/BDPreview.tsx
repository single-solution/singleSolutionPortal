"use client";

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  staggerContainer,
  staggerContainerFast,
  slideUpItem,
  fadeInItem,
  cardVariants,
  cardHover,
  buttonHover,
  listItemHover,
  slideFromLeft,
} from "@/lib/motion";
import {
  employees,
  bdJobs,
  getGreeting,
  formatMinutes,
  initials,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  AVATAR_GRADIENTS,
  monthlyStats,
  type Employee,
  type BDJob,
} from "@/lib/mockData";

type InnerTab = "overview" | "profile";
const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
];

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 800; const start = Date.now();
    const step = () => { const elapsed = Date.now() - start; const progress = Math.min(elapsed / duration, 1); const eased = 1 - Math.pow(1 - progress, 3); setDisplay(value * eased); if (progress < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, [value]);
  const formatted = Number.isInteger(value) ? Math.round(display).toString() : display.toFixed(1);
  return <>{formatted}{suffix}</>;
}

const ME_ID = "e4";
type BDFilter = "all" | "draft" | "submitted" | "interviewing" | "accepted" | "rejected";
const FILTER_ORDER: BDFilter[] = ["all", "draft", "submitted", "interviewing", "accepted", "rejected"];
const FILTER_LABELS: Record<BDFilter, string> = { all: "All", draft: "Draft", submitted: "Submitted", interviewing: "Interviewing", accepted: "Accepted", rejected: "Rejected" };
const PIPELINE_LABELS: Record<BDJob["proposalStatus"], string> = { draft: "Draft", submitted: "Submitted", interviewing: "Interviewing", accepted: "Accepted", rejected: "Rejected", archived: "Archived" };

function proposalStatusColor(status: BDJob["proposalStatus"]): string {
  switch (status) { case "draft": return "var(--fg-tertiary)"; case "submitted": return "var(--primary)"; case "interviewing": return "var(--amber)"; case "accepted": return "var(--teal)"; case "rejected": return "var(--rose)"; case "archived": return "var(--fg-tertiary)"; default: return "var(--fg-tertiary)"; }
}

function platformStyle(platform: string): { background: string; color: string } {
  const p = platform.toLowerCase();
  if (p === "upwork") return { background: "rgba(20,168,0,0.14)", color: "#108a00" };
  if (p === "linkedin") return { background: "rgba(10,102,194,0.14)", color: "#0a66c2" };
  if (p === "fiverr") return { background: "rgba(29,191,115,0.14)", color: "#1dbf73" };
  return { background: "var(--primary-light)", color: "var(--primary)" };
}

function matchesJobFilter(job: BDJob, f: BDFilter): boolean { return f === "all" || job.proposalStatus === f; }

/* ──────────────────────── OVERVIEW ──────────────────────── */

function OverviewContent() {
  const me = useMemo(() => employees.find((e) => e._id === ME_ID) as Employee, []);
  const myJobs = useMemo(() => bdJobs.filter((j) => j.userId === ME_ID), []);
  const [filter, setFilter] = useState<BDFilter>("all");
  const filteredJobs = useMemo(() => myJobs.filter((j) => matchesJobFilter(j, filter)), [myJobs, filter]);
  const pipelineCounts = useMemo(() => ({
    draft: myJobs.filter((j) => j.proposalStatus === "draft").length,
    submitted: myJobs.filter((j) => j.proposalStatus === "submitted").length,
    interviewing: myJobs.filter((j) => j.proposalStatus === "interviewing").length,
    won: myJobs.filter((j) => j.proposalStatus === "accepted").length,
  }), [myJobs]);
  const gi = employees.findIndex((e) => e._id === me._id);
  const avatarGrad = AVATAR_GRADIENTS[gi % AVATAR_GRADIENTS.length];

  return (
    <div className="aurora-bg flex flex-col gap-5">
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div variants={slideFromLeft} initial="hidden" animate="visible" className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white ${avatarGrad}`}>{initials(me.firstName, me.lastName)}</div>
          <div className="min-w-0"><p className="text-title">{getGreeting()}, {me.firstName}!</p><p className="text-subhead mt-1">Single Solution Sync · Business Developer</p></div>
        </motion.div>
        <motion.div variants={fadeInItem} initial="hidden" animate="visible" className="flex flex-wrap items-center gap-3 sm:justify-end">
          <span className={`badge ${STATUS_BADGE_CLASS[me.status]}`}>{STATUS_LABELS[me.status]}</span>
          <span className="text-subhead flex items-center gap-2 tabular-nums font-semibold" style={{ color: "var(--fg-secondary)" }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[me.status] }} aria-hidden />{formatMinutes(me.today.totalMinutes)} today
          </span>
        </motion.div>
      </div>

      <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4" variants={staggerContainerFast} initial="hidden" animate="visible">
        <motion.div className="card-static relative overflow-hidden p-4 sm:p-5" custom={0} variants={cardVariants}>
          <p className="text-caption mb-3 font-semibold uppercase tracking-wide">My Attendance Today</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-caption">First entry</p><p className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{me.today.firstEntry ?? "—"}</p></div>
            <div className="text-right"><p className="text-caption">Total hours</p><p className="text-headline tabular-nums" style={{ color: "var(--fg)" }}>{formatMinutes(me.today.totalMinutes)}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <span className="text-caption rounded-lg px-2 py-1" style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}>Office {formatMinutes(me.today.officeMinutes)}</span>
            <span className="text-caption rounded-lg px-2 py-1" style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}>Remote {formatMinutes(me.today.remoteMinutes)}</span>
            <span className="text-caption rounded-lg px-2 py-1 font-semibold" style={{ background: me.today.isOnTime ? "rgba(48,209,88,0.12)" : "rgba(255,159,10,0.12)", color: me.today.isOnTime ? "var(--teal)" : "var(--amber)" }}>{me.today.isOnTime ? "On time" : "Late"}</span>
          </div>
        </motion.div>
        <motion.div className="card-static relative overflow-hidden p-4 sm:p-5" custom={1} variants={cardVariants}>
          <p className="text-caption mb-3 font-semibold uppercase tracking-wide">This Month</p>
          <div className="grid grid-cols-3 gap-3">
            <div><p className="text-caption">Present days</p><p className="text-title tabular-nums"><span className="gradient-text"><AnimatedNumber value={monthlyStats.presentDays} /></span></p></div>
            <div><p className="text-caption">On-time</p><p className="text-title tabular-nums"><span className="gradient-text"><AnimatedNumber value={monthlyStats.onTimePercentage} suffix="%" /></span></p></div>
            <div><p className="text-caption">Total hrs</p><p className="text-title tabular-nums"><span className="gradient-text"><AnimatedNumber value={monthlyStats.totalWorkingHours} /></span></p></div>
          </div>
          <p className="text-subhead mt-4">{monthlyStats.month} {monthlyStats.year} · Avg {monthlyStats.averageDailyHours}h / day</p>
        </motion.div>
      </motion.div>

      <motion.div className="card-static overflow-hidden" variants={fadeInItem} initial="hidden" animate="visible">
        <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" style={{ borderColor: "var(--border)" }}>
          <div><h2 className="text-headline">Job Tracker</h2><p className="text-caption mt-0.5">Pipeline · {myJobs.length} jobs assigned to you</p></div>
          <LayoutGroup id="bd-pipeline-filters">
            <div className="relative flex max-w-full flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--glass-bg)" }}>
              {FILTER_ORDER.map((f) => {
                const active = filter === f;
                return (
                  <button key={f} type="button" className="btn btn-sm relative z-10 min-h-0 border-0 bg-transparent px-3 py-1.5 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }} onClick={() => setFilter(f)}>
                    {active && <motion.span layoutId="bd-filter" className="absolute inset-0 rounded-lg" style={{ background: "var(--glass-bg-heavy)", border: "0.5px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                    <span className="relative text-caption font-semibold sm:text-callout">{FILTER_LABELS[f]}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </div>
        <div className="flex flex-wrap gap-2 border-b p-4 sm:gap-3 sm:p-5" style={{ borderColor: "var(--border)" }}>
          {([
            { key: "draft", label: "Draft", count: pipelineCounts.draft, dot: "var(--fg-tertiary)" },
            { key: "submitted", label: "Submitted", count: pipelineCounts.submitted, dot: "var(--primary)" },
            { key: "interviewing", label: "Interviewing", count: pipelineCounts.interviewing, dot: "var(--amber)" },
            { key: "won", label: "Won", count: pipelineCounts.won, dot: "var(--teal)" },
          ] as const).map((s) => (
            <motion.div key={s.key} whileHover={listItemHover} className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: "var(--glass-bg)", border: "0.5px solid var(--glass-border)" }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} aria-hidden />
              <span className="text-caption font-semibold" style={{ color: "var(--fg-secondary)" }}>{s.label}: <span className="tabular-nums" style={{ color: "var(--fg)" }}>{s.count}</span></span>
            </motion.div>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2" variants={staggerContainer} initial="hidden" animate="visible">
            {filteredJobs.map((job) => {
              const plat = platformStyle(job.platform);
              const statusColor = proposalStatusColor(job.proposalStatus);
              const tags = job.techStackRequired.split(",").map((t) => t.trim()).filter(Boolean);
              return (
                <motion.article key={job._id} variants={slideUpItem} whileHover={cardHover} className="card-static flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-caption rounded-lg px-2 py-0.5 font-bold uppercase tracking-wide" style={{ background: plat.background, color: plat.color }}>{job.platform}</span>
                    {job.followUpNeeded && <span className="text-caption font-semibold" style={{ color: "var(--amber)" }}>Follow-up</span>}
                  </div>
                  <div><h3 className="text-callout font-bold" style={{ color: "var(--fg)" }}>{job.jobTitle}</h3><p className="text-subhead mt-1">{job.clientCompanyName} · {job.clientCountry}</p></div>
                  <p className="text-footnote font-semibold tabular-nums" style={{ color: "var(--fg-secondary)" }}>{job.expectedSalaryBudget}</p>
                  <div className="flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="text-caption rounded-lg px-2 py-0.5" style={{ background: "var(--glass-bg)", border: "0.5px solid var(--glass-border)", color: "var(--fg-secondary)" }}>{tag}</span>)}</div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <span className="text-caption rounded-full px-2.5 py-1 font-semibold" style={{ background: `${statusColor}18`, color: statusColor, border: `0.5px solid ${statusColor}33` }}>{PIPELINE_LABELS[job.proposalStatus]}</span>
                    <span className="text-caption tabular-nums" style={{ color: "var(--fg-tertiary)" }}>{job.jobID}</span>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
          {filteredJobs.length === 0 && <p className="text-subhead py-10 text-center">No jobs in this stage.</p>}
        </div>
      </motion.div>
    </div>
  );
}

/* ──────────────────────── PROFILE ──────────────────────── */

function ProfileContent() {
  const me = useMemo(() => employees.find((e) => e._id === ME_ID) as Employee, []);
  const gi = employees.findIndex((e) => e._id === me._id);
  const avatarGrad = AVATAR_GRADIENTS[gi % AVATAR_GRADIENTS.length];

  return (
    <motion.div className="flex flex-col gap-6" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div className="card-static flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-start sm:gap-6" variants={fadeInItem}>
        <div className="group relative">
          <div className={`flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-bold text-white shadow-lg sm:h-28 sm:w-28 ${avatarGrad}`}>
            {initials(me.firstName, me.lastName)}
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="text-title" style={{ color: "var(--fg)" }}>{me.firstName} {me.lastName}</h2>
          <p className="text-subhead mt-1">{me.designation}</p>
          <p className="text-caption mt-0.5">{me.department} · {me.email}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className={`badge ${STATUS_BADGE_CLASS[me.status]}`}>{STATUS_LABELS[me.status]}</span>
            <span className="badge" style={{ background: "var(--glass-bg)", color: "var(--fg-secondary)" }}>{me.shift.type === "fullTime" ? "Full Time" : me.shift.type === "partTime" ? "Part Time" : "Contract"}</span>
          </div>
        </div>
      </motion.div>

      <motion.div className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Edit Profile</h3>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>First Name</label><input className="input" defaultValue={me.firstName} /></div>
            <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Last Name</label><input className="input" defaultValue={me.lastName} /></div>
          </div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Email</label><input className="input" type="email" defaultValue={me.email} /></div>
          <div><label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Username</label><input className="input" defaultValue={me.username} /></div>
          <div className="flex justify-end gap-3">
            <motion.button type="button" className="btn btn-secondary" whileHover={buttonHover}>Cancel</motion.button>
            <motion.button type="button" className="btn btn-primary" whileHover={buttonHover} whileTap={{ scale: 0.97 }}>Save Changes</motion.button>
          </div>
        </div>
      </motion.div>

      <motion.div className="card-xl p-5 sm:p-6" variants={fadeInItem}>
        <h3 className="text-headline mb-1" style={{ color: "var(--fg)" }}>Security</h3>
        <p className="text-caption mb-4">Update your password to keep your account secure.</p>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg)" }}>
              <svg className="h-4 w-4" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Current password
            </label>
            <input className="input" type="password" placeholder="Required to confirm changes" />
          </div>
          <div className="border-t border-[var(--border)]" />
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg)" }}>
              <svg className="h-4 w-4" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              New password
            </label>
            <input className="input" type="password" placeholder="At least 8 characters" />
            <div className="mt-1.5 flex gap-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < 3 ? "var(--primary)" : "var(--border)" }} />)}</div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: "var(--fg)" }}>Confirm password</label>
            <input className="input" type="password" placeholder="Type password again" />
            <p className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: "var(--teal)" }}>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Passwords match
            </p>
          </div>
          <motion.button type="button" className="btn btn-primary w-full" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Save changes</motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ──────────────────────── MAIN ──────────────────────── */

export default function BDPreview() {
  const [innerTab, setInnerTab] = useState<InnerTab>("overview");

  return (
    <div className="flex flex-col gap-4 py-4 sm:gap-5 sm:py-5">
      <LayoutGroup id="bd-inner-tabs">
        <div className="scrollbar-hide flex gap-1 overflow-x-auto rounded-xl p-1" style={{ background: "var(--glass-bg)" }}>
          {INNER_TABS.map((tab) => {
            const active = innerTab === tab.id;
            return (
              <button key={tab.id} type="button" onClick={() => setInnerTab(tab.id)} className="btn btn-sm relative z-10 min-h-0 shrink-0 border-0 bg-transparent px-4 py-2 shadow-none" style={{ color: active ? "var(--fg)" : "var(--fg-secondary)" }}>
                {active && <motion.span layoutId="bd-inner-active" className="absolute inset-0 rounded-lg" style={{ background: "var(--glass-bg-heavy)", border: "0.5px solid var(--glass-border)", boxShadow: "var(--glass-shadow)" }} transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                <span className="relative text-callout font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div key={innerTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          {innerTab === "overview" && <OverviewContent />}
          {innerTab === "profile" && <ProfileContent />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
