import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CanvasPageHeader, ViewBarProvider } from "../app/ViewBar";

function BrainCanvasHeader() {
  const location = useLocation();
  return location.pathname.startsWith("/brain") ? <CanvasPageHeader /> : null;
}

/**
 * Wraps a workspace in the shell pieces it now depends on.
 *
 * Product panes own their route heading inside the canvas. This wrapper retains
 * the shell contribution provider for Agent framing and the remaining Life
 * utility migration boundary without adding another page identity band.
 */
export function ShellHarness({ children }: { children: ReactNode }) {
  return (
    <ViewBarProvider>
      <BrainCanvasHeader />
      {children}
    </ViewBarProvider>
  );
}
