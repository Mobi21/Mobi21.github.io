import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { type ReactNode, type RefObject } from "react";
import "./kora-ui.css";
import { IconButton } from "./button";

// The Kora primitive layer. Feature code imports from here, never from Base UI
// and never a raw <input>/<select>/title= tooltip. See DESIGN.md — Components.
// Keep feature code on Kora-owned primitives; Base UI remains encapsulated in
// the component modules re-exported by this public barrel.
export * from "./form";
export * from "./display";
export * from "./overlays";
export * from "./button";
export * from "./workspace";
export * from "./collections";
export * from "./chart";

export function KoraPresenceMark({ state = "idle", label }: { state?: "idle" | "gathering" | "active" | "waiting" | "failed"; label?: string }) {
  return (
    <span className={`presence presence--${state}`} role={label ? "status" : undefined} aria-label={label}>
      <span className="presence__core" />
      <span className="presence__orbit" />
    </span>
  );
}

export function StatusText({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="status-text">
      {icon}
      <span>{children}</span>
    </span>
  );
}

export type ModalPurpose = "confirm" | "focused-form" | "document-detail";
export type ModalDismissPolicy = "standard" | "explicit";
export type ModalDismissReason = "outside-press" | "escape-key" | "close-press";

/** Kora-owned modal shell for fast command/search surfaces with custom bodies. */
export function CommandDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  initialFocus,
  finalFocus,
  closeLabel,
  popupClassName = "",
  backdropClassName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  finalFocus?: boolean | RefObject<HTMLElement | null>;
  closeLabel?: string;
  popupClassName?: string;
  backdropClassName?: string;
}) {
  return <Dialog.Root open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
    <Dialog.Portal>
      <Dialog.Backdrop className={backdropClassName} />
      <Dialog.Popup className={popupClassName} initialFocus={initialFocus} finalFocus={finalFocus}>
        <Dialog.Title className="sr-only">{title}</Dialog.Title>
        <Dialog.Description className="sr-only">{description}</Dialog.Description>
        {closeLabel ? <Dialog.Close render={<IconButton className="command-dialog__close" label={closeLabel}><X size={16} /></IconButton>} /> : null}
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

type ModalBaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  purpose?: ModalPurpose;
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  finalFocus?: boolean | RefObject<HTMLElement | null>;
  busy?: boolean;
  closeLabel?: string;
  className?: string;
};

export type ModalProps = ModalBaseProps & (
  | { dismissPolicy?: "standard"; onDismissAttempt?: never }
  | { dismissPolicy: "explicit"; onDismissAttempt: (reason: ModalDismissReason) => void }
);

export function Modal({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  children,
  actions,
  purpose,
  dismissPolicy = "standard",
  onDismissAttempt,
  initialFocus,
  finalFocus,
  busy = false,
  closeLabel = "Close dialog",
  className = "",
}: ModalProps) {
  return <Dialog.Root
    open={open}
    onOpenChangeComplete={onOpenChangeComplete}
    onOpenChange={(nextOpen, details) => {
      if (
        !nextOpen
        && dismissPolicy === "explicit"
        && (details.reason === "outside-press" || details.reason === "escape-key" || details.reason === "close-press")
      ) {
        onDismissAttempt?.(details.reason);
        return;
      }
      onOpenChange(nextOpen);
    }}
  >
    <Dialog.Portal>
      <Dialog.Backdrop className="dialog-backdrop" />
      <Dialog.Popup
        className={`kora-modal ${className}`}
        data-purpose={purpose}
        data-dismiss-policy={dismissPolicy}
        aria-busy={busy || undefined}
        initialFocus={initialFocus}
        finalFocus={finalFocus}
      >
        <div className="kora-modal__head"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div><Dialog.Close render={<IconButton label={closeLabel}><X size={17} /></IconButton>} /></div>
        <div className="kora-modal__body">{children}</div>
        {actions ? <div className="kora-modal__actions">{actions}</div> : null}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

export type SheetPurpose = "inspector" | "navigation" | "properties" | "notifications";
export type SheetDismissPolicy = "standard" | "explicit";
export type SheetDismissReason = ModalDismissReason;

type SheetBaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  side?: "left" | "right";
  children: ReactNode;
  actions?: ReactNode;
  purpose?: SheetPurpose;
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  finalFocus?: boolean | RefObject<HTMLElement | null>;
  busy?: boolean;
  className?: string;
  id?: string;
  closeLabel?: string;
  modality?: "modal" | "focus-contained";
  portalContainer?: HTMLElement | ShadowRoot | null | RefObject<HTMLElement | ShadowRoot | null>;
};

export type SheetProps = SheetBaseProps & (
  | { dismissPolicy?: "standard"; onDismissAttempt?: never }
  | { dismissPolicy: "explicit"; onDismissAttempt: (reason: SheetDismissReason) => void }
);

export function Sheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  side = "right",
  children,
  actions,
  purpose,
  dismissPolicy = "standard",
  onDismissAttempt,
  initialFocus,
  finalFocus,
  busy = false,
  className = "",
  id,
  closeLabel = "Close panel",
  modality = "modal",
  portalContainer,
}: SheetProps) {
  return (
    <Dialog.Root
      open={open}
      modal={modality === "focus-contained" ? "trap-focus" : true}
      disablePointerDismissal={modality === "focus-contained"}
      onOpenChange={(nextOpen, details) => {
        if (
          !nextOpen
          && dismissPolicy === "explicit"
          && (details.reason === "outside-press" || details.reason === "escape-key" || details.reason === "close-press")
        ) {
          onDismissAttempt?.(details.reason);
          return;
        }
        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <Dialog.Portal container={portalContainer}>
        {modality === "modal" ? <Dialog.Backdrop className="dialog-backdrop" /> : null}
        <Dialog.Popup
          id={id}
          className={`kora-sheet ${className}`}
          data-side={side}
          data-purpose={purpose}
          data-modality={modality}
          data-dismiss-policy={dismissPolicy}
          aria-modal={modality === "modal" ? true : undefined}
          aria-busy={busy || undefined}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
        >
          <div className="kora-sheet__head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && <Dialog.Description>{description}</Dialog.Description>}
            </div>
            <Dialog.Close render={<IconButton label={closeLabel}><X size={17} /></IconButton>} />
          </div>
          <div className="kora-sheet__body">{children}</div>
          {actions ? <div className="kora-sheet__actions">{actions}</div> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
