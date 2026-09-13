import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  Link2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Streamdown } from "streamdown";
import { Button, Field, IconButton, Input, KoraPresenceMark, KoraSelect, PageHeader, SearchField, Textarea } from "../../components/primitives";
import {
  runtime,
  type BrainCursorPage,
  type BrainDeletionOutcome,
  type BrainMutationOutcome,
  type BrainSearchPage,
  type ConversationContextRequest,
  type PersonRecord,
  type ProviderReference,
  RuntimeRequestError,
} from "../../lib/runtime";
import "./people.css";
import { EmptyState, Item, StateView } from "../../components/display";
import { count } from "../../lib/language";
import { useLedgerKeyboard, type LedgerRowProps } from "../../lib/use-ledger-keyboard";
import { DUR, EASE } from "../../lib/motion";
import { useDirtyDraftGuard } from "../../app/DirtyDraftGuard";
import {
  conversationContextKey,
  conversationContextReady,
} from "../conversation/conversation-context";
import { useOperationIntent } from "./useOperationIntent";
import {
  ExactOperationConfirmation,
  type ExactOperationConfirmationClient,
} from "./ExactOperationConfirmation";

export type PersonDirectoryEntry = PersonRecord;

export type PersonWorkRelation = {
  recordType: "project" | "work_item";
  id: string;
  title: string;
  state: string;
  route: string;
};

export type PersonWorkspaceView = {
  person: PersonRecord;
  work: {
    items: PersonWorkRelation[];
    cursor?: string;
    complete: boolean;
  };
};

export type PersonDeletionOutcome = BrainDeletionOutcome;

export type PeopleClient = ExactOperationConfirmationClient & {
  peoplePage(input?: {
    query?: string;
    order?: "name_asc" | "updated_desc";
    pageSize?: number;
    cursor?: string;
  }): Promise<BrainCursorPage<PersonDirectoryEntry>>;
  personWorkspace(
    id: string,
    input?: { workPageSize?: number; workCursor?: string },
  ): Promise<PersonWorkspaceView>;
  createPerson(input: {
    displayName: string;
    relationshipLabel?: string;
    contextMarkdown?: string;
    providerRefs: ProviderReference[];
    requestKey?: string;
  }): Promise<BrainMutationOutcome<PersonRecord>>;
  updatePerson(id: string, input: {
    displayName: string;
    relationshipLabel?: string;
    contextMarkdown?: string;
    providerRefs: ProviderReference[];
    expectedVersion: number;
    requestKey?: string;
  }): Promise<BrainMutationOutcome<PersonRecord>>;
  deleteBrainRecord(
    surface: "person",
    id: string,
    input: { expectedVersion: number; requestKey?: string },
  ): Promise<PersonDeletionOutcome>;
  personalBrainSearchPage(
    input: { query: string; pageSize?: number; cursor?: string },
    signal?: AbortSignal,
  ): Promise<BrainSearchPage>;
};

type PersonDraft = {
  id?: string;
  displayName: string;
  relationshipLabel: string;
  contextMarkdown: string;
  providerRefs: ProviderReference[];
  expectedVersion?: number;
};

type PersonSavePayload = {
  displayName: string;
  relationshipLabel?: string;
  contextMarkdown?: string;
  providerRefs: ProviderReference[];
};

type PersonSaveConcurrency =
  | { mode: "create" }
  | { mode: "update"; personId: string; expectedVersion: number };

const peopleClient = runtime as typeof runtime & PeopleClient;
type PeopleDirectoryFocus = { personId: string; scrollTop: number };
type PeopleDirectoryTransition = PeopleDirectoryFocus & { restoreFocus: boolean };
const PEOPLE_VIRTUALIZATION_THRESHOLD = 100;
let peopleDirectoryOrigin: PeopleDirectoryFocus | undefined;
let pendingPeopleDirectoryFocus: PeopleDirectoryFocus | undefined;
const emptyDraft = (): PersonDraft => ({
  displayName: "",
  relationshipLabel: "",
  contextMarkdown: "",
  providerRefs: [],
});
const draftFrom = (person: PersonRecord): PersonDraft => ({
  id: person.id,
  displayName: person.displayName,
  relationshipLabel: person.relationshipLabel ?? "",
  contextMarkdown: person.contextMarkdown ?? "",
  providerRefs: person.providerRefs,
  expectedVersion: person.version,
});
const refsEqual = (left: ProviderReference[], right: ProviderReference[]) =>
  JSON.stringify(left) === JSON.stringify(right);
const sameDraft = (draft: PersonDraft, person?: PersonRecord) =>
  person
    ? draft.displayName === person.displayName &&
      draft.relationshipLabel === (person.relationshipLabel ?? "") &&
      draft.contextMarkdown === (person.contextMarkdown ?? "") &&
      refsEqual(draft.providerRefs, person.providerRefs)
    : !draft.displayName &&
      !draft.relationshipLabel &&
      !draft.contextMarkdown &&
      draft.providerRefs.length === 0;
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
const compactContext = (value?: string) =>
  value?.replace(/[#*_>`[\]]/g, "").replace(/\s+/g, " ").trim() || "No context written yet";
const availabilityLabel = (value?: ProviderReference["availability"]) =>
  ({
    available: "Available",
    unverified: "Not verified",
    unavailable: "Unavailable",
    degraded: "Degraded",
  })[value ?? "unverified"];
const workStateLabel = (value: string) =>
  ({
    planned: "Planned",
    active: "Active",
    blocked: "Blocked",
    completed: "Completed",
    cancelled: "Cancelled",
    archived: "Archived",
  } as Record<string, string>)[value] ?? value.replace(/_/g, " ");
const searchScopeLabel = (value: string) =>
  value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
const personProvenanceLabel = (value: PersonRecord["provenance"]) =>
  ({
    user_explicit: "Added by you",
    user_correction: "Corrected by you",
    user_confirmation: "Confirmed by you",
    agent_proposal: "Proposed by Kora",
    system_read_only: "System owned",
  } as Partial<Record<PersonRecord["provenance"], string>>)[value] ?? "Saved person record";
const peopleVirtualRowHeight = () => {
  if (typeof document === "undefined") return 52;
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-double"));
  return Number.isFinite(value) && value > 0 ? value : 52;
};

function PersonRow({
  person,
  current,
  rowProps,
  onOpen,
  directorySearch,
  virtual,
}: {
  person: PersonDirectoryEntry;
  current: boolean;
  rowProps: LedgerRowProps;
  onOpen: (personId: string, event: MouseEvent<HTMLLIElement>) => void;
  directorySearch: string;
  virtual?: {
    index: number;
    start: number;
    size: number;
    total: number;
    measureElement: (element: Element | null) => void;
  };
}) {
  // Shared Item owns readable identity and density-aware row metrics.
  const content = (
    <Item
      kind="link"
      title={person.displayName}
      description={
        <>
          {person.relationshipLabel || "Relationship not labeled"}
          {compactContext(person.contextMarkdown) && (
            <>
              <span aria-hidden> · </span>
              {compactContext(person.contextMarkdown)}
            </>
          )}
        </>
      }
      leading={<span className="brain-person-initials" aria-hidden="true">{initials(person.displayName)}</span>}
      selected={current}
      href={`/brain/people/${encodeURIComponent(person.id)}${directorySearch}`}
      lines={2}
      rowProps={rowProps}
    />
  );
  if (virtual) {
    return (
      <li
        className="brain-person-list__virtual-row"
        data-person-id={person.id}
        data-index={virtual.index}
        aria-posinset={virtual.index + 1}
        aria-setsize={virtual.total}
        ref={virtual.measureElement}
        style={{ transform: `translateY(${virtual.start}px)` }}
        onClickCapture={(event) => onOpen(person.id, event)}
      >
        {content}
      </li>
    );
  }
  return (
    <motion.li
      layout="position"
      data-person-id={person.id}
      transition={{ duration: DUR.base, ease: EASE.out }}
      onClickCapture={(event) => onOpen(person.id, event)}
    >
      {content}
    </motion.li>
  );
}

function ProviderReferenceEditor({
  references,
  onChange,
}: {
  references: ProviderReference[];
  onChange: (references: ProviderReference[]) => void;
}) {
  const update = (index: number, changes: Partial<ProviderReference>) =>
    onChange(references.map((reference, candidate) =>
      candidate === index ? { ...reference, ...changes } : reference));
  return (
    <section className="brain-person-reference-editor" aria-labelledby="person-provider-heading">
      <div className="brain-person-editor__section-head">
        <div>
          <h2 id="person-provider-heading">Provider references</h2>
          <p>Exact records that identify this person in a connected provider.</p>
        </div>
        <Button
          tone="ghost"
          disabled={references.length >= 20}
          onClick={() => onChange([...references, {
            providerId: "",
            providerKind: "",
            recordId: "",
            label: "",
            availability: "unverified",
          }])}
        >
          <Plus size={14} />Add reference
        </Button>
      </div>
      {references.length === 0 ? (
        <p className="brain-person-reference-editor__empty">No provider records connected.</p>
      ) : references.map((reference, index) => (
        <motion.div
          layout
          className="brain-person-reference-form"
          key={`${index}:${reference.providerId}:${reference.recordId}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Field label="Provider" htmlFor={`person-reference-${index}-provider`}>
            <Input
              id={`person-reference-${index}-provider`}
              aria-label={`Reference ${index + 1} provider`}
              value={reference.providerId}
              placeholder="google-workspace"
              onChange={(event) => update(index, { providerId: event.target.value })}
            />
          </Field>
          <Field label="Record type" htmlFor={`person-reference-${index}-kind`}>
            <Input
              id={`person-reference-${index}-kind`}
              aria-label={`Reference ${index + 1} record type`}
              value={reference.providerKind}
              placeholder="contact"
              onChange={(event) => update(index, { providerKind: event.target.value })}
            />
          </Field>
          <Field label="Record ID" htmlFor={`person-reference-${index}-record`}>
            <Input
              id={`person-reference-${index}-record`}
              aria-label={`Reference ${index + 1} record ID`}
              value={reference.recordId}
              placeholder="Exact provider identifier"
              onChange={(event) => update(index, { recordId: event.target.value })}
            />
          </Field>
          <Field label="Label" htmlFor={`person-reference-${index}-label`}>
            <Input
              id={`person-reference-${index}-label`}
              aria-label={`Reference ${index + 1} label`}
              value={reference.label}
              placeholder="Work contact"
              onChange={(event) => update(index, { label: event.target.value })}
            />
          </Field>
          <KoraSelect
            label={`Reference ${index + 1} availability`}
            value={reference.availability ?? "unverified"}
            onValueChange={(value) => update(index, {
              availability: value as ProviderReference["availability"],
            })}
            options={[
              { value: "available", label: "Available" },
              { value: "unverified", label: "Not verified" },
              { value: "unavailable", label: "Unavailable" },
              { value: "degraded", label: "Degraded" },
            ]}
          />
          <IconButton
            label={`Remove reference ${index + 1}`}
            onClick={() => onChange(references.filter((_, candidate) => candidate !== index))}
          >
            <X size={15} />
          </IconButton>
        </motion.div>
      ))}
    </section>
  );
}

export function PeopleWorkspace({
  onAskKora,
  client = peopleClient,
}: {
  onAskKora?: (reference: ConversationContextRequest) => void;
  client?: PeopleClient;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ personId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  useEffect(() => () => {
    pendingPeopleDirectoryFocus = undefined;
    peopleDirectoryOrigin = undefined;
  }, []);
  const personId = params.personId;
  const routeState = location.state as {
    directoryOrigin?: { personId: string; scrollTop: number };
    directoryReturn?: { personId: string; scrollTop: number };
    focusDetailOnOpen?: boolean;
  } | null;
  const isNew = location.pathname.endsWith("/new");
  const routeEditing = isNew || location.pathname.endsWith("/edit");
  const query = searchParams.get("q") ?? "";
  const deferredQuery = useDeferredValue(query.trim());
  const directoryOrder = searchParams.get("sort") === "recent" ? "updated_desc" : "name_asc";
  const [draft, setDraft] = useState<PersonDraft>(emptyDraft);
  const [editing, setEditing] = useState(routeEditing);
  const [conflict, setConflict] = useState<PersonRecord>();
  const [error, setError] = useState<string>();
  const [settled, setSettled] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [deleteConfirmationIds, setDeleteConfirmationIds] = useState<string[]>([]);
  const directoryRef = useRef<HTMLDivElement>(null);
  const detailBackRef = useRef<HTMLButtonElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailRetryRef = useRef<HTMLButtonElement>(null);
  const pendingKeyboardRecoveryFocus = useRef(false);
  const activePersonIdRef = useRef(personId);
  activePersonIdRef.current = personId;
  const focusedDetailEntry = useRef<string | undefined>(undefined);
  const pendingDirectoryTransition = useRef<PeopleDirectoryTransition | undefined>(undefined);
  const restoredDirectoryFocus = useRef<string | undefined>(undefined);
  const directoryRestoreFrame = useRef<number | undefined>(undefined);
  const directoryRestoreSequence = useRef(0);
  const editorVisible = routeEditing || editing;
  const saveOperation = useOperationIntent<PersonSavePayload, PersonSaveConcurrency>();
  const deleteOperation = useOperationIntent<
    { surface: "person"; id: string },
    { expectedVersion: number }
  >();

  const directory = useInfiniteQuery({
    queryKey: ["brain", "people", deferredQuery, directoryOrder],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.peoplePage({
      query: deferredQuery || undefined,
      order: directoryOrder,
      pageSize: 50,
      cursor: pageParam,
    }),
    getNextPageParam: (page) => page.cursor,
  });
  const people = useMemo(
    () => directory.data?.pages.flatMap((page) => page.items) ?? [],
    [directory.data],
  );
  const latestDirectoryPage = directory.data?.pages.at(-1);
  const directoryIsComplete = latestDirectoryPage?.complete === true && !directory.hasNextPage;
  const virtualizedDirectory = people.length > PEOPLE_VIRTUALIZATION_THRESHOLD;
  const personIndexById = useMemo(() => {
    const indexes = new Map<string, number>();
    people.forEach((person, index) => indexes.set(person.id, index));
    return indexes;
  }, [people]);
  const ledger = useLedgerKeyboard({
    count: people.length,
    scrollToIndex: virtualizedDirectory
      ? (index) => peopleVirtualizer.scrollToIndex(index, { align: "auto" })
      : undefined,
  });
  const peopleVirtualizer = useVirtualizer({
    count: virtualizedDirectory ? people.length : 0,
    enabled: virtualizedDirectory,
    getScrollElement: () => directoryRef.current,
    estimateSize: peopleVirtualRowHeight,
    getItemKey: (index) => people[index]?.id ?? index,
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      const transitionIndex = pendingDirectoryTransition.current
        ? personIndexById.get(pendingDirectoryTransition.current.personId)
        : undefined;
      return [...new Set([
        ...visible,
        ledger.focusedIndex,
        ...(transitionIndex === undefined ? [] : [transitionIndex]),
      ])].sort((left, right) => left - right);
    },
    overscan: 8,
    initialRect: { width: 340, height: 620 },
  });
  const virtualPeople = virtualizedDirectory ? peopleVirtualizer.getVirtualItems() : [];
  useLayoutEffect(() => {
    const pending = pendingDirectoryTransition.current;
    if (!pending || !virtualizedDirectory) return;
    pendingDirectoryTransition.current = undefined;
    const directoryNode = directoryRef.current;
    const index = personIndexById.get(pending.personId);
    if (!directoryNode || index === undefined) return;

    let frame: number | undefined;
    const restoreAnchorFocus = (attempt = 0) => {
      peopleVirtualizer.scrollToIndex(index, { align: "auto" });
      if (!pending.restoreFocus) {
        directoryNode.scrollTop = pending.scrollTop;
        return true;
      }
      const target = [...directoryNode.querySelectorAll<HTMLElement>("[data-person-id]")]
        .find((candidate) => candidate.dataset.personId === pending.personId)
        ?.querySelector<HTMLAnchorElement>("a[href]");
      if (!target) {
        if (attempt < 3) frame = window.requestAnimationFrame(() => restoreAnchorFocus(attempt + 1));
        return false;
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: "center" });
      if (document.activeElement === target) return true;
      if (attempt < 3) frame = window.requestAnimationFrame(() => restoreAnchorFocus(attempt + 1));
      return false;
    };
    restoreAnchorFocus();
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, [people.length, peopleVirtualizer, personIndexById, virtualizedDirectory]);
  const restoreDirectoryFocus = useCallback(() => {
    const pending = pendingPeopleDirectoryFocus ?? routeState?.directoryReturn;
    if (
      personId ||
      !pending ||
      people.length === 0 ||
      restoredDirectoryFocus.current === pending.personId
    ) return;
    const directoryNode = directoryRef.current;
    if (!directoryNode) return;
    const index = personIndexById.get(pending.personId);
    if (index === undefined) return;

    directoryRestoreSequence.current += 1;
    const sequence = directoryRestoreSequence.current;
    if (directoryRestoreFrame.current !== undefined) {
      window.cancelAnimationFrame(directoryRestoreFrame.current);
      directoryRestoreFrame.current = undefined;
    }

    let stableFrames = 0;
    const restoreExactRow = () => {
      if (sequence !== directoryRestoreSequence.current || activePersonIdRef.current) return;
      const target = [...directoryNode.querySelectorAll<HTMLElement>("[data-person-id]")]
        .find((candidate) => candidate.dataset.personId === pending.personId)
        ?.querySelector<HTMLAnchorElement>("a[href]");
      if (!target) {
        stableFrames = 0;
        if (virtualizedDirectory) {
          peopleVirtualizer.measure();
          peopleVirtualizer.scrollToIndex(index, { align: "auto" });
        }
        directoryRestoreFrame.current = window.requestAnimationFrame(restoreExactRow);
        return;
      }

      if (directoryNode.scrollTop !== pending.scrollTop) directoryNode.scrollTop = pending.scrollTop;
      if (document.activeElement !== target) target.focus({ preventScroll: true });

      const exact = document.activeElement === target && directoryNode.scrollTop === pending.scrollTop;
      stableFrames = exact ? stableFrames + 1 : 0;
      if (stableFrames < 2) {
        directoryRestoreFrame.current = window.requestAnimationFrame(restoreExactRow);
        return;
      }

      directoryRestoreFrame.current = undefined;
      restoredDirectoryFocus.current = pending.personId;
      pendingPeopleDirectoryFocus = undefined;
      peopleDirectoryOrigin = undefined;
    };
    directoryNode.scrollTop = pending.scrollTop;
    restoreExactRow();
  }, [people.length, peopleVirtualizer, personId, personIndexById, routeState?.directoryReturn, virtualizedDirectory]);
  useEffect(() => {
    if (personId) return;
    restoreDirectoryFocus();
    return () => {
      directoryRestoreSequence.current += 1;
      if (directoryRestoreFrame.current !== undefined) {
        window.cancelAnimationFrame(directoryRestoreFrame.current);
        directoryRestoreFrame.current = undefined;
      }
    };
  }, [personId, restoreDirectoryFocus]);
  const workspace = useInfiniteQuery({
    queryKey: ["brain", "person", personId],
    enabled: Boolean(personId) && !isNew,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.personWorkspace(personId!, {
      workPageSize: 50,
      workCursor: pageParam,
    }),
    getNextPageParam: (page) => page.work.cursor,
  });
  const workspacePages = workspace.data?.pages ?? [];
  const presentationPages = workspacePages;
  const canonical = presentationPages[0]?.person;
  const relatedWork = useMemo(
    () => presentationPages.flatMap((page) => page.work.items),
    [presentationPages],
  );
  const relatedWorkIncomplete = presentationPages.some((page) => !page.work.complete);
  const focusDetailTarget = useCallback(() => {
    const back = detailBackRef.current;
    const backIsVisible = back && window.getComputedStyle(back).display !== "none";
    const target = backIsVisible ? back : detailHeadingRef.current;
    target?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!personId || !canonical || !routeState?.focusDetailOnOpen || focusedDetailEntry.current === location.key) return;
    focusedDetailEntry.current = location.key;
    const frame = window.requestAnimationFrame(focusDetailTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [canonical, focusDetailTarget, location.key, personId, routeState?.focusDetailOnOpen]);
  useEffect(() => {
    if (!canonical || !pendingKeyboardRecoveryFocus.current) return;
    pendingKeyboardRecoveryFocus.current = false;
    const frame = window.requestAnimationFrame(focusDetailTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [canonical, focusDetailTarget]);
  useEffect(() => {
    if (!personId || !workspace.isError || !routeState?.focusDetailOnOpen) return;
    const frame = window.requestAnimationFrame(() => detailRetryRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [personId, routeState?.focusDetailOnOpen, workspace.isError]);
  const dirty = editorVisible && !sameDraft(draft, isNew ? undefined : canonical);
  const draftGuard = useDirtyDraftGuard({
    id: `brain-person:${personId ?? "new"}`,
    label: "Person draft",
    dirty,
    onDiscard: () => {
      setDraft(canonical ? draftFrom(canonical) : emptyDraft());
      setConflict(undefined);
      setError(undefined);
    },
  });

  useEffect(() => setEditing(routeEditing), [routeEditing, personId]);
  useEffect(() => {
    if (isNew) {
      setDraft(emptyDraft());
      setConflict(undefined);
      return;
    }
    if (canonical && (!dirty || draft.id !== canonical.id)) {
      setDraft(draftFrom(canonical));
      setConflict(undefined);
    }
    // Dirty drafts intentionally survive background canonical refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical?.id, canonical?.version, isNew]);
  useEffect(() => {
    setShowMatches(false);
    setConfirmDelete(false);
    setError(undefined);
  }, [personId]);

  const matches = useQuery({
    queryKey: ["brain", "person-matches", canonical?.id, canonical?.displayName],
    enabled: showMatches && Boolean(canonical),
    queryFn: ({ signal }) => client.personalBrainSearchPage({
      query: canonical!.displayName,
      pageSize: 24,
    }, signal),
  });
  const searchMatches = matches.data?.results ?? [];

  const save = useMutation({
    mutationFn: (intent: NonNullable<typeof saveOperation.intent>) => {
      const input = {
        ...intent.payload,
        providerRefs: intent.payload.providerRefs.map((reference) => ({ ...reference })),
        requestKey: intent.requestKey,
      };
      return intent.concurrency.mode === "create"
        ? client.createPerson(input)
        : client.updatePerson(intent.concurrency.personId, {
          ...input,
          expectedVersion: intent.concurrency.expectedVersion,
        });
    },
    onSuccess: async (outcome) => {
      setError(undefined);
      if (outcome.status === "conflict") {
        saveOperation.resolveConflict();
        setConflict(outcome.current);
        return;
      }
      if (outcome.status === "validation_failure") {
        saveOperation.cancel();
        setError(outcome.message);
        return;
      }
      if (outcome.status !== "settled") {
        saveOperation.markGone();
        setError("This person no longer exists.");
        return;
      }
      saveOperation.settle();
      setDraft(draftFrom(outcome.record));
      setConflict(undefined);
      setEditing(false);
      setSettled(outcome.replayed ? "This change was already settled." : "Saved");
      await queryClient.invalidateQueries({ queryKey: ["brain", "people"] });
      await queryClient.invalidateQueries({ queryKey: ["brain", "person", outcome.record.id] });
      draftGuard.release();
      navigate(`/brain/people/${encodeURIComponent(outcome.record.id)}`, { replace: isNew });
      window.setTimeout(() => setSettled(undefined), 1600);
    },
    onError: (reason) => {
      saveOperation.markTransientFailure();
      setError(reason instanceof Error ? reason.message : "This person could not be saved.");
    },
  });

  const beginSave = () => {
    const refsValid = draft.providerRefs.every((reference) =>
      reference.providerId.trim() &&
      reference.providerKind.trim() &&
      reference.recordId.trim() &&
      reference.label.trim());
    if (!draft.displayName.trim()) {
      setError("Give this person a name before saving.");
      return;
    }
    if (!refsValid) {
      setError("Complete every provider reference or remove the unfinished row.");
      return;
    }
    const payload: PersonSavePayload = {
      displayName: draft.displayName.trim(),
      ...(draft.relationshipLabel.trim()
        ? { relationshipLabel: draft.relationshipLabel.trim() }
        : {}),
      ...(draft.contextMarkdown.trim()
        ? { contextMarkdown: draft.contextMarkdown }
        : {}),
      providerRefs: draft.providerRefs.map((reference) => ({
        ...reference,
        providerId: reference.providerId.trim(),
        providerKind: reference.providerKind.trim(),
        recordId: reference.recordId.trim(),
        label: reference.label.trim(),
      })),
    };
    const concurrency: PersonSaveConcurrency = isNew
      ? { mode: "create" }
      : { mode: "update", personId: personId!, expectedVersion: draft.expectedVersion! };
    setError(undefined);
    save.mutate(saveOperation.capture(payload, concurrency));
  };

  const deletion = useMutation({
    mutationFn: (intent: NonNullable<typeof deleteOperation.intent>) => client.deleteBrainRecord(
      intent.payload.surface,
      intent.payload.id,
      {
      expectedVersion: intent.concurrency.expectedVersion,
      requestKey: intent.requestKey,
    }),
    onSuccess: async (outcome) => {
      if (outcome.status === "waiting_confirmation") {
        deleteOperation.markWaitingForConfirmation();
        setDeleteConfirmationIds(outcome.confirmations.map((item) => item.confirmationId));
        setConfirmDelete(false);
        return;
      }
      if (outcome.status === "conflict") {
        if (outcome.current && "displayName" in outcome.current) setConflict(outcome.current);
        deleteOperation.resolveConflict();
        setConfirmDelete(false);
        return;
      }
      if (outcome.status !== "settled") {
        if (outcome.status === "uncertain") deleteOperation.markTransientFailure();
        else if (outcome.status === "gone") deleteOperation.markGone();
        else deleteOperation.cancel();
        setError(outcome.status === "gone"
          ? "This person was already deleted."
          : "message" in outcome
            ? outcome.message
            : "This person could not be deleted.");
        return;
      }
      deleteOperation.settle();
      setDeleteConfirmationIds([]);
      await queryClient.invalidateQueries({ queryKey: ["brain", "people"] });
      queryClient.removeQueries({ queryKey: ["brain", "person", personId] });
      draftGuard.release();
      navigate("/brain/people", { replace: true });
    },
    onError: (reason) =>
      {
        deleteOperation.markTransientFailure();
        setError(reason instanceof Error ? reason.message : "This person could not be deleted.");
      },
  });

  const safelyNavigate = (target: string) => navigate({ pathname: target, search: location.search });
  const updateDirectoryParam = (key: "q" | "sort", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || (key === "sort" && value === "name")) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const openPerson = (targetPersonId: string, event: MouseEvent<HTMLLIElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) return;
    event.preventDefault();
    pendingPeopleDirectoryFocus = undefined;
    restoredDirectoryFocus.current = undefined;
    peopleDirectoryOrigin = {
      personId: targetPersonId,
      scrollTop: directoryRef.current?.scrollTop ?? 0,
    };
    navigate({ pathname: `/brain/people/${encodeURIComponent(targetPersonId)}`, search: location.search }, {
      state: {
        directoryOrigin: peopleDirectoryOrigin,
        focusDetailOnOpen: event.detail === 0,
      },
    });
  };
  const returnToDirectory = () => {
    pendingPeopleDirectoryFocus = routeState?.directoryOrigin ?? peopleDirectoryOrigin ?? {
      personId: personId ?? "",
      scrollTop: directoryRef.current?.scrollTop ?? 0,
    };
    navigate({ pathname: "/brain/people", search: location.search }, {
      state: {
        ...(location.state && typeof location.state === "object" ? location.state : {}),
        directoryReturn: pendingPeopleDirectoryFocus,
      },
    });
  };
  const grouped = useMemo(() => {
    if (virtualizedDirectory) return [];
    const groups = new Map<string, PersonDirectoryEntry[]>();
    for (const person of people) {
      const letter = person.displayName.trim()[0]?.toLocaleUpperCase() || "#";
      const entries = groups.get(letter);
      if (entries) entries.push(person);
      else groups.set(letter, [person]);
    }
    return [...groups.entries()];
  }, [people, virtualizedDirectory]);
  const flatIndexById = personIndexById;
  const continueDirectory = () => {
    const directoryNode = directoryRef.current;
    const activeRow = directoryNode && document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLAnchorElement>("a[href^='/brain/people/']")
      : null;
    const activeId = activeRow?.getAttribute("href")?.split("/").at(-1);
    const anchor = activeId
      ? people.find((candidate) => encodeURIComponent(candidate.id) === activeId)
      : people.at(-1);
    if (directoryNode && anchor) {
      pendingDirectoryTransition.current = {
        personId: anchor.id,
        scrollTop: directoryNode.scrollTop,
        restoreFocus: document.activeElement instanceof HTMLElement && directoryNode.contains(document.activeElement),
      };
    }
    void directory.fetchNextPage();
  };

  return (
    <>
      <PageHeader
        className="brain-canvas-page-header"
        breadcrumb="Brain"
        title="People"
        status={people.length
          ? directory.hasNextPage
            ? `${people.length} loaded`
            : count(people.length, "person", "people")
          : undefined}
        actions={(
          <Button tone="primary" onClick={() => safelyNavigate("/brain/people/new")}>
            <Plus size={15} />New
          </Button>
        )}
      />
      <section className="brain-people" data-route={personId || isNew ? "detail" : "directory"} aria-label="People">
      <aside className="brain-people-directory" aria-label="People directory">
        <div className="brain-person-directory-tools">
          <SearchField value={query} onValueChange={(value) => updateDirectoryParam("q", value)} label="Search People" placeholder="Search people" className="brain-person-search" />
          <KoraSelect
            label="Sort People"
            value={directoryOrder === "updated_desc" ? "recent" : "name"}
            onValueChange={(value) => updateDirectoryParam("sort", value)}
            options={[{ value: "name", label: "Name" }, { value: "recent", label: "Recently updated" }]}
          />
        </div>
        {people.length ? <p id="people-directory-count" className="brain-person-list__count" role="status" aria-live="polite">
          {count(people.length, "visible person", "visible people")} loaded{directory.hasNextPage ? " · more available" : directoryIsComplete ? " · current directory complete" : " · directory availability incomplete"}
        </p> : null}
        {!directory.isLoading && !directory.isError && latestDirectoryPage && !directoryIsComplete && !directory.hasNextPage && (
          <p className="brain-person-omission" role="status">
            Showing the People currently available. The directory is incomplete.
          </p>
        )}
        <div ref={directoryRef} className="brain-person-list" {...ledger.ledgerProps}>
          {directory.isLoading ? (
            <div className="brain-person-list__state" role="status" aria-live="polite">
              <KoraPresenceMark state="gathering" label="Opening People" />Opening People
            </div>
          ) : directory.isError ? (
            <div className="brain-person-list__state brain-person-list__state--error" role="alert">
              <CircleAlert size={17} />
              <strong>People could not be loaded.</strong>
              <Button tone="link" onClick={() => void directory.refetch()}>Try again</Button>
            </div>
          ) : people.length === 0 ? (
            <EmptyState
              icon={<UsersRound size={20} />}
              title={query ? "No visible matches" : "No people yet"}
              body={query
                ? "Try a name, relationship, or phrase from their context."
                : "Add someone when context about them should stay available to Kora."}
            />
          ) : virtualizedDirectory ? (
            <ul
              className="brain-person-list--virtual"
              aria-label="People"
              aria-describedby="people-directory-count"
              style={{ height: peopleVirtualizer.getTotalSize() }}
            >
              {virtualPeople.map((virtualPerson) => {
                const person = people[virtualPerson.index]!;
                return <PersonRow
                  key={person.id}
                  person={person}
                  current={person.id === personId}
                  rowProps={ledger.rowProps(virtualPerson.index)}
                  onOpen={openPerson}
                  directorySearch={location.search}
                  virtual={{
                    index: virtualPerson.index,
                    start: virtualPerson.start,
                    size: virtualPerson.size,
                    total: people.length,
                    measureElement: peopleVirtualizer.measureElement,
                  }}
                />;
              })}
            </ul>
          ) : people.length <= 2 || directoryOrder === "updated_desc" ? (
            <motion.ul className="brain-person-list--plain" layout aria-label="People">
              {people.map((person) => (
                <PersonRow key={person.id} person={person} current={person.id === personId} rowProps={ledger.rowProps(flatIndexById.get(person.id) ?? 0)} onOpen={openPerson} directorySearch={location.search} />
              ))}
            </motion.ul>
          ) : grouped.map(([letter, entries]) => (
            <section className="brain-person-group" key={letter} aria-labelledby={`people-${letter}`}>
              <h2 id={`people-${letter}`}>{letter}</h2>
              <motion.ul layout>
                {entries.map((person) => (
                  <PersonRow key={person.id} person={person} current={person.id === personId} rowProps={ledger.rowProps(flatIndexById.get(person.id) ?? 0)} onOpen={openPerson} directorySearch={location.search} />
                ))}
              </motion.ul>
            </section>
          ))}
          {directory.hasNextPage && (
            <Button
              className="brain-person-more"
              loading={directory.isFetchingNextPage}
              onClick={continueDirectory}
            >
              Show more
            </Button>
          )}
        </div>
      </aside>

      {(personId || isNew) ? <div className="brain-person-stage">
        <AnimatePresence
          initial={false}
          onExitComplete={() => {
            if (activePersonIdRef.current) return;
            restoreDirectoryFocus();
          }}
        >
          {isNew || canonical ? (
            <motion.article
              className="brain-person-detail"
              key={isNew ? "new-person" : canonical!.id}
              initial={{ opacity: 0, x: 9 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: DUR.base, ease: EASE.out }}
            >
              <header className="brain-person-detail__toolbar">
                <Button ref={detailBackRef} className="brain-person-back" tone="ghost" onClick={returnToDirectory}>
                  <ArrowLeft size={15} />People
                </Button>
                <div className="brain-person-detail__actions">
                  {settled && (
                    <motion.span initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}>
                      <Check size={14} />{settled}
                    </motion.span>
                  )}
                  {!isNew && !editorVisible && onAskKora && (
                    <Button tone="ghost" onClick={() => onAskKora({
                      kind: "person",
                      id: canonical!.id,
                      title: canonical!.displayName,
                    })}>
                      <Sparkles size={15} />Ask Kora
                    </Button>
                  )}
                  {!isNew && !editorVisible && (
                    <Button onClick={() => setEditing(true)}>Edit</Button>
                  )}
                  {editorVisible && (
                    <>
                      {!isNew && <Button tone="ghost" onClick={() => {
                        setDraft(draftFrom(canonical!));
                        setEditing(false);
                        setConflict(undefined);
                      }}>Cancel</Button>}
                      <Button
                        tone="primary"
                        disabled={!dirty || save.isPending}
                        onClick={beginSave}
                      >
                        {save.isPending ? "Saving…" : "Save"}
                      </Button>
                    </>
                  )}
                </div>
              </header>

              {error && <p className="brain-person-error" role="alert"><CircleAlert size={15} />{error}</p>}
              {conflict && (
                <motion.div
                  className="brain-person-conflict"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                >
                  <div>
                    <strong>This person changed somewhere else.</strong>
                    <span>Your edits are still here. Review the latest record before deciding what to keep.</span>
                  </div>
                  <div>
                    <Button tone="ghost" onClick={() => {
                      queryClient.setQueryData(["brain", "person", conflict.id], (current: typeof workspace.data) => ({
                        pages: current?.pages?.length
                          ? current.pages.map((page, index) => index === 0 ? { ...page, person: conflict } : page)
                          : [{ person: conflict, work: { items: [], complete: true } }],
                        pageParams: current?.pageParams ?? [undefined],
                      }));
                      setDraft((current) => ({ ...current, expectedVersion: conflict.version }));
                      setConflict(undefined);
                      setSettled("Latest person loaded. Your draft is preserved.");
                      setEditing(false);
                      navigate(`/brain/people/${encodeURIComponent(conflict.id)}`, { replace: true });
                    }}>Review latest</Button>
                    <Button tone="ghost" onClick={() => void navigator.clipboard.writeText(
                      `${draft.displayName}\n${draft.relationshipLabel}\n\n${draft.contextMarkdown}`,
                    )}>Copy my draft</Button>
                    <Button tone="ghost" onClick={() => setConflict(undefined)}>Cancel</Button>
                  </div>
                </motion.div>
              )}

              {editorVisible ? (
                <div className="brain-person-editor">
                  <section className="brain-person-editor__identity">
                    <span className="brain-person-editor__mark" aria-hidden="true">
                      {initials(draft.displayName)}
                    </span>
                    <div>
                      <Field label="Person name" htmlFor="brain-person-name">
                        <Input
                          id="brain-person-name"
                          autoFocus={isNew}
                          aria-label="Person name"
                          value={draft.displayName}
                          placeholder="Person's name"
                          onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                        />
                      </Field>
                      <Field label="Relationship label" htmlFor="brain-person-relationship">
                        <Input
                          id="brain-person-relationship"
                          aria-label="Relationship label"
                          value={draft.relationshipLabel}
                          placeholder="Friend, professor, collaborator…"
                          onChange={(event) => setDraft({ ...draft, relationshipLabel: event.target.value })}
                        />
                      </Field>
                    </div>
                  </section>
                  <Field
                    className="brain-person-context-editor"
                    label="Person context"
                    htmlFor="brain-person-context"
                    hint="Keep the relationship context Kora should use when it helps."
                  >
                    <Textarea
                      id="brain-person-context"
                      aria-label="Person context"
                      value={draft.contextMarkdown}
                      placeholder="What should Kora understand about this person?"
                      onChange={(event) => setDraft({ ...draft, contextMarkdown: event.target.value })}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                          event.preventDefault();
                          if (dirty && !save.isPending) beginSave();
                        }
                      }}
                    />
                  </Field>
                  <ProviderReferenceEditor
                    references={draft.providerRefs}
                    onChange={(providerRefs) => setDraft({ ...draft, providerRefs })}
                  />
                </div>
              ) : (
                <div className="brain-person-readable">
                  <header className="brain-person-identity">
                    <motion.span
                      initial={{ scale: 0.92, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: DUR.base, ease: EASE.out }}
                      aria-hidden="true"
                    >
                      {initials(canonical!.displayName)}
                    </motion.span>
                    <div>
                      <p>{canonical!.relationshipLabel || "Relationship not labeled"}</p>
                      <h2 ref={detailHeadingRef} tabIndex={-1}>{canonical!.displayName}</h2>
                    </div>
                  </header>
                  <section className="brain-person-context" aria-labelledby="person-context-heading">
                    <h3 id="person-context-heading">What matters</h3>
                    <div className="brain-person-markdown">
                      <Streamdown>{canonical!.contextMarkdown || "_No context has been written yet._"}</Streamdown>
                    </div>
                  </section>
                  <section className="brain-person-work" aria-labelledby="person-work-heading">
                    <div className="brain-person-section-head">
                      <div>
                        <h3 id="person-work-heading">Connected Work</h3>
                        <p>Exact assignments and connections from Native Work.</p>
                      </div>
                    </div>
                    {relatedWork.length ? (
                      <>
                        <div className="brain-person-work__rows">
                          {relatedWork.map((relation) => (
                            <Link
                              key={`${relation.recordType}:${relation.id}`}
                              to={relation.route}
                            >
                              <BriefcaseBusiness size={16} aria-hidden="true" />
                              <span>
                                <strong>{relation.title}</strong>
                                <small>
                                  {relation.recordType === "project" ? "Project" : "Work item"}
                                  {" · "}
                                  Connected
                                </small>
                              </span>
                              <span>{workStateLabel(relation.state)}</span>
                              <ChevronRight size={15} aria-hidden="true" />
                            </Link>
                          ))}
                        </div>
                        {relatedWorkIncomplete && (
                          <p className="brain-person-work__incomplete" role="status" aria-label="Connected Work availability">
                            Connected Work availability is incomplete. {workspace.hasNextPage
                              ? "Load more to continue."
                              : "Kora cannot confirm this list is complete."}
                          </p>
                        )}
                      </>
                    ) : relatedWorkIncomplete ? (
                      <StateView
                        state="partial"
                        title="Connected Work is incomplete"
                        body="The Person record remains available, but Kora cannot confirm that no Work relationships exist until the current Work window is available."
                      />
                    ) : (
                      <p className="brain-person-section-empty">No exact Native Work relationships.</p>
                    )}
                    {workspace.hasNextPage && (
                      <Button
                        className="brain-person-work__more"
                        tone="ghost"
                        loading={workspace.isFetchingNextPage}
                        disabled={workspace.isFetchingNextPage}
                        onClick={() => void workspace.fetchNextPage()}
                      >
                        {workspace.isFetchNextPageError ? "Try loading more Work again" : "Load more connected Work"}
                      </Button>
                    )}
                  </section>
                  {canonical!.providerRefs.length ? <section className="brain-person-references" aria-labelledby="person-references-heading">
                    <div className="brain-person-section-head">
                      <div>
                        <h3 id="person-references-heading">Provider references</h3>
                        <p>Typed external records connected to this person.</p>
                      </div>
                    </div>
                    <div className="brain-person-reference-rows">
                        {canonical!.providerRefs.map((reference) => (
                          <div key={`${reference.providerId}:${reference.providerKind}:${reference.recordId}`}>
                            <Link2 size={15} aria-hidden="true" />
                            <span>
                              <strong>{reference.label}</strong>
                              <small>Connected record</small>
                            </span>
                            <span data-state={reference.availability ?? "unverified"}>
                              {availabilityLabel(reference.availability)}
                            </span>
                            <details className="brain-person-reference-details">
                              <summary>Technical details</summary>
                              <dl>
                                <div><dt>Provider</dt><dd>{reference.providerId}</dd></div>
                                <div><dt>Record type</dt><dd>{reference.providerKind}</dd></div>
                                <div><dt>Record ID</dt><dd>{reference.recordId}</dd></div>
                                {reference.verifiedAt && <div><dt>Verified</dt><dd>{new Date(reference.verifiedAt).toLocaleString()}</dd></div>}
                              </dl>
                            </details>
                          </div>
                        ))}
                    </div>
                  </section> : null}
                  <section className="brain-person-matches" aria-labelledby="person-matches-heading">
                    <div className="brain-person-section-head">
                      <div>
                        <h3 id="person-matches-heading">Brain search matches</h3>
                        <p>Search results may mention this person. They are not confirmed relationships.</p>
                      </div>
                      {!showMatches && (
                        <Button tone="ghost" onClick={() => setShowMatches(true)}>
                          <Search size={15} />Search Brain for this person
                        </Button>
                      )}
                    </div>
                    {showMatches && matches.isLoading && (
                      <p className="brain-person-section-empty">
                        <KoraPresenceMark state="gathering" label="Searching Brain" />Searching Brain…
                      </p>
                    )}
                    {showMatches && matches.isError && (
                      <p className="brain-person-section-empty brain-person-section-empty--error">
                        Search is unavailable. <Button tone="link" onClick={() => void matches.refetch()}>Try again</Button>
                      </p>
                    )}
                    {showMatches && matches.data?.state === "ok" && matches.data.complete && searchMatches.length === 0 && (
                      <p className="brain-person-section-empty">No other Brain records match this name.</p>
                    )}
                    {showMatches && matches.data && searchMatches.length === 0 && (matches.data.state === "partial" || (matches.data.state === "ok" && !matches.data.complete)) && (
                      <StateView state="partial" title="No available matches yet" body="At least one Brain collection is incomplete, so Kora cannot call this a complete no-match." />
                    )}
                    {showMatches && matches.data?.state === "unavailable" && (
                      <StateView state="unavailable" title="Brain search is unavailable" body="The Person record remains available while search reconnects." />
                    )}
                    {searchMatches.length > 0 && (
                      <div className="brain-person-match-rows">
                        {searchMatches.map((match) => (
                          <Button
                            key={`${conversationContextKey(match.context)}:${match.stableRank}`}
                            tone="ghost"
                            disabled={!onAskKora || !conversationContextReady(match.context)}
                            onClick={() => onAskKora?.(match.context)}
                          >
                            <span>{searchScopeLabel(match.scope)}</span>
                            <strong>{match.display.title}</strong>
                            <Sparkles size={14} aria-hidden="true" />
                          </Button>
                        ))}
                      </div>
                    )}
                  </section>
                  <footer className="brain-person-provenance">
                    <dl>
                      <div><dt>Origin</dt><dd>{personProvenanceLabel(canonical!.provenance)}</dd></div>
                      <div><dt>Updated</dt><dd>{new Date(canonical!.updatedAt).toLocaleString()}</dd></div>
                    </dl>
                    <Button tone="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Delete person</Button>
                  </footer>
                  <AnimatePresence>
                    {confirmDelete && (
                      <motion.div
                        className="brain-person-delete"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <div>
                          <strong>Delete {canonical!.displayName}?</strong>
                          <p>The Person record and explicit connections are removed. Related Work remains and direct assignments are cleared.</p>
                        </div>
                        <Button tone="ghost" onClick={() => setConfirmDelete(false)}>Keep person</Button>
                        <Button
                          tone="danger"
                          disabled={deletion.isPending}
                          onClick={() => deletion.mutate(deleteOperation.capture(
                            { surface: "person", id: personId! },
                            { expectedVersion: canonical!.version },
                          ))}
                        >
                          {deletion.isPending ? "Deleting…" : "Delete exactly this person"}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <ExactOperationConfirmation
                    open={deleteConfirmationIds.length > 0}
                    confirmationIds={deleteConfirmationIds}
                    title="Approve this exact deletion"
                    description="Kora will delete only this Person record after every exact approval is accepted."
                    approveLabel="Delete exactly this person"
                    approveTone="danger"
                    client={client}
                    onOpenChange={(open) => {
                      if (!open && deleteConfirmationIds.length) {
                        deleteOperation.cancel();
                        setDeleteConfirmationIds([]);
                      }
                    }}
                    onApproved={async () => {
                      const intent = deleteOperation.retry();
                      if (intent) await deletion.mutateAsync(intent);
                    }}
                    onRejected={() => {
                      deleteOperation.cancel();
                      setDeleteConfirmationIds([]);
                    }}
                  />
                </div>
              )}
            </motion.article>
          ) : personId && workspace.isLoading ? (
              <motion.div className="brain-person-stage-state brain-person-stage-state--loading" key="loading">
                <KoraPresenceMark state="gathering" label="Opening person" />Opening person
              </motion.div>
          ) : personId && workspace.isError ? (
            workspace.error instanceof RuntimeRequestError && workspace.error.code === "not_found" ? (
              <motion.div className="brain-person-stage-state brain-person-stage-state--terminal" key="gone">
                <UsersRound size={22} />
                <h2>This person is no longer available.</h2>
                <p>The saved Person record may have been deleted or is no longer retained. Kora will not reconstruct it from related records.</p>
                <Button onClick={returnToDirectory}><ArrowLeft size={15} />Back to People</Button>
              </motion.div>
            ) : (
              <motion.div className="brain-person-stage-state brain-person-stage-state--error" key="error">
                <CircleAlert size={22} />
                <h2>This person could not be opened.</h2>
                <Button onClick={returnToDirectory}><ArrowLeft size={15} />Back to People</Button>
                <Button ref={detailRetryRef} onClick={(event) => {
                  pendingKeyboardRecoveryFocus.current = event.detail === 0;
                  void workspace.refetch();
                }}>Try again</Button>
              </motion.div>
            )
          ) : null}
        </AnimatePresence>
      </div> : (
        <div className="brain-person-stage brain-person-stage--preview" role="region" aria-label="People preview">
          <section className="brain-person-preview">
            <span className="brain-person-preview__mark" aria-hidden="true"><UsersRound size={22} /></span>
            <h2>{people.length ? "Choose someone" : "People keeps useful relationship context close"}</h2>
            <p>{people.length
              ? "Select a person to read their saved context and connected work."
              : "Add someone only when remembering the relationship or useful context would meaningfully improve Kora's help."}</p>
            {!people.length && <Button tone="secondary" onClick={() => safelyNavigate("/brain/people/new")}><Plus size={15} />Add the first person</Button>}
          </section>
        </div>
      )}
      </section>
    </>
  );
}
