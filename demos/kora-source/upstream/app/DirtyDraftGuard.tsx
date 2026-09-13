import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router-dom";
import { Button, Modal } from "../components/primitives";

type DirtyDraftRegistration = {
  id: string;
  label: string;
  discard: () => void;
};

type DirtyDraftRegistry = {
  register: (registration: DirtyDraftRegistration) => void;
  release: (id: string) => void;
};

const DirtyDraftContext = createContext<DirtyDraftRegistry | null>(null);

/**
 * Owns Kora's single route blocker. Draft editors register here rather than
 * trying to intercept individual links, so shell navigation, browser history,
 * redirects, compact controls, and programmatic navigation all behave alike.
 */
export function DirtyDraftGuardProvider({ children }: { children: ReactNode }) {
  const registrations = useRef(new Map<string, DirtyDraftRegistration>());
  const pending = useRef(false);
  const originalProceed = useRef<(() => void) | null>(null);
  const originalReset = useRef<(() => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const completing = useRef(false);
  const [, setRevision] = useState(0);

  const touch = useCallback(() => setRevision((current) => current + 1), []);
  const register = useCallback((registration: DirtyDraftRegistration) => {
    registrations.current.set(registration.id, registration);
    touch();
  }, [touch]);
  const release = useCallback((id: string) => {
    if (registrations.current.delete(id)) touch();
  }, [touch]);

  const blocker = useBlocker(useCallback(() => {
    if (registrations.current.size === 0 || completing.current) return false;
    // Freeze the first attempted destination. React Router updates a blocked
    // transition when another navigation is attempted; we deliberately retain
    // the first proceed/reset closures below so a rapid second click cannot
    // replace, stack, or bypass the user's original intent.
    if (!pending.current) {
      pending.current = true;
      returnFocus.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    return true;
  }, []));

  useLayoutEffect(() => {
    if (blocker.state !== "blocked" || originalProceed.current) return;
    originalProceed.current = blocker.proceed;
    originalReset.current = blocker.reset;
  }, [blocker]);

  const hasDirtyDrafts = registrations.current.size > 0;
  useEffect(() => {
    if (!hasDirtyDrafts) return;
    const protect = (event: BeforeUnloadEvent) => {
      if (registrations.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [hasDirtyDrafts]);

  const stay = useCallback(() => {
    if (completing.current) return;
    const reset = originalReset.current ?? (blocker.state === "blocked" ? blocker.reset : null);
    pending.current = false;
    originalProceed.current = null;
    originalReset.current = null;
    reset?.();
    const target = returnFocus.current;
    returnFocus.current = null;
    queueMicrotask(() => target?.focus());
  }, [blocker]);

  const discardAndLeave = useCallback(() => {
    if (completing.current) return;
    const proceed = originalProceed.current ?? (blocker.state === "blocked" ? blocker.proceed : null);
    if (!proceed) return;
    completing.current = true;
    const mountedOwners = [...registrations.current.values()];
    registrations.current.clear();
    touch();
    for (const owner of mountedOwners) owner.discard();
    pending.current = false;
    originalProceed.current = null;
    originalReset.current = null;
    returnFocus.current = null;
    proceed();
    queueMicrotask(() => { completing.current = false; });
  }, [blocker, touch]);

  const context = useMemo(() => ({ register, release }), [register, release]);
  const count = registrations.current.size;
  const modalOpen = blocker.state === "blocked";

  return (
    <DirtyDraftContext.Provider value={context}>
      {children}
      <Modal
        open={modalOpen}
        onOpenChange={(open) => { if (!open) stay(); }}
        title="Leave with unsaved changes?"
        description="Your edits have not been saved to Kora yet."
        className="dirty-draft-guard"
      >
        <div className="dirty-draft-guard__content">
          <p role="status" aria-live="polite">
            {count === 1
              ? "One open draft will be discarded if you leave."
              : `${count} open drafts will be discarded if you leave.`}
          </p>
          <div className="dirty-draft-guard__actions">
            <Button type="button" autoFocus onClick={stay}>Stay</Button>
            <Button type="button" tone="danger" onClick={discardAndLeave}>
              Discard &amp; leave
            </Button>
          </div>
        </div>
      </Modal>
    </DirtyDraftContext.Provider>
  );
}

/**
 * Registers one mounted editor. `release()` is intentionally synchronous so a
 * successful save can settle ownership immediately before navigating.
 */
export function useDirtyDraftGuard({
  id,
  label,
  dirty,
  onDiscard,
}: {
  id: string;
  label: string;
  dirty: boolean;
  onDiscard: () => void;
}) {
  const registry = useContext(DirtyDraftContext);
  const discardRef = useRef(onDiscard);
  discardRef.current = onDiscard;

  useLayoutEffect(() => {
    if (!registry || !dirty) {
      registry?.release(id);
      return;
    }
    registry.register({ id, label, discard: () => discardRef.current() });
    return () => registry.release(id);
  }, [dirty, id, label, registry]);

  return useMemo(() => ({
    release: () => registry?.release(id),
  }), [id, registry]);
}
