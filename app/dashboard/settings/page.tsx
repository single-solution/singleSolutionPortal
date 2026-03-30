"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { buttonHover, slideUpItem, staggerContainer, fadeInItem } from "@/lib/motion";
import { useSession } from "next-auth/react";

interface Profile {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  userRole: string;
  department?: { title: string };
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

function strengthColor(s: number) {
  if (s <= 1) return "var(--rose)";
  if (s <= 2) return "var(--amber)";
  if (s <= 3) return "var(--amber)";
  return "var(--green)";
}

const EMAIL_TYPES = [
  ["invite", "Welcome / Invite"],
  ["reset", "Password Reset"],
  ["alert", "Attendance Alert"],
] as const;

type TestEmailType = (typeof EMAIL_TYPES)[number][0];

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400", "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400", "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
];

function getAvatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "superadmin";

  const [profile, setProfile] = useState<Profile | null>(null);
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
      .then((data: Profile) => {
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
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone, profileImage }),
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
        const emRes = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newEmail.trim() }) });
        if (!emRes.ok) { setMessage({ type: "error", text: "Email update failed" }); setSaving(false); return; }
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
      <div className="space-y-4">
        <div className="card-xl p-8 space-y-4">
          <div className="shimmer h-4 w-1/3 rounded" />
          <div className="shimmer h-12 rounded" />
          <div className="shimmer h-12 rounded" />
          <div className="shimmer h-12 rounded" />
        </div>
      </div>
    );
  }

  const avatarGradient = profile ? getAvatarGradient(fullName) : AVATAR_GRADIENTS[0];

  return (
    <motion.div className="flex flex-col gap-5" variants={staggerContainer} initial="hidden" animate="visible">
      {/* Page header */}
      <motion.div className="flex items-center gap-3" variants={slideUpItem}>
        <div className="page-icon bg-gradient-to-br from-purple-500 to-pink-400 text-white shadow-lg shadow-purple-500/20">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
        <div>
          <h1 className="text-title">Account Settings</h1>
          <p className="text-subhead hidden sm:block">Manage your profile, email, and password</p>
        </div>
      </motion.div>

      {/* Grid layout: profile + account side-by-side on desktop */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Profile card */}
        <motion.div className="card-xl p-6 sm:p-8" variants={slideUpItem}>
          <h2 className="text-headline mb-4">Profile</h2>
          <div className="mb-5 flex items-center gap-4">
            <div className="relative group">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
              ) : (
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white ${avatarGradient}`}>
                  {fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
              )}
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </label>
              {profileImage && (
                <button type="button" className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white text-xs opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setProfileImage("")}>×</button>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-headline truncate">{fullName || "Unnamed"}</p>
              <p className="text-caption truncate" style={{ color: "var(--fg-tertiary)" }}>{profile?.email}</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--fg)] mb-2">Full Name</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="e.g. John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--fg)] mb-2">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+92 xxx xxxxxxx" />
            </div>
            <AnimatePresence>
              {profileMsg && <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{profileMsg}</motion.p>}
            </AnimatePresence>
            <motion.button type="submit" disabled={profileSaving} whileHover={buttonHover} whileTap={{ scale: 0.97 }} className="w-full btn btn-primary disabled:opacity-50">
              {profileSaving ? "Saving..." : "Save profile"}
            </motion.button>
          </form>
        </motion.div>

        {/* Account card — email + password */}
        <motion.div variants={slideUpItem}>
          <form onSubmit={handleAccountSubmit} className="card-xl p-6 sm:p-8 h-full flex flex-col">
            <h2 className="text-headline mb-4">Email & Password</h2>
            <div className="space-y-5 flex-1">
              <div>
                <label className="block text-sm font-medium text-[var(--fg)] mb-2">Current password</label>
                <div className="relative">
                  <input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to confirm changes" className="input pr-12" required />
                  <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-secondary)]" onClick={() => setShowCurrent((v) => !v)}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={showCurrent ? "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" : "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"} /></svg>
                  </button>
                </div>
              </div>

              <div className="border-t border-[var(--border)]" />

              <div>
                <label className="block text-sm font-medium text-[var(--fg)] mb-2">New email</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="admin@company.com" className="input" />
                {newEmail.trim() && newEmail.toLowerCase() !== email.toLowerCase() && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-[var(--primary)] mt-1.5">Email will change from {email}</motion.p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--fg)] mb-2">New password</label>
                <div className="relative">
                  <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className="input pr-12" />
                  <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-secondary)]" onClick={() => setShowNew((v) => !v)}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={showNew ? "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" : "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"} /></svg>
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2 flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.div key={i} className="h-1 flex-1 rounded-full" animate={{ backgroundColor: i < strength ? strengthColor(strength) : "var(--border)", opacity: i < strength ? 1 : 0.45 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} />
                    ))}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {newPassword && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <label className="block text-sm font-medium text-[var(--fg)] mb-2">Confirm password</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Type password again" className="input" />
                    {confirmPassword && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`text-xs mt-1.5 flex items-center gap-1 ${passwordsMatch ? "text-[var(--teal,var(--green))]" : "text-[var(--rose)]"}`}>
                        {passwordsMatch ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>Passwords match</> : "Passwords do not match"}
                      </motion.p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {message && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`rounded-xl p-4 text-sm font-medium flex items-center gap-2 ${message.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"}`}>
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={message.type === "success" ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} /></svg>
                    {message.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button type="submit" disabled={saving} whileHover={buttonHover} whileTap={{ scale: 0.97 }} className="w-full btn btn-primary disabled:opacity-50 mt-5">
              {saving ? "Saving..." : "Save changes"}
            </motion.button>
          </form>
        </motion.div>
      </div>

      {/* SuperAdmin row: Test Email + System Settings side by side */}
      {isSuperAdmin && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Test Email */}
          <motion.div className="card-xl p-6 sm:p-8" variants={slideUpItem}>
            <h2 className="text-sm font-black uppercase tracking-wider mb-1" style={{ color: "var(--primary)" }}>Test Email</h2>
            <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>Send a test email to verify SMTP configuration.</p>

            <div className="space-y-3">
              <div className="flex items-center gap-0.5 rounded-xl border-[0.5px] p-0.5" style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)" }}>
                {EMAIL_TYPES.map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTestType(t)}
                    className={`px-2.5 py-1 rounded-[10px] text-xs font-medium transition-colors ${
                      testType === t
                        ? "bg-[var(--primary)] text-white shadow-sm"
                        : "text-[var(--fg-secondary)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="Recipient (leave empty for all admins)" className="input w-full" />
              <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={handleTestEmail} disabled={sendingTestEmail} className="w-full btn btn-primary disabled:opacity-50">
                {sendingTestEmail ? "Sending..." : "Send Test Email"}
              </motion.button>
            </div>
          </motion.div>

          <SystemSettingsSection />
        </div>
      )}

      {isSuperAdmin && <SystemSettingsDetailSection />}
    </motion.div>
  );
}

interface SysSettings {
  office: { latitude: number; longitude: number; radiusMeters: number };
  shiftDefaults: { start: string; end: string; breakMinutes: number; graceMinutes: number };
  company: { name: string; timezone: string };
}

const DEFAULTS: SysSettings = {
  office: { latitude: 31.4697, longitude: 74.2728, radiusMeters: 50 },
  shiftDefaults: { start: "10:00", end: "19:00", breakMinutes: 60, graceMinutes: 30 },
  company: { name: "Single Solution", timezone: "asia-karachi" },
};

function useSystemSettings() {
  const [settings, setSettings] = useState<SysSettings>(DEFAULTS);
  const [sysLoading, setSysLoading] = useState(true);
  const [sysSaving, setSysSaving] = useState(false);
  const [sysMsg, setSysMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.office) setSettings({ office: d.office, shiftDefaults: d.shiftDefaults, company: d.company });
      setSysLoading(false);
    }).catch(() => setSysLoading(false));
  }, []);

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

function SystemSettingsSection() {
  const { settings, setSettings, sysLoading, sysSaving, sysMsg, handleSave } = useSystemSettings();

  if (sysLoading) return null;

  return (
    <motion.div className="card-xl p-6 sm:p-8" variants={fadeInItem}>
      <h2 className="text-sm font-black uppercase tracking-wider mb-1" style={{ color: "var(--primary)" }}>System</h2>
      <p className="text-xs mb-4" style={{ color: "var(--fg-tertiary)" }}>Company name and timezone.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Company Name</label>
          <input className="input" value={settings.company.name} onChange={(e) => setSettings({ ...settings, company: { ...settings.company, name: e.target.value } })} />
        </div>
        <div>
          <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Timezone</label>
          <select className="input" value={settings.company.timezone} onChange={(e) => setSettings({ ...settings, company: { ...settings.company, timezone: e.target.value } })}>
            <option value="asia-karachi">Asia/Karachi (PKT +05:00)</option>
            <option value="utc">UTC</option>
            <option value="est">America/New_York (EST)</option>
          </select>
        </div>
        <AnimatePresence>
          {sysMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{sysMsg}</motion.p>}
        </AnimatePresence>
        <motion.button type="button" className="w-full btn btn-primary" whileHover={buttonHover} whileTap={{ scale: 0.97 }} disabled={sysSaving} onClick={handleSave}>{sysSaving ? "Saving..." : "Save"}</motion.button>
      </div>
    </motion.div>
  );
}

function SystemSettingsDetailSection() {
  const { settings, setSettings, sysLoading, sysSaving, sysMsg, handleSave } = useSystemSettings();

  if (sysLoading) return null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Office Location</h3>
        <p className="text-caption mb-4">Geofence center for automatic presence detection.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Latitude</label>
            <input className="input" type="number" step="any" value={settings.office.latitude} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, latitude: parseFloat(e.target.value) || 0 } })} />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Longitude</label>
            <input className="input" type="number" step="any" value={settings.office.longitude} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, longitude: parseFloat(e.target.value) || 0 } })} />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Radius (m)</label>
            <input className="input" type="number" value={settings.office.radiusMeters} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, radiusMeters: parseInt(e.target.value) || 50 } })} />
          </div>
        </div>
      </motion.section>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Shift Defaults</h3>
        <p className="text-caption mb-4">Default shift configuration for new employees.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Start Time</label>
            <input className="input" type="time" value={settings.shiftDefaults.start} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, start: e.target.value } })} />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>End Time</label>
            <input className="input" type="time" value={settings.shiftDefaults.end} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, end: e.target.value } })} />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Break (min)</label>
            <input className="input" type="number" value={settings.shiftDefaults.breakMinutes} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, breakMinutes: parseInt(e.target.value) || 60 } })} />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-[var(--fg)] mb-1" style={{ color: "var(--fg)" }}>Grace (min)</label>
            <input className="input" type="number" value={settings.shiftDefaults.graceMinutes} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, graceMinutes: parseInt(e.target.value) || 30 } })} />
          </div>
        </div>
        <AnimatePresence>
          {sysMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-sm font-medium" style={{ color: "var(--green)" }}>{sysMsg}</motion.p>}
        </AnimatePresence>
        <div className="flex justify-end gap-3 mt-4">
          <motion.button type="button" className="btn btn-secondary" whileHover={buttonHover} onClick={() => setSettings(DEFAULTS)}>Reset</motion.button>
          <motion.button type="button" className="btn btn-primary" whileHover={buttonHover} whileTap={{ scale: 0.97 }} disabled={sysSaving} onClick={handleSave}>{sysSaving ? "Saving..." : "Save"}</motion.button>
        </div>
      </motion.section>
    </div>
  );
}
