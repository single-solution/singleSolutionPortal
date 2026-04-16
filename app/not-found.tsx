import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        gap: 12,
      }}
    >
      <h1 style={{ fontSize: 72, fontWeight: 900, margin: 0, color: "#111827" }}>404</h1>
      <p style={{ fontSize: 16, color: "#6B7280", margin: 0 }}>Page not found</p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: "10px 24px",
          borderRadius: 12,
          background: "#DC2626",
          color: "white",
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
