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

const ROLE_LABELS: Record<string, string> = { superadmin: "SuperAdmin", manager: "Manager", businessDeveloper: "Business Developer", developer: "Developer" };

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
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
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [profileImage, setProfileImage] = useState<string>("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((data) => {
      setProfile(data);
      setProfileForm({ firstName: data.about?.firstName ?? "", lastName: data.about?.lastName ?? "", phone: data.about?.phone ?? "" });
      setProfileImage(data.about?.profileImage ?? "");
      setLoading(false);
    });
  }, []);

  const avatarGradient = profile ? getAvatarGradient(`${profile.about.firstName}${profile.about.lastName}`) : AVATAR_GRADIENTS[0];

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setProfileMsg("Image must be under 2MB"); setTimeout(() => setProfileMsg(""), 3000); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setProfileImage(result);
    };
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
        body: JSON.stringify({ ...profileForm, profileImage }),
      });
      if (res.ok) {
        setProfileMsg("Profile updated!");
        const updated = await res.json();
        setProfile(updated);
        setProfileImage(updated.about?.profileImage ?? "");
      }
    } catch { /* ignore */ }
    setProfileSaving(false);
    setTimeout(() => setProfileMsg(""), 3000);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwError("");
    if (newPassword !== confirmPassword) { setPwError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setPwError("Password must be at least 6 characters"); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/profile/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await res.json();
      if (res.ok) {
        setPwMsg("Password changed!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPwError(data.error ?? "Failed to change password");
      }
    } catch { setPwError("Network error"); }
    setPwSaving(false);
    setTimeout(() => { setPwMsg(""); setPwError(""); }, 4000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="h-8 w-8 animate-spin" style={{ color: "var(--primary)" }} viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div variants={slideUpItem}>
        <h1 className="text-title"><span className="gradient-text">Settings</span></h1>
        <p className="text-subhead mt-1">Manage your profile and security</p>
      </motion.div>

      {/* Profile card */}
      <motion.div className="card-xl p-5 sm:p-6" variants={slideUpItem}>
        <h2 className="text-headline mb-4">Profile Information</h2>

        <div className="mb-5 flex items-center gap-4">
          <div className="relative group">
            {profileImage ? (
              <img src={profileImage} alt="Profile" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
            ) : (
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white ${avatarGradient}`}>
                {(profile?.about.firstName?.[0] ?? "")}{(profile?.about.lastName?.[0] ?? "")}
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
          <div>
            <p className="text-headline">{profile?.about.firstName} {profile?.about.lastName}</p>
            <p className="text-caption" style={{ color: "var(--fg-tertiary)" }}>{ROLE_LABELS[profile?.userRole ?? ""] ?? profile?.userRole} — {profile?.department?.title ?? "No department"}</p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>First Name</label>
              <input type="text" required value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} className="input" />
            </div>
            <div>
              <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Last Name</label>
              <input type="text" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} className="input" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Email</label>
              <input type="email" disabled value={profile?.email ?? ""} className="input opacity-60" />
            </div>
            <div>
              <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Phone</label>
              <input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="input" placeholder="+92 xxx xxxxxxx" />
            </div>
          </div>

          <AnimatePresence>
            {profileMsg && <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{profileMsg}</motion.p>}
          </AnimatePresence>

          <motion.button type="submit" disabled={profileSaving} whileHover={buttonHover} whileTap={{ scale: 0.97 }} className="btn btn-primary w-full disabled:opacity-50">
            {profileSaving ? "Saving..." : "Save changes"}
          </motion.button>
        </form>
      </motion.div>

      {/* Security card */}
      <motion.div className="card-xl p-5 sm:p-6" variants={slideUpItem}>
        <h2 className="text-headline mb-4">Security</h2>

        <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-caption font-semibold" style={{ color: "var(--fg)" }}>
              <svg className="h-4 w-4" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
              Current password
            </label>
            <div className="relative">
              <input type={showCurrent ? "text" : "password"} required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input pr-12" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-secondary)" }} onClick={() => setShowCurrent((v) => !v)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={showCurrent ? "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" : "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"} /></svg>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-2 text-caption font-semibold" style={{ color: "var(--fg)" }}>
              <svg className="h-4 w-4" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H3v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
              New password
            </label>
            <div className="relative">
              <input type={showNew ? "text" : "password"} required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input pr-12" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg-secondary)" }} onClick={() => setShowNew((v) => !v)}>
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

          <div>
            <label className="mb-1.5 flex items-center gap-2 text-caption font-semibold" style={{ color: "var(--fg)" }}>
              <svg className="h-4 w-4" style={{ color: "var(--fg-tertiary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Confirm password
            </label>
            <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" />
            {confirmPassword && (
              <p className="mt-1 text-xs font-medium" style={{ color: passwordsMatch ? "var(--green)" : "var(--rose)" }}>
                {passwordsMatch ? "✓ Passwords match" : "✕ Passwords do not match"}
              </p>
            )}
          </div>

          <AnimatePresence>
            {pwMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{pwMsg}</motion.p>}
            {pwError && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--rose)" }}>{pwError}</motion.p>}
          </AnimatePresence>

          <motion.button type="submit" disabled={pwSaving || !passwordsMatch} whileHover={buttonHover} whileTap={{ scale: 0.97 }} className="btn btn-primary w-full disabled:opacity-50">
            {pwSaving ? "Changing..." : "Change password"}
          </motion.button>
        </form>
      </motion.div>

      {/* SuperAdmin System Settings */}
      {isSuperAdmin && <SystemSettingsSection />}
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

function SystemSettingsSection() {
  const [settings, setSettings] = useState<SysSettings>(DEFAULTS);
  const [sysLoading, setSysLoading] = useState(true);
  const [sysSaving, setSysSaving] = useState(false);
  const [sysMsg, setSysMsg] = useState("");
  const [emailTestType, setEmailTestType] = useState("invite");
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestMsg, setEmailTestMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.office) setSettings({ office: d.office, shiftDefaults: d.shiftDefaults, company: d.company });
      setSysLoading(false);
    }).catch(() => setSysLoading(false));
  }, []);

  async function handleSave() {
    setSysSaving(true);
    setSysMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSysMsg("Settings saved!");
        setTimeout(() => setSysMsg(""), 3000);
      }
    } catch { /* ignore */ }
    setSysSaving(false);
  }

  function handleReset() {
    setSettings(DEFAULTS);
  }

  if (sysLoading) return null;

  return (
    <motion.div className="flex flex-col gap-4" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div variants={slideUpItem}>
        <h2 className="text-title mt-2"><span className="gradient-text">System Settings</span></h2>
        <p className="text-subhead mt-1">Configure organization-wide defaults</p>
      </motion.div>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Office Location</h3>
        <p className="text-caption mb-4">Geofence center for automatic presence detection.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Latitude</label>
            <input className="input" type="number" step="any" value={settings.office.latitude} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, latitude: parseFloat(e.target.value) || 0 } })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Longitude</label>
            <input className="input" type="number" step="any" value={settings.office.longitude} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, longitude: parseFloat(e.target.value) || 0 } })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Radius (meters)</label>
            <input className="input" type="number" value={settings.office.radiusMeters} onChange={(e) => setSettings({ ...settings, office: { ...settings.office, radiusMeters: parseInt(e.target.value) || 50 } })} />
          </div>
        </div>
      </motion.section>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Shift Defaults</h3>
        <p className="text-caption mb-4">Default shift configuration for new employees.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Start Time</label>
            <input className="input" type="time" value={settings.shiftDefaults.start} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, start: e.target.value } })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>End Time</label>
            <input className="input" type="time" value={settings.shiftDefaults.end} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, end: e.target.value } })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Break (min)</label>
            <input className="input" type="number" value={settings.shiftDefaults.breakMinutes} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, breakMinutes: parseInt(e.target.value) || 60 } })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Grace Period (min)</label>
            <input className="input" type="number" value={settings.shiftDefaults.graceMinutes} onChange={(e) => setSettings({ ...settings, shiftDefaults: { ...settings.shiftDefaults, graceMinutes: parseInt(e.target.value) || 30 } })} />
          </div>
        </div>
      </motion.section>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>System</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Company Name</label>
            <input className="input" value={settings.company.name} onChange={(e) => setSettings({ ...settings, company: { ...settings.company, name: e.target.value } })} />
          </div>
          <div>
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Timezone</label>
            <select className="input" value={settings.company.timezone} onChange={(e) => setSettings({ ...settings, company: { ...settings.company, timezone: e.target.value } })}>
              <option value="asia-karachi">Asia/Karachi (PKT +05:00)</option>
              <option value="utc">UTC</option>
              <option value="est">America/New_York (EST)</option>
            </select>
          </div>
        </div>
      </motion.section>

      <AnimatePresence>
        {sysMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{sysMsg}</motion.p>}
      </AnimatePresence>

      <div className="flex justify-end gap-3">
        <motion.button type="button" className="btn btn-secondary" whileHover={buttonHover} onClick={handleReset}>Reset to defaults</motion.button>
        <motion.button type="button" className="btn btn-primary" whileHover={buttonHover} whileTap={{ scale: 0.97 }} disabled={sysSaving} onClick={handleSave}>{sysSaving ? "Saving..." : "Save Settings"}</motion.button>
      </div>

      <motion.section className="card-static p-5" variants={fadeInItem}>
        <h3 className="text-headline mb-4" style={{ color: "var(--fg)" }}>Email Testing</h3>
        <p className="text-caption mb-4">Send a test email to verify SMTP configuration.</p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-caption mb-1 block font-semibold" style={{ color: "var(--fg)" }}>Template</label>
            <select className="input" value={emailTestType} onChange={(e) => setEmailTestType(e.target.value)}>
              <option value="invite">Welcome / Invite</option>
              <option value="reset">Password Reset</option>
              <option value="alert">Attendance Alert</option>
            </select>
          </div>
          <motion.button type="button" className="btn btn-primary btn-sm" whileHover={buttonHover} disabled={emailTestLoading} onClick={async () => {
            setEmailTestLoading(true);
            setEmailTestMsg("");
            try {
              const res = await fetch(`/api/test-email?type=${emailTestType}`);
              const data = await res.json();
              setEmailTestMsg(data.message ?? "Done");
            } catch { setEmailTestMsg("Network error"); }
            setEmailTestLoading(false);
            setTimeout(() => setEmailTestMsg(""), 5000);
          }}>
            {emailTestLoading ? "Sending..." : "Send Test"}
          </motion.button>
        </div>
        <AnimatePresence>
          {emailTestMsg && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 text-sm font-medium" style={{ color: emailTestMsg.includes("not") ? "var(--rose)" : "var(--green)" }}>{emailTestMsg}</motion.p>}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}
