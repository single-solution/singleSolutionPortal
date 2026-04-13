"use client";

import { useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { SegmentedControl } from "../components/ui";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      transition={{ duration: 0.5, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

export const EMAIL_TYPES = [
  ["invite", "Welcome / Invite"],
  ["reset", "Password Reset"],
  ["alert", "Attendance Alert"],
] as const;

export type TestEmailType = (typeof EMAIL_TYPES)[number][0];

export interface SysSettings {
  office: { latitude: number; longitude: number; radiusMeters: number };
  company: { name: string; timezone: string };
  liveUpdates: boolean;
}

export const DEFAULT_SYS_SETTINGS: SysSettings = {
  office: { latitude: 31.4763416, longitude: 74.2687022, radiusMeters: 300 },
  company: { name: "Single Solution", timezone: "asia-karachi" },
  liveUpdates: false,
};

export interface SystemSettingsController {
  settings: SysSettings;
  setSettings: React.Dispatch<React.SetStateAction<SysSettings>>;
  sysLoading: boolean;
  sysSaving: boolean;
  sysMsg: string;
  handleSave: () => void | Promise<void>;
}

export interface SettingsSystemProps {
  testEmail: string;
  onTestEmailChange: (value: string) => void;
  testType: TestEmailType;
  onTestTypeChange: (value: TestEmailType) => void;
  sendingTestEmail: boolean;
  onTestEmailSend: () => void;
  sys: SystemSettingsController;
  defaultSysSettings: SysSettings;
}

export function SystemCard({ sys }: { sys: SystemSettingsController }) {
  const { settings, setSettings, sysLoading, sysSaving, sysMsg, handleSave } = sys;

  if (sysLoading) {
    return (
      <div className="card-xl p-6 sm:p-8">
        <h2 className="text-sm font-black uppercase tracking-wider mb-1" style={{ color: "var(--primary)" }}>System</h2>
        <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>Company name and timezone.</p>
        <div className="space-y-4">
          <span className="shimmer block h-9 w-full rounded-lg" />
          <span className="shimmer block h-9 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="card-xl p-6 sm:p-8">
      <h2 className="text-sm font-black uppercase tracking-wider mb-1" style={{ color: "var(--primary)" }}>System</h2>
      <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>Company name and timezone.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Company Name</label>
          <input className="input" value={settings.company.name} onChange={(e) => setSettings({ ...settings, company: { ...settings.company, name: e.target.value } })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Timezone</label>
          <select className="input" value={settings.company.timezone} onChange={(e) => setSettings({ ...settings, company: { ...settings.company, timezone: e.target.value } })}>
            <option value="asia-karachi">Asia/Karachi (PKT +05:00)</option>
            <option value="utc">UTC</option>
            <option value="est">America/New_York (EST)</option>
          </select>
        </div>
        <AnimatePresence>
          {sysMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{sysMsg}</motion.p>}
        </AnimatePresence>
        <motion.button type="button" className="w-full btn btn-primary" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={sysSaving} onClick={handleSave}>{sysSaving ? "Saving..." : "Save"}</motion.button>
      </div>
    </div>
  );
}

export function OfficeConfigCard({ sys, defaultSysSettings }: { sys: SystemSettingsController; defaultSysSettings: SysSettings }) {
  const { settings, setSettings, sysLoading, sysSaving, sysMsg, handleSave } = sys;

  if (sysLoading) {
    return (
      <div className="card-xl p-6 sm:p-8">
        <h2 className="text-sm font-black uppercase tracking-wider mb-1" style={{ color: "var(--primary)" }}>Office</h2>
        <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>Geofence and live updates.</p>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <span key={i} className="shimmer block h-9 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="card-xl p-6 sm:p-8">
      <h2 className="text-sm font-black uppercase tracking-wider mb-1" style={{ color: "var(--primary)" }}>Office</h2>
      <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>Geofence center for automatic presence detection.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Latitude</label>
          <input className="input" type="number" step="any" value={settings.office.latitude} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, latitude: parseFloat(e.target.value) || 0 } })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Longitude</label>
          <input className="input" type="number" step="any" value={settings.office.longitude} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, longitude: parseFloat(e.target.value) || 0 } })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Radius (m)</label>
          <input className="input" type="number" value={settings.office.radiusMeters} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, radiusMeters: parseInt(e.target.value) || 50 } })} />
        </div>

        <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: "var(--fg)" }}>Live Updates</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-tertiary)" }}>Real-time push via Socket.IO.</p>
            </div>
            <ToggleSwitch checked={settings.liveUpdates} onChange={(v) => setSettings({ ...settings, liveUpdates: v })} size="lg" />
          </div>
        </div>

        <AnimatePresence>
          {sysMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{sysMsg}</motion.p>}
        </AnimatePresence>
        <div className="flex gap-2">
          <motion.button type="button" className="btn btn-secondary flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setSettings(defaultSysSettings)}>Reset</motion.button>
          <motion.button type="button" className="btn btn-primary flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={sysSaving} onClick={handleSave}>{sysSaving ? "Saving..." : "Save"}</motion.button>
        </div>
      </div>
    </div>
  );
}

export function TestEmailCard({
  testEmail,
  onTestEmailChange,
  testType,
  onTestTypeChange,
  sendingTestEmail,
  onTestEmailSend,
}: Omit<SettingsSystemProps, "sys" | "defaultSysSettings">) {
  return (
    <div className="card-xl p-6 sm:p-8">
      <h2 className="text-sm font-black uppercase tracking-wider mb-1" style={{ color: "var(--primary)" }}>Test Email</h2>
      <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>Send a test email to verify SMTP configuration.</p>
      <div className="space-y-3">
        <SegmentedControl
          value={testType}
          onChange={onTestTypeChange}
          options={EMAIL_TYPES.map(([t, label]) => ({ value: t, label }))}
        />
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]"><svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></span>
          <input type="email" value={testEmail} onChange={(e) => onTestEmailChange(e.target.value)} placeholder="Recipient (leave empty for all admins)" className="input w-full" style={{ paddingLeft: "40px" }} />
        </div>
        <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onTestEmailSend} disabled={sendingTestEmail} className="w-full btn btn-primary disabled:opacity-50">
          {sendingTestEmail ? "Sending..." : "Send Test Email"}
        </motion.button>
      </div>
    </div>
  );
}

export function SettingsSystem({
  testEmail,
  onTestEmailChange,
  testType,
  onTestTypeChange,
  sendingTestEmail,
  onTestEmailSend,
  sys,
  defaultSysSettings,
}: SettingsSystemProps) {
  return (
    <>
      <FadeUp delay={0.2} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TestEmailCard
          testEmail={testEmail}
          onTestEmailChange={onTestEmailChange}
          testType={testType}
          onTestTypeChange={onTestTypeChange}
          sendingTestEmail={sendingTestEmail}
          onTestEmailSend={onTestEmailSend}
        />
        <SystemCard sys={sys} />
      </FadeUp>
      <OfficeConfigCard sys={sys} defaultSysSettings={defaultSysSettings} />
    </>
  );
}
