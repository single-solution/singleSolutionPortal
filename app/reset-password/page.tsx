"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const emailParam = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: emailParam, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  if (!token || !emailParam) {
    return (
      <div className="aurora-bg flex min-h-screen items-center justify-center p-4" style={{ minHeight: "100dvh" }}>
        <div className="card-xl p-8 text-center">
          <h1 className="text-title mb-2" style={{ color: "var(--fg)" }}>Invalid Reset Link</h1>
          <p className="text-subhead mb-4">This link is invalid or has expired.</p>
          <Link href="/forgot-password" className="btn btn-primary">Request New Link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="aurora-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4" style={{ minHeight: "100dvh" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="card-xl relative w-full max-w-md overflow-hidden p-8 sm:p-10"
      >
        <motion.div
          className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-[var(--teal)] via-[var(--green)] to-[var(--cyan)]"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ originX: 0 }}
        />

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--green) 15%, transparent)" }}>
                <svg className="h-8 w-8" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-title" style={{ color: "var(--fg)" }}>Password Reset!</h1>
              <p className="text-subhead">Your password has been updated. You can now sign in.</p>
              <Link href="/login" className="btn btn-primary mt-2">Sign In</Link>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <motion.div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: "linear-gradient(135deg, var(--teal), var(--green))" }}
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                >
                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </motion.div>
                <h1 className="gradient-text text-title">New Password</h1>
                <p className="text-subhead">Choose a strong password for your account</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-callout font-semibold" style={{ color: "var(--fg)" }}>New Password</label>
                <input type="password" required minLength={8} placeholder="Min 8 characters" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-callout font-semibold" style={{ color: "var(--fg)" }}>Confirm Password</label>
                <input type="password" required minLength={8} placeholder="Repeat password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <svg className="h-4 w-4 shrink-0" style={{ color: "var(--rose)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-sm font-medium" style={{ color: "var(--rose)" }}>{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="btn btn-primary w-full disabled:opacity-50">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Resetting...
                  </span>
                ) : "Reset Password"}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="shimmer h-[480px] w-full max-w-md rounded-3xl" /></div>}>
      <ResetForm />
    </Suspense>
  );
}
