"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/lib/usePermissions";
import { useGuide } from "@/lib/useGuide";
import { settingsTour } from "@/lib/tourConfigs";
import {
  SettingsProfile,
  getAvatarGradient,
  SETTINGS_PROFILE_AVATAR_FALLBACK_GRADIENT,
  type SettingsProfileData,
} from "./SettingsProfile";
import { SettingsSecurity } from "./SettingsSecurity";
import {
  SystemCard,
  OfficeConfigCard,
  TestEmailCard,
  DEFAULT_SYS_SETTINGS,
  type TestEmailType,
  type SysSettings,
} from "./SettingsSystem";
import { SettingsPayroll } from "./SettingsPayroll";
import { ToggleSwitch } from "../components/ToggleSwitch";

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

function getPasswordStrength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function useSystemSettings(enabled: boolean) {
  const [settings, setSettings] = useState<SysSettings>(DEFAULT_SYS_SETTINGS);
  const [sysLoading, setSysLoading] = useState(true);
  const [sysSaving, setSysSaving] = useState(false);
  const [sysMsg, setSysMsg] = useState("");

  useEffect(() => {
    if (!enabled) {
      setSysLoading(false);
      return;
    }
    setSysLoading(true);
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.office) setSettings({ office: d.office, company: d.company, liveUpdates: d.liveUpdates ?? false });
      setSysLoading(false);
    }).catch(() => setSysLoading(false));
  }, [enabled]);

  async function handleSave() {
    setSysSaving(true); setSysMsg("");
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      if (res.ok) { setSysMsg("Settings saved!"); setTimeout(() => setSysMsg(""), 3000); }
    } catch { /* ignore */ }
    setSysSaving(false);
  }

  return { settings, setSettings, sysLoading, sysSaving, sysMsg, handleSave };
}

export default function SettingsPage() {
  const { registerTour } = useGuide();
  useEffect(() => { registerTour("settings", settingsTour); }, [registerTour]);
  const { can: canPerm } = usePermissions();
  const canManageSettings = canPerm("settings_manage");
  const canManagePayroll = canPerm("payroll_manageSalary");

  const sys = useSystemSettings(canManageSettings);

  const [profile, setProfile] = useState<SettingsProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [testEmail, setTestEmail] = useState("");
  const [testType, setTestType] = useState<TestEmailType>("invite");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: SettingsProfileData) => {
        setProfile(data);
        const fn = data.about?.firstName ?? "";
        const ln = data.about?.lastName ?? "";
        setFullName(ln ? `${fn} ${ln}` : fn);
        setPhone(data.about?.phone ?? "");
        setProfileImage(data.about?.profileImage ?? "");
        setEmail(data.email ?? "");
        setNewEmail(data.email ?? "");
      })
      .catch(() => setMessage({ type: "error", text: "Failed to load profile" }))
      .finally(() => setLoadingProfile(false));
  }, []);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setProfileMsg("Image must be under 2MB"); setTimeout(() => setProfileMsg(""), 3000); return; }
    const reader = new FileReader();
    reader.onload = () => setProfileImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), phone, profileImage }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        setProfileImage(updated.about?.profileImage ?? "");
        setProfileMsg("Profile updated!");
      }
    } catch { /* ignore */ }
    setProfileSaving(false);
    setTimeout(() => setProfileMsg(""), 3000);
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!currentPassword.trim()) { setMessage({ type: "error", text: "Current password is required" }); return; }
    const emailChanged = newEmail.trim().toLowerCase() !== email.toLowerCase();
    const hasNewPw = newPassword.length > 0;

    if (!emailChanged && !hasNewPw) { setMessage({ type: "error", text: "Enter a new email and/or new password" }); return; }
    if (hasNewPw && newPassword.length < 8) { setMessage({ type: "error", text: "New password must be at least 8 characters" }); return; }
    if (hasNewPw && newPassword !== confirmPassword) { setMessage({ type: "error", text: "Passwords do not match" }); return; }

    setSaving(true);
    try {
      if (hasNewPw) {
        const pwRes = await fetch("/api/profile/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: currentPassword.trim(), newPassword }) });
        const pwData = await pwRes.json();
        if (!pwRes.ok) { setMessage({ type: "error", text: pwData.error || "Password update failed" }); setSaving(false); return; }
      }
      if (emailChanged) {
        const emRes = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newEmail.trim(), currentPassword: currentPassword.trim() }) });
        const emData = await emRes.json().catch(() => ({}));
        if (!emRes.ok) { setMessage({ type: "error", text: emData.error || "Email update failed" }); setSaving(false); return; }
        setEmail(newEmail.trim());
      }
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setMessage({ type: "success", text: "Settings saved!" });
    } catch { setMessage({ type: "error", text: "Something went wrong" }); }
    setSaving(false);
  }

  async function handleTestEmail() {
    setSendingTestEmail(true);
    try {
      const params = new URLSearchParams({ type: testType });
      if (testEmail.trim()) params.set("email", testEmail.trim());
      const res = await fetch(`/api/test-email?${params}`);
      const data = await res.json();
      if (data.ok || data.notified) setMessage({ type: "success", text: `Test ${testType} email sent!` });
      else setMessage({ type: "error", text: data.message || data.error || "No email sent" });
    } catch { setMessage({ type: "error", text: "Failed to send test email" }); }
    setSendingTestEmail(false);
  }

  if (loadingProfile) {
    return (
      <div className="flex flex-col gap-5">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="shimmer h-11 w-11 rounded-xl" />
          <div className="space-y-2"><div className="shimmer h-5 w-40 rounded" /><div className="shimmer h-3 w-60 rounded" /></div>
        </div>
        {/* Profile + Account grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Profile card skeleton */}
          <div className="card-xl p-6 sm:p-8 space-y-5">
            <div className="shimmer h-4 w-16 rounded" />
            <div className="flex items-center gap-4">
              <div className="shimmer h-14 w-14 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2"><div className="shimmer h-4 w-32 rounded" /><div className="shimmer h-3 w-40 rounded" /><div className="flex gap-1.5"><div className="shimmer h-4 w-14 rounded-full" /><div className="shimmer h-4 w-16 rounded-full" /></div></div>
            </div>
            <div className="space-y-3"><div className="shimmer h-3 w-16 rounded" /><div className="shimmer h-10 rounded" /></div>
            <div className="space-y-3"><div className="shimmer h-3 w-12 rounded" /><div className="shimmer h-10 rounded" /></div>
            <div className="shimmer h-10 rounded-xl" />
          </div>
          {/* Account card skeleton */}
          <div className="card-xl p-6 sm:p-8 space-y-5">
            <div className="shimmer h-4 w-32 rounded" />
            <div className="space-y-3"><div className="shimmer h-3 w-28 rounded" /><div className="shimmer h-10 rounded" /></div>
            <div className="shimmer h-px w-full rounded" style={{ opacity: 0.3 }} />
            <div className="space-y-3"><div className="shimmer h-3 w-20 rounded" /><div className="shimmer h-10 rounded" /></div>
            <div className="space-y-3"><div className="shimmer h-3 w-24 rounded" /><div className="shimmer h-10 rounded" /><div className="flex gap-1.5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="shimmer h-1 flex-1 rounded-full" />)}</div></div>
            <div className="shimmer h-10 rounded-xl" />
          </div>
        </div>
        {/* Superadmin row skeleton */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="card-xl p-6 sm:p-8 space-y-4"><div className="shimmer h-3 w-20 rounded" /><div className="shimmer h-3 w-48 rounded" /><div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--bg-grouped)" }}><div className="shimmer h-7 w-20 rounded-lg" /><div className="shimmer h-7 w-24 rounded-lg" /><div className="shimmer h-7 w-28 rounded-lg" /></div><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded-xl" /></div>
          <div className="card-xl p-6 sm:p-8 space-y-4"><div className="shimmer h-3 w-16 rounded" /><div className="shimmer h-3 w-44 rounded" /><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded" /><div className="shimmer h-10 rounded-xl" /></div>
        </div>
      </div>
    );
  }

  const avatarGradient = profile ? getAvatarGradient(fullName) : SETTINGS_PROFILE_AVATAR_FALLBACK_GRADIENT;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <FadeUp className="flex items-center gap-3">
        <div className="page-icon bg-gradient-to-br from-purple-500 to-pink-400 text-white shadow-lg shadow-purple-500/20">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
        <div>
          <h1 className="text-title">Account Settings</h1>
          <p className="text-subhead">Manage your profile, email, and password</p>
        </div>
      </FadeUp>

      {/* Grid layout: profile + account side-by-side */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SettingsProfile
          profile={profile}
          fullName={fullName}
          onFullNameChange={setFullName}
          phone={phone}
          onPhoneChange={setPhone}
          profileImage={profileImage}
          onProfileImageChange={setProfileImage}
          profileSaving={profileSaving}
          profileMsg={profileMsg}
          onProfileSubmit={handleProfileSave}
          onImageSelect={handleImageSelect}
          avatarGradient={avatarGradient}
        />

        <SettingsSecurity
          email={email}
          newEmail={newEmail}
          onNewEmailChange={setNewEmail}
          currentPassword={currentPassword}
          onCurrentPasswordChange={setCurrentPassword}
          newPassword={newPassword}
          onNewPasswordChange={setNewPassword}
          confirmPassword={confirmPassword}
          onConfirmPasswordChange={setConfirmPassword}
          showCurrent={showCurrent}
          onToggleShowCurrent={() => setShowCurrent((v) => !v)}
          showNew={showNew}
          onToggleShowNew={() => setShowNew((v) => !v)}
          saving={saving}
          message={message}
          onAccountSubmit={handleAccountSubmit}
          strength={strength}
          passwordsMatch={passwordsMatch}
        />
      </div>

      {/* Preferences */}
      <PreferencesSection />

      {/* Payroll + System + Office in a 3-col grid */}
      {(canManagePayroll || canManageSettings) && (
        <FadeUp delay={0.22}>
          <div data-tour="settings-system" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {canManagePayroll && <SettingsPayroll />}
            {canManageSettings && <SystemCard sys={sys} />}
            {canManageSettings && <OfficeConfigCard sys={sys} defaultSysSettings={DEFAULT_SYS_SETTINGS} />}
          </div>
        </FadeUp>
      )}

      {/* Test Email */}
      {canManageSettings && (
        <FadeUp delay={0.26}>
          <TestEmailCard
            testEmail={testEmail}
            onTestEmailChange={setTestEmail}
            testType={testType}
            onTestTypeChange={setTestType}
            sendingTestEmail={sendingTestEmail}
            onTestEmailSend={handleTestEmail}
          />
        </FadeUp>
      )}
    </div>
  );
}

function PreferencesSection() {
  const { data: session, update } = useSession();
  const [showCoords, setShowCoords] = useState(session?.user?.showCoordinates ?? false);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !showCoords;
    setShowCoords(next);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showCoordinates: next }),
      });
      if (res.ok) await update();
      else setShowCoords(!next);
    } catch {
      setShowCoords(!next);
    }
    setSaving(false);
  }

  return (
    <FadeUp delay={0.18}>
      <div className="card-xl p-6 sm:p-8">
        <h2 className="text-headline mb-4">Preferences</h2>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>Show coordinates in time pill</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--fg-tertiary)" }}>Display your current lat/lng next to the session timer.</p>
          </div>
          <ToggleSwitch checked={showCoords} onChange={() => toggle()} disabled={saving} size="lg" />
        </div>
        </div>
    </FadeUp>
  );
}
