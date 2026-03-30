"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  slideUpItem,
  staggerContainer,
  buttonHover,
  fadeInItem,
} from "@/lib/motion";

function getPasswordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 4) score++;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(5, score);
}

function strengthColor(strength: number): string {
  if (strength <= 1) return "var(--rose)";
  if (strength === 2) return "var(--amber)";
  if (strength === 3) return "var(--primary)";
  return "var(--teal)";
}

export default function LoginPreview() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  return (
    <div
      className="aurora-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ minHeight: "100dvh" }}
    >
      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <div className="card-xl relative w-full overflow-hidden p-8 sm:p-10">
          {/* Animated top accent — matches inventory app */}
          <motion.div
            className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-[var(--primary)] via-[var(--purple)] to-[var(--teal)]"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ originX: 0 }}
          />

          <motion.div
            className="relative z-10 flex flex-col gap-8"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              className="flex flex-col items-center gap-3 text-center"
              variants={slideUpItem}
            >
              <motion.div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--cyan) 100%)" }}
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
              >
                <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </motion.div>
              <h1 className="gradient-text-animated text-title">
                Single Solution Sync
              </h1>
              <p className="text-subhead">Employee Presence System</p>
            </motion.div>

            <motion.div
              className="flex flex-col gap-1 text-center"
              variants={slideUpItem}
            >
              <p className="text-headline">Welcome back</p>
              <p className="text-subhead">Sign in to continue</p>
            </motion.div>

            <motion.div className="flex flex-col gap-5" variants={slideUpItem}>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="preview-email"
                  className="text-callout font-semibold"
                  style={{ color: "var(--fg)" }}
                >
                  Email
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 sm:left-4"
                    aria-hidden
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--fg-tertiary)"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <path d="m22 6-10 7L2 6" />
                    </svg>
                  </span>
                  <input
                    id="preview-email"
                    type="email"
                    autoComplete="email"
                    placeholder="your@email.com"
                    className="input pl-10 sm:pl-12"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="preview-password"
                  className="text-callout font-semibold"
                  style={{ color: "var(--fg)" }}
                >
                  Password
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 sm:left-4"
                    aria-hidden
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--fg-tertiary)"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="3"
                        y="11"
                        width="18"
                        height="11"
                        rx="2"
                        ry="2"
                      />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="preview-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    className="input pl-10 pr-12 sm:pl-12 sm:pr-14"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg transition-colors sm:right-3"
                    style={{ color: "var(--fg-secondary)" }}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="mt-1 flex gap-1.5" role="presentation">
                  {[0, 1, 2, 3, 4].map((i) => {
                    const active = i < strength;
                    return (
                      <motion.div
                        key={i}
                        className="h-1 min-h-[4px] flex-1 rounded-full"
                        initial={false}
                        animate={{
                          backgroundColor: active
                            ? strengthColor(strength)
                            : "var(--border)",
                          opacity: active ? 1 : 0.45,
                          scaleY: active ? 1 : 0.65,
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 28,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <a
                  href="#"
                  className="text-caption transition-opacity hover:opacity-80"
                  style={{ color: "var(--primary)" }}
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot password?
                </a>
              </div>
            </motion.div>

            <motion.div variants={slideUpItem} className="w-full">
              <motion.button
                type="button"
                className="btn btn-primary relative w-full overflow-hidden"
                whileHover={{ scale: 1.02, boxShadow: "0 8px 30px rgba(0,113,227,0.35)" }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="flex items-center gap-2">
                  Sign in
                  <motion.svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    animate={{ x: [0, 3, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </motion.svg>
                </span>
              </motion.button>
            </motion.div>

            <motion.footer
              className="flex flex-col gap-4 pt-1"
              variants={fadeInItem}
            >
              <hr className="divider w-full border-0" />
              <p className="text-center text-callout" style={{ color: "var(--fg-secondary)" }}>
                Don&apos;t have an account?{" "}
                <a
                  href="#"
                  className="font-semibold transition-opacity hover:opacity-80"
                  style={{ color: "var(--primary)" }}
                  onClick={(e) => e.preventDefault()}
                >
                  Contact admin
                </a>
              </p>
              <p className="text-caption text-center">
                Single Solution © 2026
              </p>
            </motion.footer>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
