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
  // Fake GPS extensions typically report accuracy as exactly 0 or omit it.
  // Real GPS (even high-end dual-frequency) always reports > 0.
  if (accuracy != null && accuracy === 0) {
    reasons.push("GPS accuracy is zero (mock GPS signature)");
  }

  // Layer 2 — Teleportation (impossible speed between heartbeats)
  if (prevLat != null && prevLng != null && prevTime) {
    const distMeters = haversineMeters(prevLat, prevLng, lat, lng);
    const elapsedSec = Math.max(1, (now.getTime() - prevTime.getTime()) / 1000);
    const speedMs = distMeters / elapsedSec;
    if (speedMs > 55) {
      reasons.push("Impossible location jump detected");
    }
  }

  // Layer 3 — Zero variance (identical coords across many heartbeats)
  // Browser GPS caching (maximumAge: 30s) makes 3-5 identical readings normal
  // when stationary. Only flag at 8+ which is ~4 minutes of zero drift — real
  // GPS always has micro-drift even when sitting still.
  if (consecutiveIdentical >= 8) {
    reasons.push("Location has not changed across multiple readings");
  }

  // Layer 4 — Round / low-precision coordinates
  // Real GPS provides 6-8 raw decimal places. Manually entered or crude mocks
  // have 1-2 decimals (e.g. 31.47). JavaScript toString() already strips
  // trailing zeros, so we use a lenient threshold of < 3 significant decimals.
  const latDecimals = significantDecimals(lat);
  const lngDecimals = significantDecimals(lng);
  if (latDecimals < 3 || lngDecimals < 3) {
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
