"use client";

import { signIn } from "next-auth/react";
import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, slideUpItem, fadeInItem } from "@/lib/motion";
import { Suspense } from "react";

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (res?.error) {
      setError("Invalid email or password");
      setShakeKey((k) => k + 1);
      setLoading(false);
      return;
    }

    if (res?.url) {
      router.replace(res.url);
      return;
    }
    setLoading(false);
  }

  return (
    <div
      className="aurora-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ minHeight: "100dvh" }}
    >
      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <motion.div
          key={shakeKey}
          initial={{ opacity: 0, y: 20 }}
          animate={
            error
              ? { x: [0, -10, 10, -10, 10, 0], opacity: 1, y: 0 }
              : { opacity: 1, y: 0 }
          }
          transition={
            error
              ? {
                  x: { duration: 0.4 },
                  opacity: { duration: 0.6 },
                  y: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
                }
              : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
          }
          className="card-xl relative w-full overflow-hidden p-8 sm:p-10"
        >
          <motion.div
            className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-[var(--primary)] via-[var(--purple)] to-[var(--teal)]"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{
              duration: 0.8,
              delay: 0.3,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{ originX: 0 }}
          />

          <motion.form onSubmit={handleSubmit}>
            <motion.div
              className="relative z-10 flex flex-col gap-8"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {/* Hero: icon + title + subtitle */}
              <motion.div
                className="flex flex-col items-center gap-3 text-center"
                variants={slideUpItem}
              >
                <motion.div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--primary) 0%, var(--cyan) 100%)",
                  }}
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.1,
                  }}
                >
                  <svg
                    className="h-7 w-7 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </motion.div>
                <h1 className="gradient-text-animated text-title">
                  Single Solution Sync
                </h1>
                <p className="text-subhead">Employee Presence System</p>
              </motion.div>

              {/* Welcome block */}
              <motion.div
                className="flex flex-col gap-1 text-center"
                variants={slideUpItem}
              >
                <p className="text-headline">Welcome back</p>
                <p className="text-subhead">Sign in to continue</p>
              </motion.div>

              {/* Form fields */}
              <motion.div
                className="flex flex-col gap-5"
                variants={slideUpItem}
              >
                {/* Email */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="login-email"
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
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="your@email.com"
                      className="input pl-10 sm:pl-12"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="login-password"
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
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter password"
                      className="input pl-10 pr-12 sm:pl-12 sm:pr-14"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 z-[1] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg transition-colors sm:right-3"
                      style={{ color: "var(--fg-secondary)" }}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>

                  {/* Password strength meter */}
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
                  <Link
                    href="/forgot-password"
                    className="text-caption transition-opacity hover:opacity-80"
                    style={{ color: "var(--primary)" }}
                  >
                    Forgot password?
                  </Link>
                </div>
              </motion.div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3"
                  >
                    <svg
                      className="h-4 w-4 shrink-0"
                      style={{ color: "var(--rose)" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm font-medium" style={{ color: "var(--rose)" }}>
                      {error}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              <motion.div variants={slideUpItem} className="w-full">
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{
                    scale: 1.02,
                    boxShadow: "0 8px 30px rgba(0,113,227,0.35)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="btn btn-primary relative w-full overflow-hidden disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign in
                      <motion.svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        animate={{ x: [0, 3, 0] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </motion.svg>
                    </span>
                  )}
                </motion.button>
              </motion.div>

              <motion.footer
                className="flex flex-col gap-4 pt-1"
                variants={fadeInItem}
              >
                <hr className="divider w-full border-0" />
                <p className="text-caption text-center">
                  Single Solution © 2026
                </p>
              </motion.footer>
            </motion.div>
          </motion.form>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="shimmer h-[480px] w-full max-w-md rounded-3xl" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
