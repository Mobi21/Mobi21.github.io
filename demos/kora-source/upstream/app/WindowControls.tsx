import { useEffect, useState } from "react";
import { hasDesktopHost } from "../lib/desktop-host";

/**
 * Windows caption controls, drawn by Kora.
 *
 * `decorations: false` in tauri.conf.json removes the OS title bar, which used
 * to stack a Windows-styled band on top of a Kora-styled one — ~104px of chrome
 * in two visually unrelated pieces before any content.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!hasDesktopHost) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const sync = async () => {
        const value = await appWindow.isMaximized();
        if (!cancelled) setMaximized(value);
      };
      await sync();
      unlisten = await appWindow.onResized(() => void sync());
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (!hasDesktopHost) return null;

  const act = async (action: "minimize" | "toggleMaximize" | "close") => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    if (action === "minimize") return appWindow.minimize();
    if (action === "toggleMaximize") return appWindow.toggleMaximize();
    return appWindow.close();
  };

  return (
    <div className="window-controls">
      <button type="button" aria-label="Minimise" onClick={() => void act("minimize")}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximise"}
        onClick={() => void act("toggleMaximize")}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none">
            <path d="M2.5 2.5h5v5h-5z" stroke="currentColor" strokeWidth="1" />
            <path d="M2.5 0.5h5v2M9.5 2.5v5h-2" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none">
            <path d="M0.5 0.5h9v9h-9z" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button type="button" className="window-controls__close" aria-label="Close" onClick={() => void act("close")}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
