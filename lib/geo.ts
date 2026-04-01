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

export async function isInOffice(latitude?: number, longitude?: number): Promise<boolean> {
  if (latitude == null || longitude == null) return false;
  const config = await getOfficeConfig();
  return haversineMeters(latitude, longitude, config.lat, config.lng) <= config.radius;
}
