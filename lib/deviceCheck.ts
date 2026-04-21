// eslint-disable-next-line @typescript-eslint/no-require-imports
const UAParser = require("ua-parser-js") as (ua: string) => { os: { name?: string; version?: string }; browser: { name?: string }; device: { type?: string } };

export interface DeviceCheckBody {
  screenWidth?: number;
  screenHeight?: number;
  devicePixelRatio?: number;
  maxTouchPoints?: number;
  platform?: string;
}

type Verdict = "desktop" | "mobile" | "suspicious";

interface SignalResult {
  verdict: Verdict;
  detail: string;
}

export interface DeviceCheckResult {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
  signals: {
    ua: SignalResult;
    clientHints: SignalResult;
    screen: SignalResult;
  };
}

const DESKTOP_OS_ALLOW = ["windows", "mac os", "macos", "linux", "chrome os", "chromium os"];
const MOBILE_OS_BLOCK = ["android", "ios", "ipados", "windows phone", "harmonyos", "kaios"];

const MOBILE_UA_PATTERNS = /Android|iPhone|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i;

const MIN_DESKTOP_SCREEN_SHORT_SIDE = 500;
const MIN_DESKTOP_SCREEN_LONG_SIDE = 1200;

function analyzeUserAgent(uaHeader: string | null): SignalResult {
  if (!uaHeader) {
    return { verdict: "suspicious", detail: "No User-Agent header present" };
  }

  if (MOBILE_UA_PATTERNS.test(uaHeader)) {
    return { verdict: "mobile", detail: `UA contains mobile pattern: ${uaHeader.slice(0, 120)}` };
  }

  const result = UAParser(uaHeader);
  const os = result.os;
  const osName = (os.name || "").toLowerCase();

  if (MOBILE_OS_BLOCK.some((m) => osName.includes(m))) {
    return { verdict: "mobile", detail: `OS detected as mobile: ${os.name}` };
  }

  if (DESKTOP_OS_ALLOW.some((d) => osName.includes(d))) {
    return { verdict: "desktop", detail: `OS detected as desktop: ${os.name}` };
  }

  return { verdict: "suspicious", detail: `Unknown OS: ${os.name || "undetectable"}` };
}

function analyzeClientHints(headers: Headers): SignalResult {
  const mobile = headers.get("sec-ch-ua-mobile");
  const platform = headers.get("sec-ch-ua-platform");

  if (!mobile && !platform) {
    return { verdict: "suspicious", detail: "No Client Hints headers (browser may not support them)" };
  }

  if (mobile === "?1") {
    return { verdict: "mobile", detail: "Sec-CH-UA-Mobile: ?1 (mobile device)" };
  }

  if (platform) {
    const cleanPlatform = platform.replace(/"/g, "").toLowerCase();
    if (cleanPlatform === "android" || cleanPlatform === "ios") {
      return { verdict: "mobile", detail: `Sec-CH-UA-Platform: ${platform}` };
    }
    if (["windows", "macos", "linux", "chrome os"].includes(cleanPlatform)) {
      if (mobile === "?0") {
        return { verdict: "desktop", detail: `Platform: ${platform}, Mobile: ?0` };
      }
      return { verdict: "desktop", detail: `Platform: ${platform}` };
    }
  }

  if (mobile === "?0") {
    return { verdict: "desktop", detail: "Sec-CH-UA-Mobile: ?0 (not mobile)" };
  }

  return { verdict: "suspicious", detail: `Ambiguous hints: mobile=${mobile}, platform=${platform}` };
}

function analyzeScreenMetrics(body: DeviceCheckBody, uaOsName: string): SignalResult {
  const { screenWidth, screenHeight, devicePixelRatio, maxTouchPoints, platform } = body;

  const isMacUA = /mac\s?os|macos/i.test(uaOsName);
  if (isMacUA && maxTouchPoints != null && maxTouchPoints > 0) {
    return { verdict: "mobile", detail: `macOS UA with maxTouchPoints=${maxTouchPoints} (iPad)` };
  }

  if (isMacUA && maxTouchPoints == null) {
    return { verdict: "suspicious", detail: "macOS UA but maxTouchPoints not provided (possible iPad)" };
  }

  if (screenWidth == null || screenHeight == null) {
    return { verdict: "suspicious", detail: "Screen dimensions not provided" };
  }

  const shortSide = Math.min(screenWidth, screenHeight);
  const longSide = Math.max(screenWidth, screenHeight);

  if (shortSide < MIN_DESKTOP_SCREEN_SHORT_SIDE) {
    return { verdict: "mobile", detail: `Screen short side ${shortSide}px (phone-sized)` };
  }

  const dpr = devicePixelRatio ?? 1;
  const physicalShort = shortSide / dpr;
  if (physicalShort < 300) {
    return { verdict: "mobile", detail: `Physical short side ~${Math.round(physicalShort)}px after DPR correction` };
  }

  if (longSide < MIN_DESKTOP_SCREEN_LONG_SIDE && (maxTouchPoints ?? 0) > 0) {
    const platformLower = (platform || "").toLowerCase();
    if (!platformLower.includes("win")) {
      return { verdict: "mobile", detail: `Small screen (${screenWidth}x${screenHeight}) + touch + non-Windows` };
    }
  }

  if (shortSide >= MIN_DESKTOP_SCREEN_SHORT_SIDE && longSide >= MIN_DESKTOP_SCREEN_LONG_SIDE) {
    return { verdict: "desktop", detail: `Screen ${screenWidth}x${screenHeight} is desktop-sized` };
  }

  return { verdict: "suspicious", detail: `Borderline screen ${screenWidth}x${screenHeight}, touch=${maxTouchPoints}` };
}

export function checkDevice(req: Request, body: DeviceCheckBody): DeviceCheckResult {
  const headers = new Headers(req.headers);
  const uaHeader = headers.get("user-agent");

  const parsed = UAParser(uaHeader || "");
  const osName = parsed.os.name || "";

  const uaSignal = analyzeUserAgent(uaHeader);
  const hintsSignal = analyzeClientHints(headers);
  const screenSignal = analyzeScreenMetrics(body, osName);

  const signals = { ua: uaSignal, clientHints: hintsSignal, screen: screenSignal };

  if (uaSignal.verdict === "mobile" || hintsSignal.verdict === "mobile" || screenSignal.verdict === "mobile") {
    return {
      allowed: false,
      flagged: false,
      reason: [uaSignal, hintsSignal, screenSignal]
        .filter((s) => s.verdict === "mobile")
        .map((s) => s.detail)
        .join("; "),
      signals,
    };
  }

  const suspiciousCount = [uaSignal, hintsSignal, screenSignal].filter((s) => s.verdict === "suspicious").length;

  if (suspiciousCount >= 2) {
    return {
      allowed: true,
      flagged: true,
      reason: "Multiple suspicious signals — flagged for review",
      signals,
    };
  }

  return { allowed: true, flagged: false, signals };
}
