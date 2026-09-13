import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { Toast as BaseToast } from "@base-ui/react/toast";
import { Check, ChevronRight, CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { createContext, Fragment, useContext, useId, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import "./kora-ui.css";

type DisclosureCommonProps = {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  panelClassName?: string;
  /** Retain editable controls and drafts while a responsive disclosure closes. */
  keepMounted?: boolean;
};

type StructuredDisclosureProps = DisclosureCommonProps & {
  summary: string;
  description?: string;
  meta?: ReactNode;
  icon?: ReactNode;
  id?: string;
  trigger?: never;
};

type LegacyDisclosureProps = DisclosureCommonProps & {
  trigger: ReactElement;
  summary?: never;
  description?: never;
  meta?: never;
  icon?: never;
  id?: never;
};

export type DisclosureProps = StructuredDisclosureProps | LegacyDisclosureProps;

// The legacy path deliberately preserves existing markup for excluded Agent
// consumers. Owned product surfaces use the structured path and its Kora anatomy.
export function Disclosure(props: DisclosureProps) {
  const {
    children,
    open,
    defaultOpen,
    onOpenChange,
    disabled = false,
    className = "",
    panelClassName = "",
    keepMounted = false,
  } = props;
  const generatedId = useId();

  if ("trigger" in props && props.trigger !== undefined) {
    return <BaseCollapsible.Root
      className={className}
      open={open}
      defaultOpen={defaultOpen}
      disabled={disabled}
      onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
    >
      <BaseCollapsible.Trigger render={props.trigger} />
      <BaseCollapsible.Panel keepMounted={keepMounted} className={panelClassName}>{children}</BaseCollapsible.Panel>
    </BaseCollapsible.Root>;
  }

  const disclosureId = props.id ?? `k-disclosure-${generatedId.replaceAll(":", "")}`;
  const triggerId = `${disclosureId}-trigger`;
  const panelId = `${disclosureId}-panel`;
  const summaryId = `${triggerId}-summary`;
  const descriptionId = props.description !== undefined ? `${triggerId}-description` : undefined;
  const metaId = props.meta !== undefined ? `${triggerId}-meta` : undefined;
  const describedBy = [descriptionId, metaId].filter(Boolean).join(" ") || undefined;
  return <BaseCollapsible.Root
    className={`k-disclosure ${className}`}
    open={open}
    defaultOpen={defaultOpen}
    disabled={disabled}
    onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
  >
    <BaseCollapsible.Trigger
      id={triggerId}
      className="k-disclosure__trigger"
      aria-controls={panelId}
      aria-labelledby={summaryId}
      aria-describedby={describedBy}
    >
      <span className="k-disclosure__leading" aria-hidden="true">{props.icon}</span>
      <span className="k-disclosure__copy">
        <span id={summaryId} className="k-disclosure__summary">{props.summary}</span>
        {props.description !== undefined && <span id={descriptionId} className="k-disclosure__description">{props.description}</span>}
      </span>
      {props.meta !== undefined && <span id={metaId} className="k-disclosure__meta">{props.meta}</span>}
      <ChevronRight className="k-disclosure__chevron" size={16} aria-hidden="true" />
    </BaseCollapsible.Trigger>
    <BaseCollapsible.Panel
      keepMounted={keepMounted}
      id={panelId}
      role="region"
      aria-labelledby={triggerId}
      className={`k-disclosure__panel ${panelClassName}`}
    >
      <div className="k-disclosure__body">{children}</div>
    </BaseCollapsible.Panel>
  </BaseCollapsible.Root>;
}

/* ── Toast ─────────────────────────────────────────────────────────────── */

export type ToastTone = "neutral" | "info" | "success" | "warning" | "danger";

export type ToastAction = {
  label: string;
  onSelect: () => void;
  closeOnSelect?: boolean;
};

export type ToastRequest = {
  id?: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  priority?: "low" | "high";
  timeout?: number;
  action?: ToastAction;
  onClose?: () => void;
};

export type ToastUpdate = Partial<Omit<ToastRequest, "id" | "action">> & {
  action?: ToastAction | null;
};

type KoraToastData = { owner: "kora-ui" };

function toastPriority(tone: ToastTone, priority?: "low" | "high") {
  return priority ?? (tone === "danger" ? "high" : "low");
}

export function useToast() {
  const manager = BaseToast.useToastManager<KoraToastData>();

  const notify = (request: ToastRequest) => {
    const tone = request.tone ?? "neutral";
    let resolvedId = request.id ?? "";
    const actionProps = request.action ? {
      children: request.action.label,
      onClick: () => {
        request.action?.onSelect();
        if (request.action?.closeOnSelect !== false) manager.close(resolvedId);
      },
    } : undefined;
    resolvedId = manager.add({
      id: request.id,
      title: request.title,
      description: request.description,
      type: tone,
      priority: toastPriority(tone, request.priority),
      timeout: request.timeout ?? (request.action ? 0 : undefined),
      actionProps,
      onClose: request.onClose,
      data: { owner: "kora-ui" },
    });
    return resolvedId;
  };

  const update = (id: string, request: ToastUpdate) => {
    const tone = request.tone;
    const updates: Parameters<typeof manager.update>[1] = {};
    if (request.title !== undefined) updates.title = request.title;
    if ("description" in request) updates.description = request.description;
    if (tone !== undefined) updates.type = tone;
    if (request.priority !== undefined || tone !== undefined) updates.priority = toastPriority(tone ?? "neutral", request.priority);
    if (request.timeout !== undefined) updates.timeout = request.timeout;
    if ("onClose" in request) updates.onClose = request.onClose;
    if ("action" in request) updates.actionProps = request.action ? {
      children: request.action.label,
      onClick: () => {
        request.action?.onSelect();
        if (request.action?.closeOnSelect !== false) manager.close(id);
      },
    } : undefined;
    manager.update(id, updates);
  };

  return { notify, update, dismiss: manager.close };
}

function ToastToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") return <CircleCheck size={17} />;
  if (tone === "warning") return <TriangleAlert size={17} />;
  if (tone === "danger") return <CircleAlert size={17} />;
  return <Info size={17} />;
}

const ToastStackExpandedContext = createContext(false);

function KoraToastItem({ toast }: { toast: BaseToast.Root.ToastObject<KoraToastData> }) {
  const expanded = useContext(ToastStackExpandedContext);
  const tone = (toast.type ?? "neutral") as ToastTone;
  const title = typeof toast.title === "string" ? toast.title : "notification";
  return <BaseToast.Root
    toast={toast}
    className={`k-toast k-toast--${tone}`}
    swipeDirection="right"
    tabIndex={expanded ? 0 : -1}
  >
    <BaseToast.Content
      className="k-toast__content"
      render={(contentProps, state) => {
        const actionVisible = state.expanded || !state.behind;
        return <div {...contentProps}>
          <span className="k-toast__icon" aria-hidden="true"><ToastToneIcon tone={tone} /></span>
          <span className="k-toast__copy">
            <BaseToast.Title className="k-toast__title" />
            <BaseToast.Description className="k-toast__body" />
          </span>
          <span className="k-toast__actions">
            <BaseToast.Action
              className="k-toast__action"
              tabIndex={actionVisible ? 0 : -1}
              aria-hidden={actionVisible ? undefined : true}
            />
            <BaseToast.Close
              className="icon-button k-toast__close"
              aria-label={`Dismiss ${title}`}
              tabIndex={expanded ? 0 : -1}
            ><X size={15} /></BaseToast.Close>
          </span>
        </div>;
      }}
    />
  </BaseToast.Root>;
}

function KoraToastViewport() {
  const { toasts } = BaseToast.useToastManager<KoraToastData>();
  return <BaseToast.Portal>
    <BaseToast.Viewport
      className="k-toast-viewport"
      aria-label="Kora notifications"
      render={(props, state) => <ToastStackExpandedContext.Provider value={state.expanded}>
        <div {...props} />
      </ToastStackExpandedContext.Provider>}
    >
      {toasts.map((toast) => <KoraToastItem key={toast.id} toast={toast} />)}
    </BaseToast.Viewport>
  </BaseToast.Portal>;
}

export function ToastProvider({
  children,
  timeout = 5000,
  limit = 3,
}: {
  children: ReactNode;
  timeout?: number;
  limit?: number;
}) {
  return <BaseToast.Provider timeout={timeout} limit={limit}>
    {children}
    <KoraToastViewport />
  </BaseToast.Provider>;
}

/* ── Tooltip ─────────────────────────────────────────────────────────────
   The only tooltip in the product. `title=` is a defect: its delay is untunable,
   its styling is the OS's, and it has no keyboard path. */

type TooltipShortcutProps = {
  shortcut?: never;
  shortcutKeys?: never;
} | {
  shortcut: string;
  shortcutKeys: string;
};

export type TooltipProps = TooltipShortcutProps & {
  content: string;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  id?: string;
};

export function Tooltip({
  content,
  children,
  shortcut,
  shortcutKeys,
  side = "top",
  align = "center",
  sideOffset = 8,
  collisionPadding = 12,
  open,
  onOpenChange,
  disabled = false,
  id,
}: TooltipProps) {
  const generatedId = useId();
  const tooltipId = id ?? `k-tooltip-${generatedId.replaceAll(":", "")}`;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const resolvedOpen = open ?? uncontrolledOpen;
  return (
    <BaseTooltip.Root
      open={resolvedOpen}
      onOpenChange={(nextOpen) => {
        if (open === undefined) setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
      disabled={disabled}
      disableHoverablePopup
    >
      <BaseTooltip.Trigger
        render={children}
        aria-describedby={resolvedOpen ? tooltipId : undefined}
        aria-keyshortcuts={shortcutKeys}
      />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={sideOffset} side={side} align={align} collisionPadding={collisionPadding}>
          <BaseTooltip.Popup id={tooltipId} role="tooltip" className="k-tooltip">
            <span className="k-tooltip__label">{content}</span>
            {shortcut !== undefined && <kbd className="k-tooltip__shortcut" aria-hidden="true">{shortcut}</kbd>}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

export function TooltipProvider({
  children,
  delay = 500,
  closeDelay = 0,
  timeout = 400,
}: {
  children: ReactNode;
  delay?: number;
  closeDelay?: number;
  timeout?: number;
}) {
  return <BaseTooltip.Provider delay={delay} closeDelay={closeDelay} timeout={timeout}>{children}</BaseTooltip.Provider>;
}

/* ── Popover ─────────────────────────────────────────────────────────── */

export type PopoverPurpose = "filters" | "sort" | "view" | "selection" | "notifications" | "status";
type PopoverInitialFocus = ComponentProps<typeof BasePopover.Popup>["initialFocus"];
type PopoverFinalFocus = ComponentProps<typeof BasePopover.Popup>["finalFocus"];

type PopoverCommonProps = {
  trigger: ReactElement;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  className?: string;
  id?: string;
  initialFocus?: PopoverInitialFocus;
  finalFocus?: PopoverFinalFocus;
  "aria-label"?: string;
};

type StructuredPopoverProps = PopoverCommonProps & {
  purpose: PopoverPurpose;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
  closeLabel?: string;
};

type LegacyPopoverProps = PopoverCommonProps & {
  purpose?: never;
  title?: never;
  description?: never;
  actions?: never;
  busy?: never;
  closeLabel?: never;
};

export type PopoverProps = StructuredPopoverProps | LegacyPopoverProps;

export function Popover({
  trigger,
  children,
  title,
  description,
  actions,
  purpose,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  collisionPadding = 12,
  open,
  onOpenChange,
  onOpenChangeComplete,
  className = "",
  id,
  initialFocus,
  finalFocus,
  "aria-label": ariaLabel,
  busy = false,
  closeLabel = "Close popover",
}: PopoverProps) {
  const structured = purpose !== undefined;
  return (
    <BasePopover.Root open={open} onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)} onOpenChangeComplete={onOpenChangeComplete}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner className="k-popover-positioner" sideOffset={sideOffset} side={side} align={align} collisionPadding={collisionPadding}>
          <BasePopover.Popup
            id={id}
            className={`k-popover ${className}`}
            data-purpose={purpose}
            data-structured={structured || undefined}
            aria-busy={busy || undefined}
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            aria-label={ariaLabel}
          >
            {structured ? <>
              <div className="k-popover__head">
                <div>
                  <BasePopover.Title>{title}</BasePopover.Title>
                  {description !== undefined && <BasePopover.Description>{description}</BasePopover.Description>}
                </div>
                <BasePopover.Close render={<button type="button" className="icon-button" aria-label={closeLabel}><X size={15} /></button>} />
              </div>
              <div className="k-popover__body">{children}</div>
              {actions !== undefined && <div className="k-popover__actions">{actions}</div>}
            </> : children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/* ── Menu ────────────────────────────────────────────────────────────── */

type MenuActionBase = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  separatorBefore?: boolean;
};

export type MenuAction = MenuActionBase & ({
  selected?: never;
  danger?: boolean;
  onSelect: () => void;
} | {
  selected: boolean;
  danger?: never;
  onSelect: () => void;
});

type MenuFinalFocus = ComponentProps<typeof BaseMenu.Popup>["finalFocus"];

export type MenuProps = {
  trigger: ReactElement;
  actions: MenuAction[];
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  finalFocus?: MenuFinalFocus;
  className?: string;
  id?: string;
};

export function Menu({
  trigger,
  actions,
  side = "bottom",
  align = "end",
  sideOffset = 6,
  collisionPadding = 12,
  open,
  onOpenChange,
  finalFocus,
  className = "",
  id,
}: MenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const resolvedOpen = open ?? uncontrolledOpen;
  const updateOpen = (nextOpen: boolean) => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  return (
    <BaseMenu.Root open={resolvedOpen} onOpenChange={updateOpen}>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={sideOffset} side={side} align={align} collisionPadding={collisionPadding}>
          <BaseMenu.Popup id={id} className={`k-menu ${className}`} finalFocus={finalFocus}>
            {actions.map((action) => {
              const content = <>
                <span className="k-menu__mark" aria-hidden="true">
                  {action.selected !== undefined
                    ? <BaseMenu.CheckboxItemIndicator><Check size={14} strokeWidth={2.4} /></BaseMenu.CheckboxItemIndicator>
                    : action.icon}
                </span>
                <span className="k-menu__copy">
                  <span className="k-menu__label">{action.label}</span>
                  {action.description !== undefined && <span className="k-menu__description">{action.description}</span>}
                </span>
                {action.shortcut !== undefined && <kbd className="k-menu__shortcut" aria-hidden="true">{action.shortcut}</kbd>}
              </>;
              return <Fragment key={action.id}>
                {action.separatorBefore && <div className="k-menu__separator" role="separator" />}
                {action.selected !== undefined
                  ? <BaseMenu.CheckboxItem
                    className="k-menu__item k-menu__item--selection"
                    label={action.label}
                    checked={action.selected}
                    disabled={action.disabled}
                    aria-keyshortcuts={action.shortcut}
                    closeOnClick
                    onCheckedChange={action.onSelect}
                  >{content}</BaseMenu.CheckboxItem>
                  : <BaseMenu.Item
                    className={`k-menu__item${action.danger ? " k-menu__item--danger" : ""}`}
                    label={action.label}
                    disabled={action.disabled}
                    aria-keyshortcuts={action.shortcut}
                    onKeyDownCapture={(event) => {
                      if (event.key !== " " || action.disabled) return;
                      event.preventDefault();
                      event.stopPropagation();
                      action.onSelect();
                      queueMicrotask(() => updateOpen(false));
                    }}
                    onClick={() => {
                      action.onSelect();
                      updateOpen(false);
                    }}
                  >{content}</BaseMenu.Item>}
              </Fragment>;
            })}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
