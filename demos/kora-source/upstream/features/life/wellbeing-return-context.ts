import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

const WELLBEING_RETURN_STATE = "wellbeingReturn";

type WellbeingReturnContext = {
  version: 1;
  route: string;
  targetId: string;
  scrollTop: number;
  destination?: string;
};

type WellbeingReturnOptions = {
  ready: boolean;
  rootSelector: string;
  fallbackRef?: RefObject<HTMLElement | null>;
  fallbackSelector?: string;
  restoreKey?: string | number;
  waitForTarget?: boolean;
  resolveTarget?: (targetId: string) => HTMLElement | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function currentRoute(location: Pick<Location, "pathname" | "search" | "hash">) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function readReturnContext(state: unknown): WellbeingReturnContext | undefined {
  if (!isRecord(state)) return undefined;
  const value = state[WELLBEING_RETURN_STATE];
  if (!isRecord(value) || value.version !== 1) return undefined;
  if (typeof value.route !== "string" || !value.route.startsWith("/life/wellbeing") || value.route.length > 2_000) return undefined;
  if (value.destination !== undefined && (typeof value.destination !== "string" || !value.destination.startsWith("/life/wellbeing") || value.destination.length > 2_000)) return undefined;
  if (typeof value.targetId !== "string" || value.targetId.length < 1 || value.targetId.length > 240) return undefined;
  if (typeof value.scrollTop !== "number" || !Number.isFinite(value.scrollTop) || value.scrollTop < 0 || value.scrollTop > 10_000_000) return undefined;
  return value as WellbeingReturnContext;
}

function returnTarget(root: HTMLElement | null, targetId?: string) {
  if (!root || !targetId) return undefined;
  return [...root.querySelectorAll<HTMLElement>("[data-row-return-id], [data-wellbeing-return-id]")]
    .find((candidate) => (candidate.dataset.rowReturnId ?? candidate.dataset.wellbeingReturnId) === targetId);
}

function scrollOwner(root: HTMLElement | null) {
  return root?.closest<HTMLElement>(".life-stage") ?? document.scrollingElement as HTMLElement | null;
}

export function wellbeingRecordReturnId(id: string) {
  return `record:${id}`;
}

/**
 * Owns the durable list -> detail -> list return contract for Wellbeing.
 * The route entry, not a component ref, carries the exact scroll position and
 * stable subject anchor so browser Back and restored history behave alike.
 */
export function useWellbeingReturnContext({
  ready,
  rootSelector,
  fallbackRef,
  fallbackSelector = "[data-wellbeing-return-fallback]",
  restoreKey = 0,
  waitForTarget = false,
  resolveTarget,
}: WellbeingReturnOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const scheduledFrame = useRef<number | undefined>(undefined);
  const incomingContext = readReturnContext(location.state);
  const returnRoute = incomingContext?.destination === currentRoute(location) ? incomingContext.route : undefined;
  const returnTargetId = incomingContext?.route === currentRoute(location) ? incomingContext.targetId : undefined;

  const root = useCallback(
    () => document.querySelector<HTMLElement>(rootSelector),
    [rootSelector],
  );

  const fallback = useCallback((owner: HTMLElement | null) => {
    if (fallbackRef?.current?.isConnected) return fallbackRef.current;
    return owner?.querySelector<HTMLElement>(fallbackSelector) ?? undefined;
  }, [fallbackRef, fallbackSelector]);

  const focusReturnTarget = useCallback((targetId?: string) => {
    if (scheduledFrame.current !== undefined) cancelAnimationFrame(scheduledFrame.current);
    scheduledFrame.current = requestAnimationFrame(() => {
      scheduledFrame.current = requestAnimationFrame(() => {
        const owner = root();
        const target = (targetId ? resolveTarget?.(targetId) : undefined) ?? returnTarget(owner, targetId) ?? fallback(owner);
        target?.focus({ preventScroll: true });
        scheduledFrame.current = undefined;
      });
    });
  }, [fallback, resolveTarget, root]);

  const settleReturnFocus = useCallback((targetId = returnTargetId) => {
    const context = readReturnContext(location.state);
    const route = currentRoute(location);
    if (!context || context.route !== route) return false;
    const owner = root();
    const target = resolveTarget?.(targetId ?? context.targetId) ?? returnTarget(owner, targetId ?? context.targetId) ?? fallback(owner);
    focusReturnTarget(targetId ?? context.targetId);
    const nextState = { ...(location.state as Record<string, unknown>) };
    delete nextState[WELLBEING_RETURN_STATE];
    navigate(route, { replace: true, state: Object.keys(nextState).length ? nextState : null });
    return Boolean(target);
  }, [fallback, focusReturnTarget, location, navigate, resolveTarget, returnTargetId, root]);

  const rememberAndOpen = useCallback((destination: string, targetId: string) => {
    const route = currentRoute(location);
    const state = isRecord(location.state) ? location.state : {};
    const context: WellbeingReturnContext = {
      version: 1,
      route,
      targetId,
      scrollTop: scrollOwner(root())?.scrollTop ?? 0,
      destination,
    };
    navigate(route, {
      replace: true,
      state: { ...state, [WELLBEING_RETURN_STATE]: context },
    });
    navigate(destination, { state: { [WELLBEING_RETURN_STATE]: context } });
  }, [location, navigate, root]);

  const rememberAndOpenQuery = useCallback((changes: Record<string, string | undefined>, targetId: string) => {
    const next = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    rememberAndOpen(`${location.pathname}${query ? `?${query}` : ""}${location.hash}`, targetId);
  }, [location.hash, location.pathname, location.search, rememberAndOpen]);

  useEffect(() => {
    if (navigationType !== "POP") return;
    const hasState = isRecord(location.state) && WELLBEING_RETURN_STATE in location.state;
    if (!hasState) return;
    const context = readReturnContext(location.state);
    const route = currentRoute(location);
    if (context && (context.destination === route || (context.route === route && !ready))) return;

    const nextState = { ...(location.state as Record<string, unknown>) };
    delete nextState[WELLBEING_RETURN_STATE];
    const owner = root();
    const target = context?.route === route ? resolveTarget?.(context.targetId) ?? returnTarget(owner, context.targetId) : undefined;
    if (context?.route === route && waitForTarget && !target) return;
    const focusTarget = target ?? (context?.route === route ? fallback(owner) : undefined);
    const frame = requestAnimationFrame(() => {
      if (context?.route === route) {
        const stage = scrollOwner(owner);
        if (stage) stage.scrollTop = context.scrollTop;
        focusTarget?.focus({ preventScroll: true });
      }
      navigate(route, {
        replace: true,
        state: Object.keys(nextState).length ? nextState : null,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [fallback, location, navigate, navigationType, ready, resolveTarget, restoreKey, root, waitForTarget]);

  useEffect(() => () => {
    if (scheduledFrame.current !== undefined) cancelAnimationFrame(scheduledFrame.current);
  }, []);

  return { rememberAndOpen, rememberAndOpenQuery, focusReturnTarget, settleReturnFocus, returnRoute, returnTargetId };
}
