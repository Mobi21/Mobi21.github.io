import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConversationAttachmentReference, ConversationContextSelection } from "./runtime";

const LEGACY_STORAGE_KEY = "kora.shell.v1";
const ROUTE_STORAGE_KEY = "kora.presentation.route.v2";
const DRAFT_PREFIX = "kora.draft.v2.";
const LAST_GOOD_PREFIX = "kora.draft.last-good.v2.";
const QUARANTINE_PREFIX = "kora.draft.quarantine.v2.";
const MIGRATION_KEY = "kora.draft.migration.v2";
const WRITE_DELAY_MS = 180;

export type DraftSelection = { start: number; end: number; direction: "forward" | "backward" | "none" };
export type DraftRecord = {
  version: 3;
  sessionId: string;
  contextKey: string;
  text: string;
  contextRecoveryNeeded: boolean;
  selection: DraftSelection;
  attachmentRecoveryNeeded: boolean;
  updatedAt: string;
};

type LegacyShellPersistence = {
  route?: unknown;
  drafts?: unknown;
  attachmentDrafts?: unknown;
  contextDrafts?: unknown;
};

type PendingWrite = { record: DraftRecord; timer?: ReturnType<typeof setTimeout> };
const pending = new Map<string, PendingWrite>();
const liveAttachments = new Map<string, ConversationAttachmentReference[]>();
const liveContext = new Map<string, ConversationContextSelection[]>();
let lifecycleInstalled = false;

function storageKey(sessionId: string, contextKey: string) {
  return `${DRAFT_PREFIX}${encodeURIComponent(sessionId)}.${encodeURIComponent(contextKey)}`;
}

function lastGoodKey(sessionId: string, contextKey: string) {
  return `${LAST_GOOD_PREFIX}${encodeURIComponent(sessionId)}.${encodeURIComponent(contextKey)}`;
}

function validRecord(value: unknown): value is DraftRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DraftRecord>;
  return item.version === 3 && typeof item.sessionId === "string" && typeof item.contextKey === "string" &&
    typeof item.text === "string" && typeof item.contextRecoveryNeeded === "boolean" &&
    Boolean(item.selection && Number.isInteger(item.selection.start) && Number.isInteger(item.selection.end)) &&
    typeof item.attachmentRecoveryNeeded === "boolean" && typeof item.updatedAt === "string";
}

function emitStorageError(message: string) {
  window.dispatchEvent(new CustomEvent("kora:draft-storage-error", { detail: { message } }));
}

function writeRecord(record: DraftRecord) {
  const key = storageKey(record.sessionId, record.contextKey);
  const lastGood = lastGoodKey(record.sessionId, record.contextKey);
  try {
    if (!record.text && !record.contextRecoveryNeeded && !record.attachmentRecoveryNeeded) {
      localStorage.removeItem(key);
      localStorage.removeItem(lastGood);
    } else {
      const encoded = JSON.stringify(record);
      localStorage.setItem(key, encoded);
      const verified = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
      if (!validRecord(verified)) throw new Error("Draft checkpoint verification failed.");
      localStorage.setItem(lastGood, encoded);
    }
    window.dispatchEvent(new CustomEvent("kora:drafts-changed", { detail: { sessionId: record.sessionId } }));
  } catch (error) {
    emitStorageError(error instanceof Error ? error.message : "Kora could not save this draft.");
    throw error;
  }
}

function flushKey(key: string) {
  const item = pending.get(key);
  if (!item) return true;
  if (item.timer) clearTimeout(item.timer);
  pending.delete(key);
  try { writeRecord(item.record); return true; } catch { return false; }
}

export function checkpointAllDrafts() {
  let ok = true;
  for (const key of [...pending.keys()]) ok = flushKey(key) && ok;
  return ok;
}

function installLifecycleCheckpointing() {
  if (lifecycleInstalled || typeof window === "undefined") return;
  lifecycleInstalled = true;
  const flush = () => { checkpointAllDrafts(); };
  window.addEventListener("blur", flush);
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

function parseLegacyKey(key: string): { sessionId: string; contextKey: string } | undefined {
  const separator = key.indexOf(":");
  if (separator <= 0) return;
  return { sessionId: key.slice(0, separator), contextKey: key.slice(separator + 1) };
}

export function migrateLegacyDrafts() {
  if (localStorage.getItem(MIGRATION_KEY) === "complete") return;
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) { localStorage.setItem(MIGRATION_KEY, "complete"); return; }
  try {
    const legacy = JSON.parse(raw) as LegacyShellPersistence;
    const drafts = legacy.drafts && typeof legacy.drafts === "object" ? legacy.drafts as Record<string, unknown> : {};
    const contexts = legacy.contextDrafts && typeof legacy.contextDrafts === "object" ? legacy.contextDrafts as Record<string, unknown> : {};
    const attachments = legacy.attachmentDrafts && typeof legacy.attachmentDrafts === "object" ? legacy.attachmentDrafts as Record<string, unknown> : {};
    const imported: string[] = [];
    const legacyKeys = new Set([...Object.keys(drafts), ...Object.keys(contexts), ...Object.keys(attachments)]);
    for (const legacyKey of legacyKeys) {
      const value = drafts[legacyKey];
      if (value !== undefined && typeof value !== "string") continue;
      const identity = parseLegacyKey(legacyKey);
      if (!identity) continue;
      const contextRecoveryNeeded = Array.isArray(contexts[legacyKey]) && contexts[legacyKey].length > 0;
      const record: DraftRecord = {
        version: 3, ...identity, text: value ?? "", contextRecoveryNeeded,
        selection: { start: (value ?? "").length, end: (value ?? "").length, direction: "none" },
        attachmentRecoveryNeeded: Array.isArray(attachments[legacyKey]) && attachments[legacyKey].length > 0,
        updatedAt: new Date().toISOString(),
      };
      writeRecord(record);
      imported.push(storageKey(identity.sessionId, identity.contextKey));
    }
    if (!imported.every((key) => validRecord(JSON.parse(localStorage.getItem(key) ?? "null"))))
      throw new Error("Imported drafts could not be verified.");
    if (typeof legacy.route === "string") saveRoute(legacy.route);
    localStorage.setItem(MIGRATION_KEY, "complete");
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    emitStorageError(error instanceof Error ? error.message : "Kora could not migrate saved drafts.");
  }
}

export function readDraft(sessionId: string, contextKey: string): DraftRecord {
  installLifecycleCheckpointing();
  migrateLegacyDrafts();
  const key = storageKey(sessionId, contextKey);
  const queued = pending.get(key)?.record;
  if (queued) return queued;
  const fallback: DraftRecord = { version: 3, sessionId, contextKey, text: "", contextRecoveryNeeded: false, selection: { start: 0, end: 0, direction: "none" }, attachmentRecoveryNeeded: false, updatedAt: new Date(0).toISOString() };
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validRecord(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const legacy = parsed as Record<string, unknown>;
      if (
        legacy.version === 2 &&
        typeof legacy.sessionId === "string" &&
        typeof legacy.contextKey === "string" &&
        typeof legacy.text === "string" &&
        legacy.selection && typeof legacy.selection === "object" &&
        Number.isInteger((legacy.selection as Record<string, unknown>).start) &&
        Number.isInteger((legacy.selection as Record<string, unknown>).end) &&
        typeof legacy.attachmentRecoveryNeeded === "boolean" &&
        typeof legacy.updatedAt === "string"
      ) {
        const migrated: DraftRecord = {
          version: 3,
          sessionId: legacy.sessionId,
          contextKey: legacy.contextKey,
          text: legacy.text,
          contextRecoveryNeeded: Array.isArray(legacy.context) && legacy.context.length > 0,
          selection: legacy.selection as DraftSelection,
          attachmentRecoveryNeeded: legacy.attachmentRecoveryNeeded,
          updatedAt: legacy.updatedAt,
        };
        writeRecord(migrated);
        return migrated;
      }
    }
    throw new Error("Malformed draft record.");
  } catch {
    try { localStorage.setItem(`${QUARANTINE_PREFIX}${Date.now()}`, raw); localStorage.removeItem(key); } catch { /* preserve other drafts */ }
    const lastGood = localStorage.getItem(lastGoodKey(sessionId, contextKey));
    if (lastGood) {
      try {
        const parsed = JSON.parse(lastGood) as unknown;
        if (validRecord(parsed)) { localStorage.setItem(key, lastGood); return parsed; }
      } catch { /* isolated below */ }
    }
    emitStorageError("One damaged draft was isolated. Your other drafts are safe.");
    return fallback;
  }
}

function queueRecord(record: DraftRecord) {
  const key = storageKey(record.sessionId, record.contextKey);
  const existing = pending.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  const item: PendingWrite = { record };
  item.timer = setTimeout(() => flushKey(key), WRITE_DELAY_MS);
  pending.set(key, item);
}

export function hasDraft(sessionId: string, contextKey = "workspace:/kora") {
  const record = readDraft(sessionId, contextKey);
  return Boolean(record.text || record.contextRecoveryNeeded || record.attachmentRecoveryNeeded);
}

export function clearAllDrafts() {
  __resetDraftRepositoryForTests();
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(DRAFT_PREFIX) || key.startsWith(LAST_GOOD_PREFIX) || key.startsWith(QUARANTINE_PREFIX)) localStorage.removeItem(key);
  }
  liveAttachments.clear();
  liveContext.clear();
  window.dispatchEvent(new CustomEvent("kora:drafts-changed", { detail: { all: true } }));
}

export function restoreRoute() {
  migrateLegacyDrafts();
  const route = localStorage.getItem(ROUTE_STORAGE_KEY);
  return route ? stablePresentationRoute(route) : undefined;
}

export function stablePresentationRoute(route: string) {
  const [pathname, query = ""] = route.split("?", 2);
  const parameters = new URLSearchParams(query);
  parameters.delete("session");
  parameters.delete("activation");
  const stableQuery = parameters.toString();
  return `${pathname || "/kora"}${stableQuery ? `?${stableQuery}` : ""}`;
}

export function saveRoute(route: string) {
  try { localStorage.setItem(ROUTE_STORAGE_KEY, stablePresentationRoute(route)); }
  catch { emitStorageError("Kora could not remember this workspace route."); }
}

export function useDraft(sessionId: string | undefined, contextKey: string) {
  const key = sessionId ? `${sessionId}:${contextKey}` : "";
  const [record, setRecord] = useState<DraftRecord | undefined>(() => sessionId ? readDraft(sessionId, contextKey) : undefined);
  useEffect(() => { setRecord(sessionId ? readDraft(sessionId, contextKey) : undefined); }, [key, sessionId, contextKey]);
  const update = useCallback((changes: Partial<Pick<DraftRecord, "text" | "contextRecoveryNeeded" | "selection" | "attachmentRecoveryNeeded">>) => {
    if (!sessionId) return;
    setRecord((current) => {
      const next = { ...(current ?? readDraft(sessionId, contextKey)), ...changes, updatedAt: new Date().toISOString() };
      queueRecord(next);
      return next;
    });
  }, [sessionId, contextKey]);
  const setDraft = useCallback((text: string) => update({ text }), [update]);
  const discard = useCallback(() => {
    if (!sessionId) return;
    const empty = { ...readDraft(sessionId, contextKey), text: "", contextRecoveryNeeded: false, selection: { start: 0, end: 0, direction: "none" } as DraftSelection, attachmentRecoveryNeeded: false, updatedAt: new Date().toISOString() };
    setRecord(empty); queueRecord(empty); flushKey(storageKey(sessionId, contextKey));
  }, [sessionId, contextKey]);
  const checkpoint = useCallback(() => sessionId ? flushKey(storageKey(sessionId, contextKey)) : true, [sessionId, contextKey]);
  return { draft: record?.text ?? "", setDraft, discard, selection: record?.selection, setSelection: (selection: DraftSelection) => update({ selection }), checkpoint, storageError: undefined };
}

export function useAttachmentDraft(sessionId: string | undefined, contextKey: string) {
  const identity = sessionId ? `${sessionId}:${contextKey}` : "";
  const [attachments, setAttachmentsState] = useState<ConversationAttachmentReference[]>(() => liveAttachments.get(identity) ?? []);
  const [attachmentRecoveryNeeded, setAttachmentRecoveryNeeded] = useState(() => sessionId ? readDraft(sessionId, contextKey).attachmentRecoveryNeeded && !liveAttachments.has(identity) : false);
  useEffect(() => {
    setAttachmentsState(liveAttachments.get(identity) ?? []);
    setAttachmentRecoveryNeeded(Boolean(sessionId && readDraft(sessionId, contextKey).attachmentRecoveryNeeded && !liveAttachments.has(identity)));
  }, [identity, sessionId, contextKey]);
  const setAttachments = useCallback((value: ConversationAttachmentReference[]) => {
    setAttachmentsState(value);
    setAttachmentRecoveryNeeded(false);
    if (!sessionId) return;
    if (value.length) liveAttachments.set(identity, value); else liveAttachments.delete(identity);
    queueRecord({ ...readDraft(sessionId, contextKey), attachmentRecoveryNeeded: value.length > 0, updatedAt: new Date().toISOString() });
  }, [contextKey, identity, sessionId]);
  const discardAttachments = useCallback(() => setAttachments([]), [setAttachments]);
  return { attachments, setAttachments, discardAttachments, attachmentRecoveryNeeded };
}

export function useContextDraft(sessionId: string | undefined, contextKey: string) {
  const identity = useMemo(() => sessionId ? `${sessionId}:${contextKey}` : "", [sessionId, contextKey]);
  const [context, setContextState] = useState<ConversationContextSelection[]>(() => liveContext.get(identity) ?? []);
  const [contextRecoveryNeeded, setContextRecoveryNeeded] = useState(() => Boolean(
    sessionId && readDraft(sessionId, contextKey).contextRecoveryNeeded && !liveContext.has(identity),
  ));
  useEffect(() => {
    setContextState(liveContext.get(identity) ?? []);
    setContextRecoveryNeeded(Boolean(
      sessionId && readDraft(sessionId, contextKey).contextRecoveryNeeded && !liveContext.has(identity),
    ));
  }, [identity, sessionId, contextKey]);
  const setContext = useCallback((value: ConversationContextSelection[]) => {
    setContextState(value);
    setContextRecoveryNeeded(false);
    if (!sessionId) return;
    if (value.length) liveContext.set(identity, value); else liveContext.delete(identity);
    queueRecord({ ...readDraft(sessionId, contextKey), contextRecoveryNeeded: value.length > 0, updatedAt: new Date().toISOString() });
  }, [identity, sessionId, contextKey]);
  const discardContext = useCallback(() => setContext([]), [setContext]);
  return { context, setContext, discardContext, contextRecoveryNeeded };
}

export function __resetDraftRepositoryForTests() {
  for (const item of pending.values()) if (item.timer) clearTimeout(item.timer);
  pending.clear();
  liveAttachments.clear();
  liveContext.clear();
}
