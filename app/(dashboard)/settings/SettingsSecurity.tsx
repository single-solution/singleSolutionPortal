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

function strengthColor(s: number) {
  if (s <= 1) return "var(--rose)";
  if (s <= 2) return "var(--amber)";
  if (s <= 3) return "var(--amber)";
  return "var(--green)";
}

export interface SettingsSecurityProps {
  email: string;
  newEmail: string;
  onNewEmailChange: (value: string) => void;
  currentPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  showCurrent: boolean;
  onToggleShowCurrent: () => void;
  showNew: boolean;
  onToggleShowNew: () => void;
  saving: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onAccountSubmit: (e: React.FormEvent) => void;
  strength: number;
  passwordsMatch: boolean;
}

export function SettingsSecurity({
  email,
  newEmail,
  onNewEmailChange,
  currentPassword,
  onCurrentPasswordChange,
  newPassword,
  onNewPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  showCurrent,
  onToggleShowCurrent,
  showNew,
  onToggleShowNew,
  saving,
  message,
  onAccountSubmit,
  strength,
  passwordsMatch,
}: SettingsSecurityProps) {
  return (
    <FadeUp delay={0.14}>
      <form onSubmit={onAccountSubmit} className="card-xl p-6 sm:p-8 h-full flex flex-col" data-tour="settings-security">
        <h2 className="text-headline mb-4">Email & Password</h2>
        <div className="space-y-5 flex-1">
          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Current password</label>
            <div className="relative">
              <input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => onCurrentPasswordChange(e.target.value)} placeholder="Required to confirm changes" className="input pr-12" required />
              <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)] hover:bg-[var(--hover-bg)] transition-colors" onClick={onToggleShowCurrent}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={showCurrent ? "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" : "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"} /></svg>
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--border)]" />

          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">New email</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-tertiary)]"><svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></span>
              <input type="email" value={newEmail} onChange={(e) => onNewEmailChange(e.target.value)} placeholder="admin@company.com" className="input" style={{ paddingLeft: "40px" }} />
            </div>
            {newEmail.trim() && newEmail.toLowerCase() !== email.toLowerCase() && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-[var(--primary)] mt-1.5">Email will change from {email}</motion.p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">New password</label>
            <div className="relative">
              <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => onNewPasswordChange(e.target.value)} placeholder="Leave blank to keep current" className="input pr-12" />
              <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)] hover:bg-[var(--hover-bg)] transition-colors" onClick={onToggleShowNew}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={showNew ? "M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" : "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z"} /></svg>
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 flex gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    className="h-1 flex-1 rounded-full"
                    animate={{ backgroundColor: i < strength ? strengthColor(strength) : "var(--border)", opacity: i < strength ? 1 : 0.45 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28, delay: i * 0.05 }}
                  />
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {newPassword && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1">Confirm password</label>
                <input type="password" value={confirmPassword} onChange={(e) => onConfirmPasswordChange(e.target.value)} placeholder="Type password again" className="input" />
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
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border p-4 text-sm font-medium flex items-center gap-2"
                style={
                  message.type === "success"
                    ? {
                        background: "color-mix(in srgb, var(--green) 10%, transparent)",
                        borderColor: "color-mix(in srgb, var(--green) 28%, transparent)",
                        color: "color-mix(in srgb, var(--green) 42%, var(--fg))",
                      }
                    : {
                        background: "color-mix(in srgb, var(--rose) 10%, transparent)",
                        borderColor: "color-mix(in srgb, var(--rose) 28%, transparent)",
                        color: "color-mix(in srgb, var(--rose) 42%, var(--fg))",
                      }
                }
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={message.type === "success" ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} /></svg>
                {message.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full btn btn-primary disabled:opacity-50 mt-5">
          {saving ? "Saving…" : "Save changes"}
        </motion.button>
      </form>
    </FadeUp>
  );
}
