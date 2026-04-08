"use client";

import { createContext, useContext } from "react";

const LiveCtx = createContext(false);

export function LiveProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <LiveCtx.Provider value={enabled}>{children}</LiveCtx.Provider>;
}

export function useLive() {
  return useContext(LiveCtx);
}
