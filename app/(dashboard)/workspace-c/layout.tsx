"use client";

import { useEffect } from "react";
import { useGuide } from "@/lib/useGuide";
import { workspaceTour } from "@/lib/tourConfigs";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { registerTour } = useGuide();

  useEffect(() => {
    registerTour("workspace", workspaceTour);
  }, [registerTour]);

  return <>{children}</>;
}
