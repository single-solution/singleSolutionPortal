"use client";

import { Toaster } from "react-hot-toast";

export function ToasterProvider() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3000,
        style: {
          background: "var(--bg-elevated)",
          color: "var(--fg)",
          borderRadius: "12px",
          boxShadow: "var(--glass-shadow)",
          fontSize: "14px",
          padding: "12px 16px",
          border: "0.5px solid var(--glass-border)",
        },
        success: { iconTheme: { primary: "#30d158", secondary: "#fff" } },
        error: { iconTheme: { primary: "#ff375f", secondary: "#fff" } },
      }}
    />
  );
}
