"use client";

import { useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";

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

export interface SettingsProfileData {
  _id: string;
  email: string;
  username: string;
  about: { firstName: string; lastName: string; phone?: string; profileImage?: string };
  isSuperAdmin?: boolean;
  memberships?: Array<{ designation?: { name: string } | null }>;
  department?: { title: string };
}

export interface SettingsProfileProps {
  profile: SettingsProfileData | null;
  fullName: string;
  onFullNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  profileImage: string;
  onProfileImageChange: (value: string) => void;
  profileSaving: boolean;
  profileMsg: string;
  onProfileSubmit: (e: React.FormEvent) => void;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  avatarGradient: string;
}

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400", "from-emerald-500 to-teal-400",
  "from-purple-500 to-pink-400", "from-amber-500 to-orange-400",
  "from-rose-500 to-red-400",
];

export function getAvatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

export const SETTINGS_PROFILE_AVATAR_FALLBACK_GRADIENT = AVATAR_GRADIENTS[0];

function profileDesignationLabel(profile: SettingsProfileData | null | undefined): string | null {
  if (!profile) return null;
  if (profile.isSuperAdmin) return "System Administrator";
  const list = profile.memberships;
  if (list?.length) {
    for (const m of list) {
      const des = m.designation;
      if (des && typeof des === "object" && "name" in des && des.name) return des.name;
    }
  }
  return "Employee";
}

export function SettingsProfile({
  profile,
  fullName,
  onFullNameChange,
  phone,
  onPhoneChange,
  profileImage,
  onProfileImageChange,
  profileSaving,
  profileMsg,
  onProfileSubmit,
  onImageSelect,
  avatarGradient,
}: SettingsProfileProps) {
  const designationLabel = profileDesignationLabel(profile);
  return (
    <FadeUp delay={0.08} className="card-xl p-6 sm:p-8">
      <h2 data-tour="settings-profile" className="text-headline mb-4">Profile</h2>
      <div className="mb-5 flex items-center gap-4">
        <motion.div
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <div className="relative group h-14 w-14 shrink-0">
            <AnimatePresence mode="wait">
              {profileImage ? (
                <motion.img
                  key={profileImage}
                  src={profileImage}
                  alt="Profile"
                  className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.22, ease }}
                />
              ) : (
                <motion.div
                  key="initials"
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white ${avatarGradient}`}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.22, ease }}
                >
                  {fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </motion.div>
              )}
            </AnimatePresence>
            <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <input type="file" accept="image/*" className="hidden" onChange={onImageSelect} />
            </label>
            {profileImage && (
              <button type="button" className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-white text-xs opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "var(--rose)" }} onClick={() => onProfileImageChange("")}>×</button>
            )}
          </div>
        </motion.div>
        <div className="min-w-0">
          <p className="text-headline truncate">{fullName || "Unnamed"}</p>
          <p className="text-caption truncate" style={{ color: "var(--fg-tertiary)" }}>{profile?.email}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {profile?.username && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>@{profile.username}</span>
            )}
            {designationLabel && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>
                {designationLabel}
              </span>
            )}
            {profile?.department?.title && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}>{profile.department.title}</span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={onProfileSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Full Name</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]"><svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span>
            <input type="text" required value={fullName} onChange={(e) => onFullNameChange(e.target.value)} className="input" style={{ paddingLeft: "40px" }} placeholder="e.g. John Doe" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Phone</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]"><svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg></span>
            <input type="tel" value={phone} onChange={(e) => onPhoneChange(e.target.value)} className="input" style={{ paddingLeft: "40px" }} placeholder="+92 xxx xxxxxxx" />
          </div>
        </div>
        <AnimatePresence>
          {profileMsg && <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm font-medium" style={{ color: "var(--green)" }}>{profileMsg}</motion.p>}
        </AnimatePresence>
        <motion.button type="submit" disabled={profileSaving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full btn btn-primary disabled:opacity-50">
          {profileSaving ? "Saving..." : "Save profile"}
        </motion.button>
      </form>
    </FadeUp>
  );
}
