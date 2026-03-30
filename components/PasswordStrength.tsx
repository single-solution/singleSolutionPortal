"use client";

import { motion } from "framer-motion";

function getStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "#ff375f" };
  if (score <= 2) return { score, label: "Fair", color: "#ff9f0a" };
  if (score <= 3) return { score, label: "Good", color: "#ffd60a" };
  if (score <= 4) return { score, label: "Strong", color: "#30d158" };
  return { score, label: "Excellent", color: "#30d158" };
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = getStrength(password);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2"
    >
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.div
            key={i}
            className="h-1 flex-1 rounded-full"
            initial={{ scaleX: 0 }}
            animate={{
              scaleX: 1,
              backgroundColor: i <= score ? color : "rgba(0,0,0,0.06)",
            }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            style={{ originX: 0 }}
          />
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-xs font-medium"
        style={{ color }}
      >
        {label}
      </motion.p>
    </motion.div>
  );
}
