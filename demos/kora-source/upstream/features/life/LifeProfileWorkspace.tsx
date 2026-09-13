import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Check,
  CircleAlert,
  Clock3,
  ChevronRight,
  Eye,
  History,
  Info,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Field,
  IconButton,
  Input,
  KoraPresenceMark,
  KoraSelect,
  PageFrame,
  PageHeader,
  SearchField,
  Sheet,
  StateView,
  Textarea,
  Pressable,
} from "../../components/primitives";
import {
  runtime,
  type BrainValue,
  type ConversationContextReference,
  type ProfileCategory,
  type ProfileHistoryEntry,
  type ProfileOverview,
  type ProfileRecord,
} from "../../lib/runtime";
import { humaniseKey } from "../../lib/language";
import { ExactOperationConfirmation } from "../brain/ExactOperationConfirmation";
import { useOperationIntent } from "../brain/useOperationIntent";
import "./profile.css";

const CATEGORY_ORDER = ["identity", "communication", "household", "preferences", "privacy"] as const;
type AboutYouCategory = (typeof CATEGORY_ORDER)[number];
type ProfileState = NonNullable<ProfileRecord["state"]>;
type StateFilter = "active" | "all" | ProfileState;
type ProfilePage = Awaited<ReturnType<typeof runtime.profilePage>> & { restrictedOmitted?: boolean };
type ProfileHistoryPage = Awaited<ReturnType<typeof runtime.profileHistoryPage>>;

const CATEGORY_META: Record<AboutYouCategory, { label: string; purpose: string }> = {
  identity: { label: "Identity", purpose: "Names, language, location, and other stable details you choose to keep current." },
  communication: { label: "Communication", purpose: "How you prefer information, tone, and choices to be handled." },
  household: { label: "Household", purpose: "Stable home and household context you have deliberately saved." },
  preferences: { label: "Needs & preferences", purpose: "Needs and preferences worth remembering across conversations." },
  privacy: { label: "Boundaries & privacy", purpose: "Rules and boundaries Kora should respect when using your saved context." },
};
const STATE_OPTIONS: Array<{ value: StateFilter; label: string; description?: string }> = [
  { value: "active", label: "Current facts", description: "Confirmed, proposed, and conflicted facts" },
  { value: "all", label: "All states", description: "Include archived and dismissed facts" },
  { value: "confirmed", label: "Confirmed" },
  { value: "proposed", label: "Proposed" },
  { value: "conflicted", label: "Needs review" },
  { value: "archived", label: "Archived" },
  { value: "dismissed", label: "Dismissed" },
];
const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All categories" },
  ...CATEGORY_ORDER.map((category) => ({ value: category, label: CATEGORY_META[category].label })),
  { value: "unknown", label: "Other saved facts" },
];
const ACTIVE_STATES: ProfileState[] = ["confirmed", "proposed", "conflicted"];
const ALL_STATES: ProfileState[] = ["confirmed", "proposed", "conflicted", "archived", "dismissed"];
const PAGE_SIZE = 24;
const HISTORY_PAGE_SIZE = 20;
const RESERVED_CATEGORY_NAMES = new Set<string>(CATEGORY_ORDER);
const CUSTOM_FACT_VALUE = "__custom__";
const KNOWN_FACT_CHOICES: Array<{ key: string; label: string; category: AboutYouCategory; description: string }> = [
  { key: "identity.preferred_name", label: "Preferred name", category: "identity", description: "The name you want Kora to use." },
  { key: "identity.pronouns", label: "Pronouns", category: "identity", description: "How you want to be referred to." },
  { key: "identity.timezone", label: "Time zone", category: "identity", description: "The time zone used for your saved context." },
  { key: "identity.language", label: "Preferred language", category: "identity", description: "The language you prefer for conversation." },
  { key: "communication.response_length", label: "Response length", category: "communication", description: "How much detail you prefer in answers." },
  { key: "household.city", label: "Home city", category: "household", description: "A stable place you choose to remember." },
  { key: "preferences.favorite_color", label: "Favorite color", category: "preferences", description: "A color you want Kora to remember as a preference." },
  { key: "privacy.share_location", label: "Location sharing", category: "privacy", description: "Whether Kora may use or share your saved location context." },
];
const FACT_CATEGORY_OPTIONS = CATEGORY_ORDER.map((category) => ({ value: category, label: CATEGORY_META[category].label }));

const categoryLabel = (category: ProfileCategory | undefined) =>
  category && category in CATEGORY_META
    ? CATEGORY_META[category as AboutYouCategory].label
    : "Other saved facts";

/* Kept as a tiny compatibility export for older consumers. Category meaning is
   now supplied by the canonical ProfileRecord.category field. */
export function profileGroupForKey(key: string): string {
  return humaniseKey(key);
}

/* Health callers were part of the old route and remain safe to filter while
   those links are migrated. About You itself never uses this prefix heuristic. */
export function filterProfileRecords(records: ProfileRecord[], mode: "profile" | "health") {
  return mode === "health" ? records.filter((record) => record.key.trim().toLowerCase().startsWith("health.")) : records;
}

function displayKey(key: string) {
  const result = humaniseKey(key);
  return result || "Saved fact";
}

function isPrimitive(value: BrainValue): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isFlatObject(value: BrainValue): value is Record<string, string | number | boolean | null> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(isPrimitive));
}

function isEditableValue(value: BrainValue) {
  return (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    || (Array.isArray(value) && value.every(isPrimitive))
    || isFlatObject(value);
}

function valueSummary(value: BrainValue): string {
  if (value === null) return "Not set";
  if (Array.isArray(value)) return value.length ? value.map(valueSummary).join(", ") : "Empty list";
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, item]) => `${displayKey(key)}: ${valueSummary(item)}`).join(" · ") : "No details recorded";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function compactValue(value: BrainValue, limit = 140) {
  const text = valueSummary(value).replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

function detailEntries(value: BrainValue, path: string[] = []): Array<{ path: string; value: string }> {
  if (Array.isArray(value)) {
    if (!value.length) return [{ path: path.join(" · ") || "Value", value: "Empty list" }];
    return value.flatMap((item, index) => detailEntries(item, [...path, `Item ${index + 1}`]));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return [{ path: path.join(" · ") || "Value", value: "No details recorded" }];
    return entries.flatMap(([key, item]) => detailEntries(item, [...path, displayKey(key)]));
  }
  return [{ path: path.join(" · ") || "Value", value: valueSummary(value) }];
}

function sourceLabel(record: ProfileRecord) {
  return record.source?.label ?? "Recorded provenance";
}

const PROVENANCE_LABELS: Record<string, string> = {
  user_explicit: "Saved by you",
  user_correction: "Corrected by you",
  user_confirmation: "Confirmed by you",
  agent_proposal: "Proposed by Kora",
  system_read_only: "System owned",
};

function provenanceLabel(provenance: string) {
  return PROVENANCE_LABELS[provenance] ?? (humaniseKey(provenance) || "Recorded provenance");
}

function editingLabel(record: ProfileRecord) {
  if (record.mutability === "read_only") return "Read only";
  return isEditableValue(record.value) ? "Editable" : "Readable here; editing unavailable";
}

function stateLabel(state: ProfileState | undefined) {
  switch (state ?? "confirmed") {
    case "proposed": return "Proposed";
    case "conflicted": return "Needs review";
    case "archived": return "Archived";
    case "dismissed": return "Dismissed";
    default: return "Confirmed";
  }
}

function historyActionLabel(action: ProfileHistoryEntry["action"]) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function formatDate(value: string | undefined) {
  if (!value) return "Date not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not available" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function requestMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function knownFactChoices(category: AboutYouCategory) {
  return KNOWN_FACT_CHOICES.filter((choice) => choice.category === category);
}

function customFactKeyForName(category: AboutYouCategory, name: string) {
  const slug = name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 120)
    .replace(/_+$/u, "");
  return slug && /\p{L}/u.test(slug) ? `${category}.${slug}` : undefined;
}

function collectionQualification(page: ProfilePage | undefined, nextCursor: string | undefined, pageError: string | undefined) {
  if (!page) return undefined;
  const messages: string[] = [];
  if (page.restrictedOmitted) messages.push("Some restricted facts are omitted from this view.");
  if (pageError) messages.push("The latest refresh is incomplete.");
  else if (nextCursor) messages.push("Use Next to read more.");
  else if (!page.complete) messages.push("This page may be incomplete.");
  if (!messages.length) return undefined;
  return messages.join(" ");
}

function isProfileCategory(value: string | null): value is AboutYouCategory {
  return Boolean(value && RESERVED_CATEGORY_NAMES.has(value));
}

function isStateFilter(value: string | null): value is StateFilter {
  return value === "active" || value === "all" || value === "confirmed" || value === "proposed" || value === "conflicted" || value === "archived" || value === "dismissed";
}

function isOrigin(value: string | null): value is "overview" | AboutYouCategory {
  return value === "overview" || isProfileCategory(value);
}

function restoredFactKey(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = (value as { aboutYouReturn?: unknown }).aboutYouReturn;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const key = (candidate as { version?: unknown; key?: unknown });
  return key.version === 1 && typeof key.key === "string" && key.key.length <= 300 ? key.key : undefined;
}

function queryStateParams(search: URLSearchParams, options: { query?: string; state?: StateFilter; category?: ProfileCategory | "all"; cursor?: string }) {
  const next = new URLSearchParams(search);
  for (const key of ["q", "state", "category", "cursor"]) next.delete(key);
  if (options.query) next.set("q", options.query);
  if (options.state && options.state !== "active") next.set("state", options.state);
  if (options.category && options.category !== "all") next.set("category", options.category);
  if (options.cursor) next.set("cursor", options.cursor);
  return next;
}

function detailPath(key: string, context: { origin: "overview" | AboutYouCategory; query: string; state: StateFilter; category?: ProfileCategory | "all"; cursor?: string }) {
  const params = new URLSearchParams({ from: context.origin });
  if (context.query) params.set("q", context.query);
  if (context.state !== "active") params.set("state", context.state);
  if (context.category && context.category !== "all") params.set("category", context.category);
  if (context.cursor) params.set("cursor", context.cursor);
  return `/life/about-you/facts/${encodeURIComponent(key)}?${params.toString()}`;
}

function returnPath(search: URLSearchParams) {
  const origin = isOrigin(search.get("from")) ? search.get("from")! : "overview";
  const path = origin === "overview" ? "/life/about-you" : `/life/about-you/${origin}`;
  const next = new URLSearchParams();
  const query = search.get("q")?.trim();
  const state = search.get("state");
  const category = search.get("category");
  const cursor = search.get("cursor");
  if (query) next.set("q", query);
  if (state && isStateFilter(state) && state !== "active") next.set("state", state);
  if (origin === "overview" && category && CATEGORY_OPTIONS.some((option) => option.value === category && category !== "all")) next.set("category", category);
  if (cursor) next.set("cursor", cursor);
  return `${path}${next.toString() ? `?${next.toString()}` : ""}`;
}

function OverviewSupportLink({ support, children, onOpen }: { support: { key: string; version: number }; children: ReactNode; onOpen: (key: string) => void }) {
  return <Pressable className="life-profile-support-link" onClick={() => onOpen(support.key)}><span className="life-profile-support-link__label">{children}</span><ChevronRight className="life-profile-action-chevron" size={15} aria-hidden="true" /></Pressable>;
}

function ValueEditor({ value, draft, onChange }: { value: BrainValue; draft: BrainValue; onChange: (value: BrainValue) => void }) {
  if (typeof value === "boolean") return <KoraSelect label="Fact value" value={draft === true ? "true" : "false"} onValueChange={(next) => onChange(next === "true")} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />;
  if (Array.isArray(value)) return <div className="life-profile-editor__list" aria-label="Fact list">
    {(draft as BrainValue[]).map((item, index) => <div className="life-profile-editor__list-row" key={index}>
      <Field label={`Item ${index + 1}`}>
        <PrimitiveEditor original={item as string | number | boolean | null} value={item} label={`Item ${index + 1}`} onChange={(next) => {
          const nextItems = [...(draft as BrainValue[])]; nextItems[index] = next; onChange(nextItems);
        }} />
      </Field>
      <IconButton label={`Remove item ${index + 1}`} tooltip="Remove item" onClick={() => onChange((draft as BrainValue[]).filter((_, itemIndex) => itemIndex !== index))}>×</IconButton>
    </div>)}
    <Button tone="ghost" type="button" onClick={() => onChange([...(draft as BrainValue[]), ""])}><Plus size={14} />Add item</Button>
  </div>;
  if (isFlatObject(value)) return <div className="life-profile-editor__fields">{Object.entries(value).map(([key, original]) => <Field key={key} label={displayKey(key)}><PrimitiveEditor original={original} value={(draft as Record<string, BrainValue>)[key] ?? null} label={displayKey(key)} onChange={(next) => onChange({ ...(draft as Record<string, BrainValue>), [key]: next })} /></Field>)}</div>;
  if (typeof value === "string" && value.length > 180) return <Textarea aria-label="Fact value" rows={5} value={String(draft)} onChange={(event) => onChange(event.target.value)} />;
  return <Input aria-label="Fact value" type={typeof value === "number" ? "number" : "text"} value={draft === null ? "" : String(draft)} onChange={(event) => onChange(typeof value === "number" ? Number(event.target.value) : event.target.value)} />;
}

function PrimitiveEditor({ original, value, label, onChange }: { original: string | number | boolean | null; value: BrainValue; label: string; onChange: (value: string | number | boolean | null) => void }) {
  if (original === null) return <Input aria-label={label} value="Not set" disabled readOnly />;
  if (typeof original === "boolean") return <KoraSelect label={label} value={value === true ? "true" : "false"} onValueChange={(next) => onChange(next === "true")} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />;
  return <Input aria-label={label} type={typeof original === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(event) => onChange(typeof original === "number" ? Number(event.target.value) : event.target.value)} />;
}

function FactRow({ record, onOpen }: { record: ProfileRecord; onOpen: (record: ProfileRecord) => void }) {
  return <li className="life-profile-fact">
    <Pressable className="life-profile-fact__open" data-profile-key={record.key} onClick={() => onOpen(record)}>
      <span className="life-profile-fact__identity"><strong>{displayKey(record.key)}</strong><small>{categoryLabel(record.category)} · {sourceLabel(record)}</small></span>
      <span className="life-profile-fact__value">{compactValue(record.value)}</span>
      <span className={`life-profile-fact__state is-${record.state ?? "confirmed"}`}>{stateLabel(record.state)}</span>
      <ChevronRight className="life-profile-action-chevron" size={16} aria-hidden="true" />
    </Pressable>
  </li>;
}

function CollectionPager({ page, pageIndex, previous, previousLabel = "Previous", next, onPrevious, onNext, loading }: { page?: ProfilePage; pageIndex?: number; previous: boolean; previousLabel?: string; next?: string; onPrevious: () => void; onNext: () => void; loading: boolean }) {
  if (!page || (!previous && !next)) return null;
  return <nav className="life-profile-pager" aria-label="About You fact pages"><Button tone="ghost" disabled={!previous || loading} onClick={onPrevious}>{previousLabel}</Button><span>{loading ? "Reading…" : pageIndex ? `Page ${pageIndex}` : "Page position unavailable"}</span><Button tone="ghost" disabled={!next || loading} onClick={onNext}>Next</Button></nav>;
}

function CollectionState({ error, retained, onRetry }: { error?: string; retained: boolean; onRetry: () => void }) {
  if (!error) return null;
  return retained
    ? <div className="life-profile-notice" role="alert"><CircleAlert size={16} /><span>{error} Your last successful page remains visible.</span><Button tone="ghost" onClick={onRetry}>Retry</Button></div>
    : <StateView state="error" title="Facts could not be loaded" body={error} action={<Button tone="secondary" onClick={onRetry}>Try again</Button>} />;
}

function ProfileInspector({ record, loading, error, onClose, onAskKora, onChanged, onDeleted, onRetry, onReturn }: { record?: ProfileRecord; loading: boolean; error?: unknown; onClose: () => void; onAskKora?: (reference: ConversationContextReference) => void; onChanged: (record: ProfileRecord) => void; onDeleted: () => void; onRetry: () => void; onReturn: string }) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrainValue>(record?.value ?? null);
  const [editShape, setEditShape] = useState<BrainValue>(record?.value ?? null);
  const [editExpectedVersion, setEditExpectedVersion] = useState<number>();
  const [current, setCurrent] = useState<ProfileRecord | undefined>(record);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [conflictMessage, setConflictMessage] = useState<string>();
  const [deleteConfirmations, setDeleteConfirmations] = useState<string[]>([]);
  const [dismissWarning, setDismissWarning] = useState<"close" | "edit">();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string>();
  const [historyCursorHistory, setHistoryCursorHistory] = useState<Array<string | undefined>>([]);
  const [retainedHistory, setRetainedHistory] = useState<{ key: string; page: ProfileHistoryPage }>();
  const dismissRef = useRef<HTMLDivElement>(null);
  const saveIntent = useOperationIntent<{ key: string; value: BrainValue }, { expectedVersion: number }>();
  const transitionIntent = useOperationIntent<{ action: "confirm" | "dismiss" | "archive" | "restore"; key: string }, { expectedVersion: number }>();
  const deleteIntent = useOperationIntent<{ key: string }, { expectedVersion: number }>();
  const editingRef = useRef(editing);
  const activeKeyRef = useRef(record?.key);
  editingRef.current = editing;

  const historyKey = current?.key;
  const history = useQuery<ProfileHistoryPage>({
    queryKey: ["about-you", "fact-history", historyKey, historyCursor ?? "first"],
    enabled: Boolean(historyOpen && record?.key && historyKey === record.key && !loading && !error),
    retry: false,
    queryFn: () => runtime.profileHistoryPage({ profileKey: historyKey!, pageSize: HISTORY_PAGE_SIZE, cursor: historyCursor }),
  });

  useEffect(() => {
    if (!record) {
      if (!loading && !error) {
        activeKeyRef.current = undefined;
        setCurrent(undefined);
        setEditing(false);
        setHistoryOpen(false);
      }
      return;
    }
    const sameKey = activeKeyRef.current === record.key;
    activeKeyRef.current = record.key;
    setCurrent(record);
    if (!sameKey || !editingRef.current) {
      setDraft(record.value);
      setEditShape(record.value);
      setEditExpectedVersion(record.version);
      setErrorMessage(undefined);
      setConflictMessage(undefined);
      if (!sameKey) setEditing(false);
    }
  }, [error, loading, record?.key, record?.version]);
  useEffect(() => { if (errorMessage || conflictMessage) headingRef.current?.focus(); }, [errorMessage, conflictMessage]);
  useEffect(() => { if (dismissWarning) requestAnimationFrame(() => dismissRef.current?.focus()); }, [dismissWarning]);
  useEffect(() => {
    setHistoryOpen(false);
    setHistoryCursor(undefined);
    setHistoryCursorHistory([]);
    setRetainedHistory(undefined);
  }, [record?.key]);
  useEffect(() => {
    if (history.isSuccess && history.data && historyKey && record?.key === historyKey) {
      setRetainedHistory({ key: historyKey, page: history.data });
    }
  }, [history.data, history.isSuccess, historyKey, record?.key]);

  const save = useMutation({
    mutationFn: async (intent: ReturnType<typeof saveIntent.capture>) => {
      const outcome = await runtime.setProfileRecord(intent.payload.key, { value: intent.payload.value as BrainValue, expectedVersion: intent.concurrency.expectedVersion, requestKey: intent.requestKey });
      if (outcome.status === "conflict") throw Object.assign(new Error("This fact changed elsewhere."), { conflict: outcome.current });
      if (outcome.status !== "settled") throw new Error("message" in outcome ? outcome.message : "This fact could not be saved.");
      return outcome.record;
    },
    onMutate: () => { setErrorMessage(undefined); setConflictMessage(undefined); },
    onSuccess: (next) => { saveIntent.settle(); setCurrent(next); setEditShape(next.value); setEditExpectedVersion(next.version); setEditing(false); onChanged(next); void queryClient.invalidateQueries({ queryKey: ["about-you"] }); void queryClient.invalidateQueries({ queryKey: ["about-you", "fact-history", next.key] }); },
    onError: (reason: unknown) => { saveIntent.markTransientFailure(); const conflict = (reason as { conflict?: ProfileRecord }).conflict; if (conflict) { setCurrent(conflict); setConflictMessage("This fact changed elsewhere. Your draft is still here; review the current value before saving again."); void queryClient.invalidateQueries({ queryKey: ["about-you", "fact-history", conflict.key] }); } else setErrorMessage(requestMessage(reason, "This fact could not be saved. Your draft is still here.")); },
  });
  const transition = useMutation({
    mutationFn: async (intent: ReturnType<typeof transitionIntent.capture>) => {
      const outcome = await runtime.transitionProfileRecord(intent.payload.key, { action: intent.payload.action, expectedVersion: intent.concurrency.expectedVersion, requestKey: intent.requestKey });
      if (outcome.status === "conflict") throw Object.assign(new Error("This fact changed elsewhere."), { conflict: outcome.current });
      if (outcome.status === "gone") throw new Error("This fact is no longer available.");
      if (outcome.status === "read_only") throw new Error("This fact is owned by its source and cannot be changed here.");
      if (outcome.status !== "settled") throw new Error("This fact could not be updated.");
      return outcome.record;
    },
    onSuccess: (next) => { transitionIntent.settle(); setCurrent(next); onChanged(next); void queryClient.invalidateQueries({ queryKey: ["about-you"] }); void queryClient.invalidateQueries({ queryKey: ["about-you", "fact-history", next.key] }); },
    onError: (reason: unknown) => { transitionIntent.markTransientFailure(); const conflict = (reason as { conflict?: ProfileRecord }).conflict; if (conflict) { setCurrent(conflict); setErrorMessage("This fact changed elsewhere. Reopen it before trying again."); void queryClient.invalidateQueries({ queryKey: ["about-you", "fact-history", conflict.key] }); } else setErrorMessage(requestMessage(reason, "This fact could not be updated.")); },
  });
  const deletion = useMutation({
    mutationFn: async (intent: ReturnType<typeof deleteIntent.capture>) => runtime.deleteBrainRecord("profile", intent.payload.key, { expectedVersion: intent.concurrency.expectedVersion, requestKey: intent.requestKey }),
    onSuccess: async (outcome) => {
      if (outcome.status === "waiting_confirmation") { deleteIntent.markWaitingForConfirmation(); setDeleteConfirmations(outcome.confirmations.map((item) => item.confirmationId)); return; }
      if (outcome.status === "settled" || outcome.status === "gone") { deleteIntent.settle(); setDeleteConfirmations([]); await queryClient.invalidateQueries({ queryKey: ["about-you"] }); onDeleted(); return; }
      if (outcome.status === "conflict") { deleteIntent.markTransientFailure(); setErrorMessage("This fact changed elsewhere. Reopen the latest fact before deleting it."); return; }
      deleteIntent.markTransientFailure(); setErrorMessage("message" in outcome ? outcome.message : "This fact could not be deleted.");
    },
    onError: (reason: unknown) => { deleteIntent.markTransientFailure(); setErrorMessage(requestMessage(reason, "This fact could not be deleted.")); },
  });
  const resetEditor = () => { setDraft(current?.value ?? null); setEditShape(current?.value ?? null); setEditExpectedVersion(current?.version); setEditing(false); setErrorMessage(undefined); setConflictMessage(undefined); saveIntent.cancel(); };
  const dirty = Boolean(editing && current && JSON.stringify(draft) !== JSON.stringify(current.value));
  const requestClose = () => { if (dirty) setDismissWarning("close"); else onClose(); };
  const requestEditorCancel = () => { if (dirty) setDismissWarning("edit"); else resetEditor(); };
  const discardDraft = () => { const action = dismissWarning; setDismissWarning(undefined); if (action === "close") onClose(); else resetEditor(); };
  const requestSave = (event?: FormEvent) => { event?.preventDefault(); if (!current || save.isPending) return; save.mutate(saveIntent.capture({ key: current.key, value: draft }, { expectedVersion: editExpectedVersion ?? current.version })); };
  const retrySave = () => { if (!current || save.isPending) return; save.mutate(saveIntent.capture({ key: current.key, value: draft }, { expectedVersion: editExpectedVersion ?? current.version })); };
  const saveWithCurrentVersion = () => { if (!current || save.isPending) return; setEditExpectedVersion(current.version); save.mutate(saveIntent.capture({ key: current.key, value: draft }, { expectedVersion: current.version })); };
  const requestTransition = (action: "confirm" | "dismiss" | "archive" | "restore") => { if (!current || transition.isPending) return; transition.mutate(transitionIntent.capture({ key: current.key, action }, { expectedVersion: current.version })); };
  const requestDelete = () => { if (!current || deletion.isPending) return; deletion.mutate(deleteIntent.capture({ key: current.key }, { expectedVersion: current.version })); };
  const retryDelete = () => { const intent = deleteIntent.retry(); if (intent) deletion.mutate(intent); };
  const historyPage = history.data ?? (retainedHistory && retainedHistory.key === historyKey ? retainedHistory.page : undefined);
  const historyNextCursor = history.data?.nextCursor;
  const historyError = history.error ? requestMessage(history.error, "Change history could not be loaded.") : undefined;
  const historyAvailable = Boolean(current && record?.key === current.key && !loading && !error);
  const goHistoryNext = () => {
    if (!historyNextCursor || history.isFetching) return;
    setHistoryCursorHistory((previous) => [...previous, historyCursor]);
    setHistoryCursor(historyNextCursor);
  };
  const goHistoryPrevious = () => {
    if (history.isFetching || (!historyCursorHistory.length && !historyCursor)) return;
    setHistoryCursor(historyCursorHistory.at(-1));
    setHistoryCursorHistory((previous) => previous.slice(0, -1));
  };
  const editable = Boolean(current && current.mutability !== "read_only" && isEditableValue(current.value));
  const state = current?.state ?? "confirmed";
  const transitionActions = current?.mutability === "read_only" ? [] : state === "proposed" || state === "conflicted" ? ["confirm", "dismiss", "archive"] as const : state === "confirmed" ? ["archive"] as const : state === "archived" || state === "dismissed" ? ["restore"] as const : [];
  const reference = current ? { kind: "profile" as const, id: current.key, title: displayKey(current.key) } : undefined;
  const actions = current && !editing ? <div className="life-profile-inspector__actions">
    {editable ? <Button tone="secondary" onClick={() => { setEditShape(current.value); setEditExpectedVersion(current.version); setEditing(true); setErrorMessage(undefined); setConflictMessage(undefined); }}>Edit</Button> : null}
    {onAskKora && reference ? <Button tone="ghost" onClick={() => onAskKora(reference)}><Sparkles size={15} />Discuss</Button> : null}
    {transitionActions.map((action) => <Button key={action} tone="ghost" disabled={transition.isPending} onClick={() => requestTransition(action)}>{action === "archive" ? <><Archive size={15} />Archive</> : action === "restore" ? <><RotateCcw size={15} />Restore</> : action === "confirm" ? <><Check size={15} />Confirm</> : "Dismiss"}</Button>)}
    <Button tone="danger" disabled={deletion.isPending} onClick={requestDelete}><Trash2 size={15} />Delete</Button>
  </div> : null;

  return <Sheet open title={current && !loading && !error ? displayKey(current.key) : "About You fact"} description="Read the saved value, its source, and the retained change history." onOpenChange={(open) => { if (!open) requestClose(); }} onDismissAttempt={requestClose} dismissPolicy="explicit" onOpenChangeComplete={() => headingRef.current?.focus()} closeLabel="Close fact details" purpose="inspector" initialFocus={headingRef} finalFocus={false} actions={current && !loading && !error ? actions : undefined}>
    <article className="life-profile-inspector">
      {loading ? <StateView state="loading" title="Opening this fact" /> : error ? <StateView state="error" title="This fact could not be opened" body={requestMessage(error, "The exact saved fact is unavailable right now.")} action={<Button tone="secondary" onClick={onRetry}>Try again</Button>} /> : !current ? <StateView state="empty" title="This fact is unavailable" body="The exact record was not returned. The saved collection remains unchanged." action={<Link className="button button--secondary" to={onReturn}>Back to facts</Link>} /> : <>
        <header className="life-profile-inspector__identity"><div><span className="life-profile-kicker">{categoryLabel(current.category)}</span><h2 ref={headingRef} tabIndex={-1}>{displayKey(current.key)}</h2></div><span className={`life-profile-fact__state is-${state}`}>{stateLabel(state)}</span></header>
        {errorMessage ? <p className="life-profile-message" role="alert"><CircleAlert size={15} />{errorMessage}{deleteIntent.phase === "transient_failure" ? <Button tone="ghost" onClick={retryDelete}>Retry</Button> : null}</p> : null}
        {conflictMessage ? <div className="life-profile-message is-conflict" role="alert"><CircleAlert size={15} /><span>{conflictMessage}</span><div className="life-profile-conflict-current"><strong>Current saved value</strong><p>{valueSummary(current.value)}</p><small>Version {current.version} · {formatDate(current.updatedAt)}</small></div><Button tone="ghost" onClick={saveWithCurrentVersion}>Save with current version</Button></div> : null}
        {editing ? <form className="life-profile-editor" onSubmit={requestSave}><Field label="Saved value"><ValueEditor value={editShape} draft={draft} onChange={setDraft} /></Field>{saveIntent.phase === "transient_failure" && !conflictMessage ? <p className="life-profile-message" role="alert">The save did not complete. Your draft is preserved.<Button type="button" tone="ghost" onClick={retrySave}>Retry save</Button></p> : null}<div className="life-profile-editor__actions"><Button type="button" tone="ghost" onClick={requestEditorCancel}>Cancel</Button><Button type="submit" tone="primary" disabled={save.isPending}>{save.isPending ? <><KoraPresenceMark state="active" />Saving…</> : <><Check size={15} />Save</>}</Button></div></form> : <>
          <section className="life-profile-inspector__value" aria-labelledby="saved-value-heading"><h3 id="saved-value-heading">Saved value</h3><p>{valueSummary(current.value)}</p>{!editable && current.mutability === "read_only" ? <small><Eye size={14} />Readable here; this source-owned value cannot be edited in About You.</small> : null}{!editable && current.mutability !== "read_only" && typeof current.value === "object" ? <small><Info size={14} />This structured value is readable here. The editor supports simple values only.</small> : null}</section>
          {typeof current.value === "object" ? <details className="life-profile-inspector__details"><summary>Read structured details</summary><dl>{detailEntries(current.value).map((entry, index) => <div key={`${entry.path}:${index}`}><dt>{entry.path}</dt><dd>{entry.value}</dd></div>)}</dl></details> : null}
          <dl className="life-profile-inspector__meta"><div><dt>Source</dt><dd>{sourceLabel(current)}</dd></div><div><dt>Recorded provenance</dt><dd>{provenanceLabel(current.provenance)}</dd></div><div><dt>Last changed</dt><dd>{formatDate(current.updatedAt)}</dd></div><div><dt>Editing</dt><dd>{editingLabel(current)}</dd></div></dl>
          {current.source ? <details className="life-profile-inspector__details"><summary>Source details</summary><p>{current.source.label}. {current.source.correctionOwner === "owner" ? editable ? "You can review and correct this saved fact." : "You can review this saved fact here; its structured value cannot be edited in this view." : "The source remains responsible for corrections."}</p></details> : null}
          {historyAvailable ? <section className="life-profile-inspector__details" aria-labelledby="change-history-heading"><div className="life-profile-inspector__details-header"><h3 id="change-history-heading"><History size={14} />Change history</h3><Button tone="ghost" type="button" aria-expanded={historyOpen} aria-controls="profile-change-history" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Hide change history" : "Show change history"}</Button></div>{historyOpen ? <div id="profile-change-history">{historyError && historyPage ? <div className="life-profile-message" role="alert"><CircleAlert size={15} /><span>{historyError} Your last successful history page remains visible.</span><Button tone="ghost" onClick={() => void history.refetch()}>Retry history</Button></div> : null}{!historyPage && history.isPending ? <StateView state="loading" title="Reading change history" /> : !historyPage && historyError ? <div className="life-profile-message" role="alert"><CircleAlert size={15} /><span>{historyError}</span><Button tone="ghost" onClick={() => void history.refetch()}>Retry history</Button></div> : historyPage?.items.length ? <ol>{historyPage.items.map((entry) => <li key={`${entry.profileKey}:${entry.version}:${entry.recordedAt}`}><strong>{historyActionLabel(entry.action)} · {stateLabel(entry.state)}</strong><span>Version {entry.version} · {formatDate(entry.recordedAt)} · {provenanceLabel(entry.provenance)}</span></li>)}</ol> : historyPage ? <p>No changes are recorded for this fact.</p> : null}{historyPage ? <nav className="life-profile-pager" aria-label="Change history pages"><Button tone="ghost" disabled={history.isFetching || (!historyCursorHistory.length && !historyCursor)} onClick={goHistoryPrevious}>Previous</Button><span>{history.isFetching ? "Reading…" : `Page ${historyCursorHistory.length + 1}`}</span><Button tone="ghost" disabled={history.isFetching || !historyNextCursor} onClick={goHistoryNext}>Next</Button></nav> : null}</div> : null}</section> : null}
        </>}
        {dismissWarning ? <div ref={dismissRef} className="life-profile-message life-profile-discard" role="alert" tabIndex={-1}><strong>Discard this draft?</strong><span>Your unsaved changes have not been saved.</span><div className="life-profile-editor__actions"><Button type="button" tone="danger" onClick={discardDraft}>Discard draft</Button><Button type="button" tone="ghost" onClick={() => setDismissWarning(undefined)}>Keep editing</Button></div></div> : null}
      </>}
    </article>
    <ExactOperationConfirmation open={deleteConfirmations.length > 0} confirmationIds={deleteConfirmations} title="Delete this saved fact?" description="This removes the exact local fact after each required approval. Nothing changes until approval succeeds." approveLabel="Delete permanently" approveTone="danger" onOpenChange={(open) => { if (!open) setDeleteConfirmations([]); }} onApproved={async () => { setDeleteConfirmations([]); const intent = deleteIntent.retry(); if (intent) await deletion.mutateAsync(intent); }} onRejected={() => { setDeleteConfirmations([]); setErrorMessage("Deletion was not approved. This fact is unchanged."); }} />
  </Sheet>;
}

export function LifeProfileWorkspace({ onAskKora }: { onAskKora?: (reference: ConversationContextReference) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { factKey, profileKey } = useParams<{ factKey?: string; profileKey?: string }>();
  const pathCategory = isProfileCategory(profileKey ?? null) && location.pathname === `/life/about-you/${profileKey}` ? profileKey as AboutYouCategory : undefined;
  const exactKey = factKey ?? (profileKey && !pathCategory ? profileKey : undefined);
  const restoreKey = restoredFactKey(location.state);
  const overviewRoute = location.pathname === "/life/about-you";
  const query = searchParams.get("q")?.trim() ?? "";
  const state = isStateFilter(searchParams.get("state")) ? searchParams.get("state") as StateFilter : "active";
  const categoryFilter = overviewRoute && CATEGORY_OPTIONS.some((option) => option.value === searchParams.get("category")) ? searchParams.get("category")! : "all";
  const category = pathCategory ?? (categoryFilter === "all" ? undefined : categoryFilter as ProfileCategory);
  const cursor = searchParams.get("cursor") || undefined;
  const scopeBase = JSON.stringify({ category: category ?? "all", query, state });
  const scopeKey = `${scopeBase}:${cursor ?? "first"}`;
  const previousBase = useRef(scopeBase);
  const cursorHistory = useRef<Array<string | undefined>>([]);
  const cursorOriginKnown = useRef(!cursor);
  const retained = useRef<{ scopeBase: string; page: ProfilePage } | undefined>(undefined);
  const [addOpen, setAddOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<AboutYouCategory>(pathCategory ?? "identity");
  const [newFactChoice, setNewFactChoice] = useState(pathCategory ? (knownFactChoices(pathCategory)[0]?.key ?? CUSTOM_FACT_VALUE) : KNOWN_FACT_CHOICES[0].key);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newError, setNewError] = useState<string>();
  const [collisionKey, setCollisionKey] = useState<string>();
  const createIntent = useOperationIntent<{ key: string; value: BrainValue }, { expectedVersion: 0 }>();
  const overview = useQuery({ queryKey: ["about-you", "overview"], enabled: overviewRoute, retry: false, queryFn: () => runtime.profileOverview({ reviewLimit: 5, recentChangeLimit: 5 }) });
  const page = useQuery<ProfilePage>({ queryKey: ["about-you", "page", scopeKey], enabled: !exactKey, retry: false, queryFn: () => runtime.profilePage({ query: query || undefined, category, states: state === "active" ? ACTIVE_STATES : state === "all" ? ALL_STATES : [state], includeSetupArtifacts: false, pageSize: PAGE_SIZE, cursor }) });
  const exact = useQuery({ queryKey: ["about-you", "fact", exactKey], enabled: Boolean(exactKey), retry: false, queryFn: () => runtime.brainRecord("profile", exactKey!) });
  const context = { origin: (pathCategory ?? "overview") as "overview" | AboutYouCategory, query, state, category: overviewRoute ? category : undefined, cursor };
  const onOpen = (recordOrKey: ProfileRecord | string) => { const key = typeof recordOrKey === "string" ? recordOrKey : recordOrKey.key; navigate(detailPath(key, context)); };
  const backPath = useMemo(() => returnPath(searchParams), [searchParams]);
  const currentPage = page.data ?? (retained.current?.scopeBase === scopeBase ? retained.current.page : undefined);
  const pageError = page.error ? requestMessage(page.error, "Kora could not read these saved facts.") : undefined;
  const overviewError = overview.error ? requestMessage(overview.error, "The About You portrait could not be read.") : undefined;
  const retainedError = Boolean(pageError && currentPage);
  const nextCursor = page.data?.nextCursor ?? page.data?.cursor ?? (page.data ? undefined : currentPage?.nextCursor ?? currentPage?.cursor);
  const matchingCount = page.data?.matchingCount;
  const isInitialLoading = !exactKey && page.isPending;
  const overviewData = overview.data as (ProfileOverview & { restrictedOmitted?: boolean }) | undefined;

  useEffect(() => { if (previousBase.current !== scopeBase) { previousBase.current = scopeBase; cursorHistory.current = []; cursorOriginKnown.current = !cursor; retained.current = undefined; } }, [cursor, scopeBase]);
  useEffect(() => { if (page.isSuccess && page.data) retained.current = { scopeBase, page: page.data }; }, [page.data, page.isSuccess, scopeBase]);
  useLayoutEffect(() => {
    if (exactKey || !restoreKey || page.isPending || page.isFetching || !currentPage) return;
    const target = [...document.querySelectorAll<HTMLButtonElement>("[data-profile-key]")].find((candidate) => candidate.dataset.profileKey === restoreKey)
      ?? document.querySelector<HTMLInputElement>("[data-profile-fact-search]");
    if (!target) return;
    target.focus({ preventScroll: true });
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: undefined });
  }, [currentPage, exactKey, location.pathname, location.search, navigate, page.isFetching, page.isPending, restoreKey]);

  const updateCollection = (next: { query?: string; state?: StateFilter; category?: ProfileCategory | "all"; cursor?: string }) => setSearchParams((previous) => queryStateParams(previous, { query: next.query ?? query, state: next.state ?? state, category: next.category ?? categoryFilter as ProfileCategory | "all", cursor: next.cursor }));
  const goNext = () => { if (!nextCursor || page.isFetching) return; cursorHistory.current.push(cursor); updateCollection({ cursor: nextCursor }); };
  const goPrevious = () => { if (page.isFetching || (!cursorHistory.current.length && !cursor)) return; const hadTrail = cursorHistory.current.length > 0; if (!hadTrail && cursor) cursorOriginKnown.current = true; updateCollection({ cursor: hadTrail ? cursorHistory.current.pop() : undefined }); };

  const add = useMutation({
    mutationFn: async (intent: ReturnType<typeof createIntent.capture>) => {
      const outcome = await runtime.setProfileRecord(intent.payload.key, { value: intent.payload.value as BrainValue, expectedVersion: intent.concurrency.expectedVersion, requestKey: intent.requestKey });
      if (outcome.status === "conflict") throw Object.assign(new Error("That fact is already saved."), { collision: outcome.current });
      if (outcome.status !== "settled") throw new Error("message" in outcome ? outcome.message : "This fact could not be added.");
      return outcome.record;
    },
    onSuccess: (record) => { createIntent.settle(); setAddOpen(false); setNewName(""); setNewValue(""); setNewError(undefined); setCollisionKey(undefined); void overview.refetch(); void page.refetch(); onOpen(record); },
    onError: (reason: unknown) => { createIntent.markTransientFailure(); const collision = (reason as { collision?: ProfileRecord }).collision; if (collision) { setCollisionKey(collision.key); setNewError("That fact is already saved. Open it to review, or choose a different fact."); } else setNewError(requestMessage(reason, "This fact could not be added. Your draft is still here.")); },
  });
  const submitAdd = () => { const key = newFactKey; const value = newValue.trim(); if (!key) { setNewError("Give this fact a name using letters and at least one word."); return; } if (!value || add.isPending) return; add.mutate(createIntent.capture({ key, value }, { expectedVersion: 0 })); };
  const retryAdd = () => { const key = newFactKey; const value = newValue.trim(); if (!key) { setNewError("Give this fact a name using letters and at least one word."); return; } if (!value || add.isPending) return; add.mutate(createIntent.capture({ key, value }, { expectedVersion: 0 })); };

  const openAdd = () => {
    const category = pathCategory ?? "identity";
    const firstChoice = knownFactChoices(category)[0];
    setNewCategory(category);
    setNewFactChoice(firstChoice?.key ?? CUSTOM_FACT_VALUE);
    setNewName("");
    setNewValue("");
    setNewError(undefined);
    setCollisionKey(undefined);
    createIntent.cancel();
    setAddOpen(true);
  };
  const changeFactCategory = (value: string) => {
    const category = value as AboutYouCategory;
    setNewCategory(category);
    setNewError(undefined);
    setCollisionKey(undefined);
    if (newFactChoice !== CUSTOM_FACT_VALUE && !knownFactChoices(category).some((choice) => choice.key === newFactChoice)) {
      const firstChoice = knownFactChoices(category)[0];
      setNewFactChoice(firstChoice?.key ?? CUSTOM_FACT_VALUE);
      setNewName("");
    }
  };
  const changeFactChoice = (value: string) => {
    setNewFactChoice(value);
    setNewName("");
    setNewError(undefined);
    setCollisionKey(undefined);
  };

  const title = pathCategory ? CATEGORY_META[pathCategory].label : "About You";
  const description = pathCategory ? CATEGORY_META[pathCategory].purpose : "A readable portrait backed by facts you choose to save.";
  const headerActions = <Button tone="primary" onClick={openAdd}><Plus size={15} />Add fact</Button>;
  const selectedKnownFact = KNOWN_FACT_CHOICES.find((choice) => choice.key === newFactChoice);
  const newFactKey = newFactChoice === CUSTOM_FACT_VALUE ? customFactKeyForName(newCategory, newName) : newFactChoice;
  const collectionTitle = pathCategory ? `${CATEGORY_META[pathCategory].label} facts` : "All saved facts";
  const collectionBody = currentPage?.items ?? [];
  const collectionPageIndex = cursorOriginKnown.current ? cursorHistory.current.length + 1 : undefined;
  const renderCollection = () => <section className="life-profile-collection" aria-labelledby="about-you-facts-heading">
    <div className="life-profile-collection__head"><div><h2 id="about-you-facts-heading">{collectionTitle}</h2><p>{matchingCount !== undefined ? `${matchingCount} matching ${matchingCount === 1 ? "fact" : "facts"}` : `${collectionBody.length}${currentPage?.complete ? "" : "+"} visible on this page`}</p></div><div className={`life-profile-collection__controls ${overviewRoute ? "is-overview" : "is-category"}`}>
      <form className="life-profile-search" onSubmit={(event) => { event.preventDefault(); updateCollection({ query: (event.currentTarget.elements.namedItem("about-you-search") as HTMLInputElement)?.value.trim() ?? "" }); }}><SearchField inputRef={(node) => { if (node) { node.name = "about-you-search"; node.dataset.profileFactSearch = "true"; } }} value={query} onValueChange={(value) => setSearchParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set("q", value); else next.delete("q"); next.delete("cursor"); return next; })} label="Search saved facts" placeholder="Search saved facts" /></form>
      <KoraSelect label="Fact state" value={state} options={STATE_OPTIONS} onValueChange={(value) => updateCollection({ state: value as StateFilter })} />
      {overviewRoute ? <KoraSelect label="Fact category" value={categoryFilter} options={CATEGORY_OPTIONS} onValueChange={(value) => updateCollection({ category: value as ProfileCategory })} /> : null}
    </div></div>
    <CollectionState error={pageError} retained={retainedError} onRetry={() => void page.refetch()} />
    {isInitialLoading ? <StateView state="loading" title="Reading saved facts" /> : collectionBody.length ? <><ul className="life-profile-fact-list">{collectionBody.map((record) => <FactRow key={record.key} record={record} onOpen={onOpen} />)}</ul><CollectionPager page={currentPage} pageIndex={collectionPageIndex} previous={cursorHistory.current.length > 0 || Boolean(cursor)} previousLabel={cursor && !cursorHistory.current.length ? "Back to first page" : "Previous"} next={nextCursor} onPrevious={goPrevious} onNext={goNext} loading={page.isFetching} />{collectionQualification(currentPage, nextCursor, pageError) ? <p className="life-profile-qualified"><Clock3 size={14} />{collectionQualification(currentPage, nextCursor, pageError)}</p> : null}</> : pageError ? null : <StateView state="empty" title={query ? "No facts match that search" : "No saved facts in this view"} body={query ? "Try another phrase or clear the search." : "Facts you deliberately save will appear here."} action={query ? <Button tone="ghost" onClick={() => updateCollection({ query: "" })}>Clear search</Button> : <Button tone="secondary" onClick={openAdd}>Add your first fact</Button>} />}
  </section>;

  const renderOverview = () => <>
    {overviewData?.review.items.length ? <section className="life-profile-review" aria-labelledby="about-you-review-heading"><div className="life-profile-panel-heading"><div><h2 id="about-you-review-heading">Needs your review</h2><p>{overviewData.review.total} proposed or conflicted {overviewData.review.total === 1 ? "fact" : "facts"}{overviewData.review.complete ? "" : " · showing a limited projection"}</p></div><CircleAlert size={20} aria-hidden="true" /></div><ul>{overviewData.review.items.map((item) => <li key={`${item.support.key}:${item.support.version}`}><OverviewSupportLink support={item.support} onOpen={onOpen}>{item.text}</OverviewSupportLink><span>{stateLabel(item.state)} · {formatDate(item.updatedAt)}</span></li>)}</ul></section> : null}
    <section className="life-profile-portrait" aria-labelledby="about-you-portrait-heading"><div className="life-profile-panel-heading"><div><span className="life-profile-kicker">Your saved context</span><h2 id="about-you-portrait-heading">A portrait built from your facts</h2></div><UserRound size={22} aria-hidden="true" /></div>{overviewError ? <div className="life-profile-notice" role="alert"><CircleAlert size={16} /><span>{overviewError}</span><Button tone="ghost" onClick={() => void overview.refetch()}>Retry portrait</Button></div> : overviewData?.portrait.sections.some((section) => section.statements.length) ? <div className="life-profile-portrait__sections">{overviewData.portrait.sections.filter((section) => section.statements.length).map((section) => { const categoryCount = overviewData.counts.byCategory[section.category]; const statements = section.statements.slice(0, 2); return <section key={section.category} aria-labelledby={`portrait-${section.category}`}><div className="life-profile-portrait__category-head"><h3 id={`portrait-${section.category}`}>{categoryLabel(section.category)}</h3><Link className="life-profile-portrait__category-link" to={`/life/about-you/${section.category}`}>View all {categoryLabel(section.category)} facts{categoryCount !== undefined ? ` · ${categoryCount}` : ""}</Link></div><ul>{statements.map((statement) => <li key={`${statement.support.key}:${statement.support.version}`}><OverviewSupportLink support={statement.support} onOpen={onOpen}>{statement.text}</OverviewSupportLink><span className={`life-profile-fact__state is-${statement.state}`}>{stateLabel(statement.state)}</span></li>)}</ul></section>; })}</div> : <div className="life-profile-empty-copy"><p>Your portrait will appear here as you save stable facts.</p><Button tone="secondary" onClick={openAdd}>Add a fact</Button></div>}<p className="life-profile-portrait__qualification">{overviewData?.complete ? `${overviewData.counts.active} current facts across five categories.` : "This portrait is a bounded projection of your saved facts."} {overviewData?.restrictedOmitted ? "Some restricted records are omitted from this view." : null}</p></section>
    {overviewData && overviewData.recentChanges.total > 0 ? <details className="life-profile-history"><summary><History size={15} />Recent changes · {overviewData.recentChanges.total}</summary>{overviewData.recentChanges.items.length ? <ul>{overviewData.recentChanges.items.map((item) => <li key={`${item.support.key}:${item.support.version}`}><OverviewSupportLink support={item.support} onOpen={onOpen}>{item.action} · {categoryLabel(item.category)}</OverviewSupportLink><time dateTime={item.recordedAt}>{formatDate(item.recordedAt)}</time></li>)}</ul> : <p>No recent changes are available.</p>}{!overviewData.recentChanges.complete ? <p className="life-profile-qualified">Showing a limited recent-change projection.</p> : null}</details> : null}
    {renderCollection()}
  </>;

  return <PageFrame width="standard" className={`life-profile-workspace${pathCategory ? " life-profile-workspace--category" : ""}`}>
    <PageHeader title={title} description={description} status={pathCategory ? undefined : overviewData ? `${overviewData.counts.visible} saved facts` : undefined} actions={headerActions} />
    {pathCategory ? <div className="life-profile-route-context"><Link to="/life/about-you"><ArrowLeft size={15} />About You overview</Link></div> : null}
    {addOpen ? <section className="life-profile-add" aria-label="Add a saved fact"><header><div><span className="life-profile-kicker">New saved fact</span><h2>Add a fact</h2></div><IconButton label="Close add fact" onClick={() => setAddOpen(false)}>×</IconButton></header><form onSubmit={(event) => { event.preventDefault(); submitAdd(); }}><KoraSelect label="Fact category" value={newCategory} options={FACT_CATEGORY_OPTIONS} disabled={Boolean(pathCategory)} onValueChange={changeFactCategory} /><KoraSelect label="Fact to save" value={newFactChoice} options={[...knownFactChoices(newCategory).map((choice) => ({ value: choice.key, label: choice.label, description: choice.description })), { value: CUSTOM_FACT_VALUE, label: "Custom fact", description: "Name a fact in ordinary language; Kora will save it under this category." }]} onValueChange={changeFactChoice} />{newFactChoice === CUSTOM_FACT_VALUE ? <Field label="Fact name" hint="Use a short name such as Weekend routine; Kora will save it under this category."><Input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="For example, Weekend routine" /></Field> : null}<Field label={selectedKnownFact?.label ?? "Value"} hint={selectedKnownFact?.description}><Textarea value={newValue} onChange={(event) => setNewValue(event.target.value)} rows={3} placeholder={selectedKnownFact ? `What ${selectedKnownFact.label.toLowerCase()} should Kora remember?` : "What should Kora remember?"} /></Field>{newError ? <div className="life-profile-message life-profile-add__error" role="alert"><CircleAlert size={15} /><span>{newError}</span>{collisionKey ? <div className="life-profile-add__collision-actions"><Button type="button" tone="ghost" onClick={() => { setAddOpen(false); onOpen(collisionKey); }}>Open saved fact</Button><Button type="button" tone="ghost" onClick={() => { setNewError(undefined); setCollisionKey(undefined); createIntent.cancel(); }}>Choose another fact</Button></div> : createIntent.phase === "transient_failure" ? <Button type="button" tone="ghost" onClick={retryAdd}>Retry add</Button> : null}</div> : null}<div className="life-profile-editor__actions"><Button type="button" tone="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" tone="primary" disabled={!newValue.trim() || add.isPending}>{add.isPending ? "Saving…" : "Add fact"}</Button></div></form></section> : null}
    {!exactKey ? overviewRoute ? overview.isPending && !overviewData ? <StateView state="loading" title="Reading your saved context" /> : renderOverview() : renderCollection() : null}
    {exactKey ? <ProfileInspector record={exact.data?.record} loading={exact.isPending} error={exact.error} onClose={() => navigate(backPath, { state: { aboutYouReturn: { version: 1, key: exactKey } } })} onAskKora={onAskKora} onChanged={() => { void page.refetch(); void overview.refetch(); }} onDeleted={() => navigate(backPath, { state: { aboutYouReturn: { version: 1, key: exactKey } } })} onRetry={() => void exact.refetch()} onReturn={backPath} /> : null}
  </PageFrame>;
}
