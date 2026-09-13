import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BookOpen,
  Check,
  ChevronRight,
  FilePlus2,
  MoreHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Field, IconButton, Input, KoraPresenceMark, KoraSelect, Menu, SearchField, Textarea } from "../../components/primitives";
import {
  runtime,
  type BrainDeletionOutcome,
  type BrainCursorPage,
  type BrainMutationOutcome,
  type BrainPage,
  type ConversationContextReference,
} from "../../lib/runtime";
import {
  ExactOperationConfirmation,
  type ExactOperationConfirmationClient,
} from "./ExactOperationConfirmation";
import { useOperationIntent } from "./useOperationIntent";
import "./pages.css";
import { Badge, Item } from "../../components/display";
import { count } from "../../lib/language";
import { useViewBar } from "../../app/ViewBar";
import { useLedgerKeyboard, type LedgerRowProps } from "../../lib/use-ledger-keyboard";
import { DUR, EASE } from "../../lib/motion";
import { useDirtyDraftGuard } from "../../app/DirtyDraftGuard";
import { BrainMarkdown } from "./BrainMarkdown";

type PageDraft = {
  id?: string;
  title: string;
  bodyMarkdown: string;
  kind: BrainPage["kind"];
  slug: string;
  expectedVersion?: number;
};

type PagesDirectorySnapshot = {
  pageId?: string;
  scrollTop: number;
  query: string;
  kind: "all" | BrainPage["kind"];
  state: "active" | "archived";
};

type PagesRouteState = {
  directoryOrigin?: PagesDirectorySnapshot;
  directoryReturn?: PagesDirectorySnapshot;
};

export type PagesClient = ExactOperationConfirmationClient & {
  pagesPage(input?: {
    query?: string;
    kind?: BrainPage["kind"];
    state?: BrainPage["state"];
    pageSize?: number;
    cursor?: string;
  }): Promise<BrainCursorPage<BrainPage>>;
  brainRecord(
    surface: "page",
    id: string,
  ): Promise<{ surface: string; record: BrainPage }>;
  createPage(input: {
    title: string;
    bodyMarkdown: string;
    kind: BrainPage["kind"];
    slug?: string;
    requestKey?: string;
  }): Promise<BrainMutationOutcome<BrainPage>>;
  updatePage(id: string, input: {
    title: string;
    bodyMarkdown: string;
    kind: BrainPage["kind"];
    slug?: string;
    expectedVersion: number;
    requestKey?: string;
  }): Promise<BrainMutationOutcome<BrainPage>>;
  archivePage(id: string, input: {
    expectedVersion: number;
    requestKey?: string;
  }): Promise<BrainMutationOutcome<BrainPage>>;
  deleteBrainRecord(surface: "personal_brain_page", id: string, input: {
    expectedVersion: number;
    requestKey?: string;
  }): Promise<BrainDeletionOutcome>;
};
type PageSavePayload = {
  title: string;
  bodyMarkdown: string;
  kind: BrainPage["kind"];
  slug?: string;
};
type PageSaveConcurrency = {
  id?: string;
  expectedVersion?: number;
  create: boolean;
};

const pageClient = runtime as typeof runtime & PagesClient;
const pageDetailKey = (id: string | undefined) => ["brain", "page", id] as const;
const blankDraft = (): PageDraft => ({
  title: "",
  bodyMarkdown: "",
  kind: "note",
  slug: "",
});
const draftFrom = (page: BrainPage): PageDraft => ({
  id: page.id,
  title: page.title,
  bodyMarkdown: page.bodyMarkdown,
  kind: page.kind,
  slug: page.slug ?? "",
  expectedVersion: page.version,
});
const sameDraft = (draft: PageDraft, page?: BrainPage) =>
  page
    ? draft.title === page.title &&
      draft.bodyMarkdown === page.bodyMarkdown &&
      draft.kind === page.kind &&
      draft.slug === (page.slug ?? "")
    : !draft.title && !draft.bodyMarkdown && !draft.slug &&
      draft.kind === "note";

function MarkdownDocument({ children }: { children: string }) {
  return (
    <BrainMarkdown className="brain-page-markdown" headingBase={3}>
      {children || "_Nothing has been written here yet._"}
    </BrainMarkdown>
  );
}

/** Never print a raw enum to the user. */
const PAGE_KIND_LABEL: Record<BrainPage["kind"], string> = {
  area: "Area",
  goal: "Goal",
  note: "Note",
  reference: "Reference",
};

function PageRow({
  page,
  current,
  rowProps,
  onOpen,
}: {
  page: BrainPage;
  current: boolean;
  rowProps: LedgerRowProps;
  onOpen: (pageId: string, event: MouseEvent<HTMLLIElement>) => void;
}) {
  const preview = page.bodyMarkdown.replace(/[#*_>`[\]]/g, "").trim();
  return (
    <motion.li
      className="brain-page-row"
      data-page-id={page.id}
      layout="position"
      transition={{ duration: DUR.base, ease: EASE.out }}
      onClickCapture={(event) => onOpen(page.id, event)}
    >
      <Item
        kind="link"
        title={(
          <span className="brain-page-row__title">
            <span>{page.title}</span>
            <Badge>{PAGE_KIND_LABEL[page.kind]}</Badge>
          </span>
        )}
        description={preview || "Empty page"}
        selected={current}
        href={`/brain/pages/${encodeURIComponent(page.id)}`}
        lines={2}
        rowProps={rowProps}
      />
    </motion.li>
  );
}

export function PagesWorkspace({
  onAskKora,
  client = pageClient,
}: {
  onAskKora?: (reference: ConversationContextReference) => void;
  client?: PagesClient;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ pageId?: string }>();
  const routeState = location.state as PagesRouteState | null;
  const directorySnapshot = routeState?.directoryReturn ?? routeState?.directoryOrigin;
  const queryClient = useQueryClient();
  const isNew = location.pathname.endsWith("/new");
  const routeEditing = isNew || location.pathname.endsWith("/edit");
  const pageId = params.pageId;
  const [query, setQuery] = useState(directorySnapshot?.query ?? "");
  const [kind, setKind] = useState<"all" | BrainPage["kind"]>(directorySnapshot?.kind ?? "all");
  const [state, setState] = useState<"active" | "archived">(directorySnapshot?.state ?? "active");
  const [confirmDelete, setConfirmDelete] = useState(false),
    [mode, setMode] = useState<"reader" | "edit" | "preview">(
      routeEditing ? "edit" : "reader",
    ),
    [draft, setDraft] = useState<PageDraft>(blankDraft),
    [conflict, setConflict] = useState<BrainPage>(),
    [message, setMessage] = useState<string>(),
    [actionError, setActionError] = useState<string>(),
    [deleteWaiting, setDeleteWaiting] = useState<Extract<BrainDeletionOutcome, {
      status: "waiting_confirmation";
    }>>(),
    [deleteApprovalOpen, setDeleteApprovalOpen] = useState(false);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const ledgerScrollTop = useRef(0);
  const originatingPageId = useRef<string | undefined>(undefined);
  const restoreDirectoryFocus = useRef(false);

  const deleteOperation = useOperationIntent<
    Record<string, never>,
    { expectedVersion: number }
  >();
  const saveOperation = useOperationIntent<PageSavePayload, PageSaveConcurrency>();
  const archiveOperation = useOperationIntent<
    Record<string, never>,
    { id: string; expectedVersion: number }
  >();

  const detailQueryKey = pageDetailKey(pageId);

  const list = useInfiniteQuery({
    queryKey: ["brain", "pages", query, kind, state],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.pagesPage({
      query: query.trim() || undefined,
      kind: kind === "all" ? undefined : kind,
      state,
      pageSize: 40,
      cursor: pageParam,
    }),
    getNextPageParam: (page) => page.cursor,
  });
  const pages = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data],
  );
  const latestListPage = list.data?.pages.at(-1);
  const directoryHasFilters = Boolean(query.trim()) || kind !== "all" || state !== "active";
  const directoryIsComplete = latestListPage?.complete === true && !list.hasNextPage;
  const detail = useQuery({
    queryKey: detailQueryKey,
    enabled: Boolean(pageId) && !isNew,
    retry: false,
    queryFn: async () => (await client.brainRecord("page", pageId!)).record,
  });
  const canonical = detail.data;
  // A draft belongs to the active Page route, including when an editor is
  // switched back to its reader view. The collection route has no pageId, so
  // a draft left in component state while it settles cannot block navigation.
  const dirty = (isNew || Boolean(pageId))
    && !sameDraft(draft, isNew ? undefined : canonical);
  const draftGuard = useDirtyDraftGuard({
    id: `brain-page:${pageId ?? "new"}`,
    label: "Page draft",
    dirty,
    onDiscard: () => {
      setDraft(canonical ? draftFrom(canonical) : blankDraft());
      setConflict(undefined);
      setActionError(undefined);
    },
  });

  useEffect(() => {
    setMode(routeEditing ? "edit" : "reader");
  }, [routeEditing, pageId]);
  useEffect(() => {
    if (isNew) {
      setDraft(blankDraft());
      setConflict(undefined);
      return;
    }
    if (canonical && (!dirty || draft.id !== canonical.id)) {
      setDraft(draftFrom(canonical));
      setConflict(undefined);
    }
    // Dirty drafts deliberately survive canonical background refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical?.id, canonical?.version, isNew]);
  const save = useMutation({
    mutationFn: async (intent: ReturnType<typeof saveOperation.capture>) => {
      const input = intent.payload;
      if (!input.title) {
        return {
          status: "validation_failure",
          message: "Give this Page a title before saving.",
          replayed: false,
        } as BrainMutationOutcome<BrainPage>;
      }
      return intent.concurrency.create
        ? client.createPage({ ...input, requestKey: intent.requestKey })
        : client.updatePage(intent.concurrency.id!, {
          ...input,
          expectedVersion: intent.concurrency.expectedVersion!,
          requestKey: intent.requestKey,
        });
    },
    onSuccess: async (outcome) => {
      setActionError(undefined);
      if (outcome.status === "conflict") {
        saveOperation.markTransientFailure();
        setConflict(outcome.current);
        return;
      }
      if (outcome.status === "validation_failure") {
        saveOperation.markTransientFailure();
        setActionError(outcome.message);
        return;
      }
      if (outcome.status === "gone") {
        saveOperation.markGone();
        setActionError("This Page no longer exists.");
        return;
      }
      saveOperation.settle();
      setDraft(draftFrom(outcome.record));
      setMessage(outcome.replayed ? "This save was already settled." : "Saved");
      setConflict(undefined);
      await queryClient.invalidateQueries({ queryKey: ["brain", "pages"] });
      queryClient.setQueryData(pageDetailKey(outcome.record.id), outcome.record);
      draftGuard.release();
      navigate(`/brain/pages/${encodeURIComponent(outcome.record.id)}`, { replace: isNew });
      window.setTimeout(() => setMessage(undefined), 1600);
    },
    onError: (reason) => {
      saveOperation.markTransientFailure();
      setActionError((reason as Error).message);
    },
  });

  const requestSave = () => {
    const input: PageSavePayload = {
      title: draft.title.trim(),
      bodyMarkdown: draft.bodyMarkdown,
      kind: draft.kind,
      ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
    };
    const intent = saveOperation.capture(input, {
      create: isNew,
      ...(!isNew ? { id: pageId!, expectedVersion: draft.expectedVersion! } : {}),
    });
    save.mutate(intent);
  };

  const archive = useMutation({
    mutationFn: (intent: ReturnType<typeof archiveOperation.capture>) =>
      client.archivePage(intent.concurrency.id, {
        expectedVersion: intent.concurrency.expectedVersion,
        requestKey: intent.requestKey,
      }),
    onSuccess: async (outcome) => {
      if (outcome.status !== "settled") {
        if (outcome.status === "gone") archiveOperation.markGone();
        else archiveOperation.markTransientFailure();
        setActionError(
          outcome.status === "conflict"
            ? "The Page changed before it could be archived."
            : "This Page could not be archived.",
        );
        return;
      }
      archiveOperation.settle();
      queryClient.setQueryData(pageDetailKey(outcome.record.id), outcome.record);
      await queryClient.invalidateQueries({ queryKey: ["brain", "pages"] });
      setMessage("Archived");
      setMode("reader");
    },
    onError: (reason) => {
      archiveOperation.markTransientFailure();
      setActionError((reason as Error).message);
    },
  });
  const requestArchive = () => {
    if (!canonical) return;
    archive.mutate(archiveOperation.capture({}, {
      id: canonical.id,
      expectedVersion: canonical.version,
    }));
  };
  const deletion = useMutation({
    mutationFn: (intent: ReturnType<typeof deleteOperation.capture>) =>
      client.deleteBrainRecord("personal_brain_page", pageId!, {
      expectedVersion: intent.concurrency.expectedVersion,
      requestKey: intent.requestKey,
    }),
    onSuccess: async (outcome) => {
      if (outcome.status === "waiting_confirmation") {
        deleteOperation.markWaitingForConfirmation();
        setDeleteWaiting(outcome);
        setDeleteApprovalOpen(true);
        return;
      }
      if (outcome.status === "conflict") {
        setActionError("The Page changed before it could be deleted.");
        deleteOperation.resolveConflict();
        setConfirmDelete(false);
        return;
      }
      if (outcome.status === "rejected" || outcome.status === "expired" || outcome.status === "uncertain") {
        setActionError(outcome.message);
        deleteOperation.markTransientFailure();
        return;
      }
      deleteOperation.settle();
      setDeleteWaiting(undefined);
      setDeleteApprovalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["brain", "pages"] });
      queryClient.removeQueries({ queryKey: ["brain", "page", pageId] });
      draftGuard.release();
      navigate("/brain/pages", { replace: true });
    },
    onError: (reason) => {
      deleteOperation.markTransientFailure();
      setActionError((reason as Error).message);
    },
  });

  const requestDeletion = () => {
    if (!canonical) return;
    const intent = deleteOperation.capture({}, { expectedVersion: canonical.version });
    deletion.mutate(intent);
  };

  const safelyNavigate = (target: string) => {
    if (target !== "/brain/pages") {
      navigate(target);
      return;
    }

    restoreDirectoryFocus.current = true;
    const origin = routeState?.directoryOrigin;
    navigate(target, {
      state: {
        directoryReturn: {
          pageId: originatingPageId.current ?? origin?.pageId ?? (pageId && !isNew ? pageId : undefined),
          scrollTop: origin?.scrollTop ?? ledgerScrollTop.current,
          query,
          kind,
          state,
        } satisfies PagesDirectorySnapshot,
      } satisfies PagesRouteState,
    });
  };

  useLayoutEffect(() => {
    const pending = routeState?.directoryReturn;
    if (pageId || isNew || (!restoreDirectoryFocus.current && !pending) || list.isLoading) return;
    const directory = ledgerRef.current;
    const scrollTop = pending?.scrollTop ?? ledgerScrollTop.current;
    if (directory) directory.scrollTop = scrollTop;
    const id = pending?.pageId ?? originatingPageId.current;
    let attempt = 0;
    let frame: number | undefined;
    const restore = () => {
      const row = id
        ? [...(directory?.querySelectorAll<HTMLElement>(".brain-page-row[data-page-id]") ?? [])]
          .find((candidate) => candidate.dataset.pageId === id)
          ?.querySelector<HTMLAnchorElement>("a[href]")
        : undefined;
      const target = row ?? (attempt >= 3
        ? directory?.parentElement?.querySelector<HTMLInputElement>('input[type="search"]')
        : undefined);
      if (target) {
        restoreDirectoryFocus.current = false;
        target.focus({ preventScroll: true });
        return;
      }
      if (attempt < 3) {
        attempt += 1;
        frame = window.requestAnimationFrame(restore);
      } else {
        restoreDirectoryFocus.current = false;
      }
    };
    frame = window.requestAnimationFrame(restore);
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, [isNew, list.isLoading, pageId, pages.length, routeState?.directoryReturn]);

  useViewBar(() => ({
    title: "Pages",
    meta: pages.length ? count(pages.length, "page") : undefined,
    actions: (
      <Button tone="primary" onClick={() => safelyNavigate("/brain/pages/new")}>
        <FilePlus2 size={15} />New
      </Button>
    ),
  }), [pages.length]);

  const ledger = useLedgerKeyboard({ count: pages.length });
  const openPage = (targetPageId: string, event: MouseEvent<HTMLLIElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) return;
    event.preventDefault();
    restoreDirectoryFocus.current = false;
    originatingPageId.current = targetPageId;
    ledgerScrollTop.current = ledgerRef.current?.scrollTop ?? 0;
    navigate(`/brain/pages/${encodeURIComponent(targetPageId)}`, {
      state: {
        directoryOrigin: {
          pageId: targetPageId,
          scrollTop: ledgerScrollTop.current,
          query,
          kind,
          state,
        } satisfies PagesDirectorySnapshot,
      } satisfies PagesRouteState,
    });
  };
  const ledgerRowProps = (index: number, currentPage: BrainPage): LedgerRowProps => {
    const shared = ledger.rowProps(index);
    return {
      ...shared,
      ref: (node) => {
        shared.ref(node);
      },
      onFocus: () => {
        shared.onFocus();
        originatingPageId.current = currentPage.id;
        // The list remains the scroll owner while a detail route is open.
        // Reading it here preserves the exact collection position on return.
        if (ledgerRef.current) ledgerScrollTop.current = ledgerRef.current.scrollTop;
      },
    };
  };

  return (
    <section
      className="brain-pages"
      aria-label="Pages"
      data-route={pageId || isNew ? "detail" : "directory"}
    >
      <aside className="brain-pages-ledger" aria-label="Pages">
        <div className="brain-page-toolbar" aria-label="Pages directory tools">
          <SearchField value={query} onValueChange={setQuery} label="Search Pages" placeholder="Search Pages" className="brain-page-search" />
          <div className="brain-page-filters">
            <KoraSelect
              label="Filter by Page kind"
              value={kind}
              onValueChange={(value) => setKind(value as typeof kind)}
              options={[
                { value: "all", label: "All kinds" },
                { value: "area", label: "Areas" },
                { value: "goal", label: "Goals" },
                { value: "note", label: "Notes" },
                { value: "reference", label: "References" },
              ]}
            />
            <div className="brain-page-state" aria-label="Page state">
              {(["active", "archived"] as const).map((value) => (
                <Button
                  key={value}
                  tone="ghost"
                  aria-pressed={state === value}
                  onClick={() => setState(value)}
                >
                  {value === "active" ? "Current" : "Archived"}
                </Button>
              ))}
            </div>
          </div>
        </div>
        {!list.isLoading && !list.isError && latestListPage && !directoryIsComplete && !list.hasNextPage && (
          <p className="brain-page-omission" role="status">
            Showing the Pages currently available. The directory is incomplete.
          </p>
        )}
        <div ref={ledgerRef} className="brain-page-list" {...ledger.ledgerProps}>
          {list.isLoading && (
            <div className="brain-page-list__state">
              <KoraPresenceMark state="gathering" label="Opening Pages" />
              Opening Pages
            </div>
          )}
          {list.isError && (
            <div className="brain-page-list__state brain-page-list__state--error">
              <TriangleAlert size={17} />
              Pages could not be loaded.
              <Button tone="ghost" onClick={() => void list.refetch()}>Try again</Button>
            </div>
          )}
          {!list.isLoading && !list.isError && pages.length === 0 && (
            <div className="brain-page-list__empty">
              <BookOpen size={22} />
              <strong>{directoryHasFilters ? "No matching Pages" : "No Pages yet"}</strong>
              <span>{directoryHasFilters ? "Try a different phrase or clear the filters." : "Create a durable place for knowledge Kora should keep structured."}</span>
              {directoryHasFilters && (
                <Button tone="ghost" onClick={() => {
                  setQuery("");
                  setKind("all");
                  setState("active");
                }}>Clear filters</Button>
              )}
            </div>
          )}
          <motion.ul layout aria-label="Page results">
            {pages.map((page, index) => (
              <PageRow
                key={page.id}
                page={page}
                current={page.id === pageId}
                onOpen={openPage}
                rowProps={ledgerRowProps(index, page)}
              />
            ))}
          </motion.ul>
          {list.hasNextPage && (
            <Button
              tone="ghost"
              className="brain-page-more"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Show more"}
            </Button>
          )}
        </div>
      </aside>

      {(pageId || isNew || canonical) && <div className="brain-page-document">
        <AnimatePresence mode="wait" initial={false}>
          {isNew || canonical ? (
            <motion.div
              className="brain-page-sheet"
              key={isNew ? "new" : canonical!.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }}
              transition={{ duration: DUR.base, ease: EASE.out }}
            >
              <header className="brain-page-sheet__head">
                <div className="brain-page-modes" aria-label="Page view">
                  {(pageId || isNew) && (
                    <Button
                      className="brain-page-back"
                      tone="ghost"
                      onClick={() => safelyNavigate("/brain/pages")}
                    >
                      Back to Pages
                    </Button>
                  )}
                  {(["reader", "edit", "preview"] as const).map((value) => (
                    <Button
                      key={value}
                      tone="ghost"
                      aria-pressed={mode === value}
                      disabled={value === "edit" && canonical?.state === "archived"}
                      onClick={() => setMode(value)}
                    >
                      {value[0]!.toUpperCase() + value.slice(1)}
                    </Button>
                  ))}
                </div>
                <div className="brain-page-actions">
                  {message && (
                    <motion.span
                      className="brain-page-settled"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Check size={14} />{message}
                    </motion.span>
                  )}
                  {!isNew && canonical?.state !== "archived" && onAskKora && (
                    <Button
                      tone="ghost"
                      onClick={() => onAskKora({
                        kind: "page",
                        id: canonical!.id,
                        title: canonical!.title,
                      })}
                    >
                      <Sparkles size={15} />Ask Kora
                    </Button>
                  )}
                  {mode === "edit" && (
                    <Button
                      tone="primary"
                      disabled={save.isPending || !dirty}
                      onClick={requestSave}
                    >
                      {save.isPending ? "Saving…" : "Save"}
                    </Button>
                  )}
                  {!isNew && mode !== "edit" && (
                    <Menu
                      trigger={<IconButton label="More Page actions" tooltip="More Page actions"><MoreHorizontal size={18} /></IconButton>}
                      actions={[
                        {
                          id: "archive",
                          label: "Archive Page",
                          description: "Keep it available in Archived Pages.",
                          icon: <Archive size={15} />,
                          disabled: canonical?.state !== "active" || archive.isPending,
                          onSelect: requestArchive,
                        },
                        {
                          id: "delete",
                          label: "Delete Page",
                          description: "Remove this Page after exact confirmation.",
                          icon: <Trash2 size={15} />,
                          danger: true,
                          separatorBefore: true,
                          onSelect: () => setConfirmDelete(true),
                        },
                      ]}
                    />
                  )}
                  {confirmDelete && !isNew && mode !== "edit" && (
                    <>
                      <Button tone="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                      <Button tone="secondary" disabled={deletion.isPending} onClick={requestDeletion}>
                        <Trash2 size={15} />Delete exactly this
                      </Button>
                    </>
                  )}
                </div>
              </header>

              {actionError && (
                <div className="brain-page-error" role="alert">
                  <TriangleAlert size={16} />{actionError}
                </div>
              )}
              {conflict && (
                <motion.div
                  className="brain-page-conflict"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                >
                  <div>
                    <strong>This Page changed somewhere else.</strong>
                    <span>Your draft is still here. Review the latest Page before saving again.</span>
                  </div>
                  <div>
                    <Button tone="ghost" onClick={() => {
                      queryClient.setQueryData(pageDetailKey(conflict.id), conflict);
                      setDraft((current) => ({ ...current, expectedVersion: conflict.version }));
                      saveOperation.resolveConflict();
                      setConflict(undefined);
                      setMessage("Latest Page loaded. Your draft is preserved.");
                      setMode("reader");
                    }}>Review latest</Button>
                    <Button tone="ghost" onClick={() => void navigator.clipboard.writeText(
                      `${draft.title}\n\n${draft.bodyMarkdown}`,
                    )}>Copy my draft</Button>
                    <Button tone="ghost" onClick={() => setConflict(undefined)}>Cancel</Button>
                  </div>
                </motion.div>
              )}

              {mode === "edit" ? (
                <div className="brain-page-editor">
                  <Input
                    className="brain-page-title-input"
                    value={draft.title}
                    maxLength={200}
                    aria-label="Page title"
                    placeholder="Untitled Page"
                    autoFocus={isNew}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                        event.preventDefault();
                        if (dirty && !save.isPending) requestSave();
                      }
                    }}
                  />
                  <Textarea
                    className="brain-page-writing-surface"
                    value={draft.bodyMarkdown}
                    aria-label="Page content"
                    placeholder="Write something worth keeping…"
                    onChange={(event) => setDraft({ ...draft, bodyMarkdown: event.target.value })}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                        event.preventDefault();
                        if (dirty && !save.isPending) requestSave();
                      }
                    }}
                  />
                  <div className="brain-page-details">
                    <Field label="Page kind" htmlFor="brain-page-kind">
                      <KoraSelect
                        id="brain-page-kind"
                        label="Page kind"
                        value={draft.kind}
                        onValueChange={(value) => setDraft({ ...draft, kind: value as BrainPage["kind"] })}
                        options={[
                          { value: "area", label: "Area" },
                          { value: "goal", label: "Goal" },
                          { value: "note", label: "Note" },
                          { value: "reference", label: "Reference" },
                        ]}
                      />
                    </Field>
                    <Field label="Slug" htmlFor="brain-page-slug">
                      <Input
                        id="brain-page-slug"
                        value={draft.slug}
                        placeholder="optional-page-slug"
                        onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <article className="brain-page-reader">
                  <div className="brain-page-reader__identity">
                    <span>{PAGE_KIND_LABEL[isNew ? draft.kind : canonical!.kind]}</span>
                    <h2>{isNew ? draft.title || "Untitled Page" : canonical!.title}</h2>
                    <p>
                      {canonical?.state === "archived"
                        ? "Archived · read only"
                        : canonical
                          ? `Updated ${new Date(canonical.updatedAt).toLocaleString()}`
                          : "Unsaved preview"}
                    </p>
                  </div>
                  <MarkdownDocument>
                    {mode === "preview" || isNew
                      ? draft.bodyMarkdown
                      : canonical!.bodyMarkdown}
                  </MarkdownDocument>
                </article>
              )}
            </motion.div>
          ) : pageId && detail.isLoading ? (
            <motion.div className="brain-page-opening" key="loading">
              <KoraPresenceMark state="gathering" label="Opening Page" />
              Opening Page
            </motion.div>
          ) : pageId && detail.isError ? (
            <motion.div className="brain-page-welcome" key="error">
              <TriangleAlert size={24} />
              <h2>This Page is unavailable.</h2>
              <p>It may have been deleted, or Kora may have lost access to it.</p>
              <div className="brain-page-actions">
                <Button tone="ghost" onClick={() => safelyNavigate("/brain/pages")}>
                  Back to Pages
                </Button>
                <Button onClick={() => void detail.refetch()}>Try again</Button>
              </div>
            </motion.div>
          ) : (
            <motion.div className="brain-page-welcome" key="welcome">
              <BookOpen size={25} />
              <h2>Choose a Page to read.</h2>
              <p>Pages keep deliberate knowledge readable, editable, and connected to its source.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>}
      <ExactOperationConfirmation
        open={deleteApprovalOpen}
        confirmationIds={deleteWaiting?.confirmations.map(({ confirmationId }) => confirmationId) ?? []}
        title="Delete this Page?"
        description={deleteWaiting?.consequence ?? "Nothing is removed until each exact approval is accepted."}
        approveLabel="Delete exactly this"
        approveTone="danger"
        client={client}
        onOpenChange={setDeleteApprovalOpen}
        onApproved={async () => {
          const intent = deleteOperation.retry();
          if (!intent) throw new Error("The exact deletion intent is no longer available.");
          await deletion.mutateAsync(intent);
        }}
        onRejected={() => {
          deleteOperation.cancel();
          setDeleteWaiting(undefined);
          setConfirmDelete(false);
          setActionError("Deletion was not approved. The Page is unchanged.");
        }}
      />
    </section>
  );
}
