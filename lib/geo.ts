import { connectDB } from "@/lib/db";

let cachedConfig: { lat: number; lng: number; radius: number } | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getOfficeConfig(): Promise<{ lat: number; lng: number; radius: number }> {
  if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) return cachedConfig;

  const envLat = parseFloat(process.env.OFFICE_LAT ?? "31.4763416");
  const envLng = parseFloat(process.env.OFFICE_LNG ?? "74.2687022");
  const envRadius = parseFloat(process.env.OFFICE_RADIUS_METERS ?? "300");

  try {
    await connectDB();
    const mongoose = await import("mongoose");
    const SystemSettings = mongoose.models.SystemSettings;
    if (SystemSettings) {
      const settings = await SystemSettings.findOne({ key: "global" }).lean() as Record<string, unknown> | null;
      if (settings?.office) {
        const office = settings.office as { latitude?: number; longitude?: number; radiusMeters?: number };
        cachedConfig = {
          lat: office.latitude ?? envLat,
          lng: office.longitude ?? envLng,
          radius: office.radiusMeters ?? envRadius,
        };
        cacheTime = Date.now();
        return cachedConfig;
      }
    }
  } catch { /* fall back to env */ }

  cachedConfig = { lat: envLat, lng: envLng, radius: envRadius };
  cacheTime = Date.now();
  return cachedConfig;
}

/* ── Fake-location detection ─────────────────────────────────────── */

export interface LocationValidation {
  flagged: boolean;
  reasons: string[];
}

export function validateLocation(
  lat: number,
  lng: number,
  accuracy: number | undefined,
  prevLat: number | undefined,
  prevLng: number | undefined,
  prevTime: Date | undefined,
  now: Date,
  consecutiveIdentical: number,
): LocationValidation {
  const reasons: string[] = [];

  // Layer 1 — Accuracy anomaly
  // Fake GPS extensions report accuracy as exactly 0.
  // Real geolocation (Wi-Fi triangulation on laptops, GPS on phones)
  // always reports > 0. Laptops typically report 20–200 m via Wi-Fi.
  if (accuracy != null && accuracy === 0) {
    reasons.push("GPS accuracy is zero (mock GPS signature)");
  }

  // Layer 2 — Teleportation (impossible speed between heartbeats)
  // Only checked within an active session. Sleep/wake creates a new
  // session, so location jumps from office→home don't trigger this.
  // Laptops use WiFi triangulation (accuracy 50–200 m) which can
  // jump significantly when networks change (office → home WiFi,
  // hotspot handoff, etc.). Use a generous threshold for WiFi to
  // avoid false positives while still catching clear spoofing.
  if (prevLat != null && prevLng != null && prevTime) {
    const distMeters = haversineMeters(prevLat, prevLng, lat, lng);
    const elapsedSec = Math.max(1, (now.getTime() - prevTime.getTime()) / 1000);
    const speedMs = distMeters / elapsedSec;
    const isWifi = accuracy != null && accuracy > 50;
    const threshold = isWifi ? 300 : 55;
    if (speedMs > threshold) {
      reasons.push("Impossible location jump detected");
    }
  }

  // Layer 3 — Zero variance: DISABLED for laptop-based tracking.
  // Laptops use Wi-Fi triangulation (not satellite GPS), which returns
  // the exact same coordinates as long as the same Wi-Fi networks are
  // visible. An employee at their desk will get byte-identical coords
  // for their entire workday. This layer was designed for phone GPS
  // micro-drift and is incompatible with laptop geolocation.
  // (consecutiveIdentical param kept for API compatibility but ignored)

  // Layer 4 — Round / low-precision coordinates
  // Wi-Fi triangulation on laptops typically gives 4-6 decimal places.
  // Only flag at < 2 to catch truly crude spoofs like "31.5, 74.3".
  const latDecimals = significantDecimals(lat);
  const lngDecimals = significantDecimals(lng);
  if (latDecimals < 2 || lngDecimals < 2) {
    reasons.push("Coordinates appear manually entered (low precision)");
  }

  return { flagged: reasons.length > 0, reasons };
}

function significantDecimals(n: number): number {
  const s = n.toString();
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  const frac = s.slice(dot + 1);
  // Count digits before trailing zeros
  const trimmed = frac.replace(/0+$/, "");
  return trimmed.length;
}

export async function isInOffice(latitude?: number, longitude?: number): Promise<boolean> {
  if (latitude == null || longitude == null) return false;
  const config = await getOfficeConfig();
  return haversineMeters(latitude, longitude, config.lat, config.lng) <= config.radius;
}
