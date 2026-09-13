import { listen } from "@tauri-apps/api/event";
import { useCallback, useSyncExternalStore } from "react";
import { desktopHost, hasDesktopHost, type HostPreferences } from "../lib/desktop-host";

const listeners = new Set<() => void>();
let memoryValue = hasDesktopHost;
let loading: Promise<void> | undefined;

function notify(value: boolean) {
  memoryValue = value;
  for (const listener of listeners) listener();
}

function refresh() {
  if (!hasDesktopHost || loading) return loading;
  loading = desktopHost.preferences()
    .then((preferences) => notify(preferences.amountsHidden))
    .catch(() => notify(true))
    .finally(() => { loading = undefined; });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void refresh();
  let disposed = false;
  let unlisten: (() => void) | undefined;
  if (hasDesktopHost) {
    void listen<HostPreferences>("kora:host-preferences-changed", ({ payload }) => {
      notify(payload.amountsHidden);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
  }
  return () => {
    disposed = true;
    listeners.delete(listener);
    unlisten?.();
  };
}

function write(value: boolean) {
  if (!hasDesktopHost) {
    notify(value);
    return;
  }
  notify(value);
  void desktopHost.setAmountsHidden(value)
    .then((preferences) => notify(preferences.amountsHidden))
    .catch(() => notify(true));
}

/** Native-host presentation preference shared by Money and cross-Life summaries. */
export function useAmountPrivacy() {
  const hidden = useSyncExternalStore(subscribe, () => memoryValue, () => true);
  return {
    amountsHidden: hidden,
    setAmountsHidden: useCallback((value: boolean) => write(value), []),
    toggleAmounts: useCallback(() => write(!memoryValue), []),
  };
}
