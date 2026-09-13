import { useEffect, useState } from "react";
import { Temporal } from "temporal-polyfill";

type CalendarClockOptions = {
  initialInstant?: string;
  now?: () => string;
  intervalMs?: number;
};

const readTemporalNow = () => Temporal.Now.instant().toString();

/**
 * Supplies the current instant to the Calendar and catches up when an idle
 * window becomes visible or focused again. The optional initial value keeps
 * rendered view tests deterministic without changing the production clock.
 */
export function useCalendarClock({ initialInstant, now = readTemporalNow, intervalMs = 60_000 }: CalendarClockOptions = {}) {
  const [nowInstant, setNowInstant] = useState(() => initialInstant ?? now());

  useEffect(() => {
    const update = () => setNowInstant(now());
    const timer = window.setInterval(update, intervalMs);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [initialInstant, intervalMs, now]);

  return nowInstant;
}
