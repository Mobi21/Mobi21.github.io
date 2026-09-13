import { Checkbox } from "@base-ui/react/checkbox";
import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Select } from "@base-ui/react/select";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Check, ChevronDown, CircleAlert, Minus, Search, X } from "lucide-react";
import { motion } from "motion/react";
import {
  forwardRef,
  useId,
  type ComponentProps,
  type InputHTMLAttributes,
  type Ref,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import "./kora-ui.css";
import { DUR, EASE } from "../lib/motion";

/* ── Field ───────────────────────────────────────────────────────────────
   The wrapper every labelled control goes through. Handles the label/hint/
   error relationship so no feature has to re-derive it. */

export function Field({
  label,
  hint,
  error,
  htmlFor,
  layout = "stacked",
  children,
  className = "",
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  layout?: "stacked" | "horizontal";
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseField.Root
      className={`k-field${layout === "horizontal" ? " k-field--horizontal" : ""} ${className}`}
      invalid={Boolean(error)}
    >
      {label && (
        <BaseField.Label className="k-field__label" htmlFor={htmlFor}>
          {label}
        </BaseField.Label>
      )}
      {children}
      {hint && !error && <BaseField.Description className="k-field__hint">{hint}</BaseField.Description>}
      {error && (
        <BaseField.Error match className="k-field__error">
          <CircleAlert size={13} aria-hidden="true" />
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}

/* ── Input / Textarea ─────────────────────────────────────────────────── */

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: "sm" | "md" | "lg";
  mono?: boolean;
  invalid?: boolean;
  onValueChange?: (value: string) => void;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", mono = false, invalid = false, className = "", ...props },
  ref,
) {
  return (
    <BaseInput
      ref={ref}
      className={`k-input${size === "md" ? "" : ` k-input--${size}`}${mono ? " k-input--mono" : ""} ${className}`}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

// File selection stays visually hidden while its trigger is supplied by a
// Kora Button/IconButton in the owning feature.
export const FileInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function FileInput(
  { className = "", ...props },
  ref,
) {
  return <input ref={ref} className={`k-file-input ${className}`} type="file" {...props} />;
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className = "", ...props },
  ref,
) {
  // Base UI registers custom-rendered controls through input-shaped props.
  // The render target is still a real textarea, so bridge only the library's
  // polymorphic typing while preserving the textarea's native public API.
  const controlProps = props as unknown as ComponentProps<typeof BaseField.Control>;
  return (
    <BaseField.Control
      {...controlProps}
      ref={ref}
      render={<textarea />}
      className={`k-textarea ${className}`}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
    />
  );
});

export type KoraSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type KoraSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: KoraSelectOption[];
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  name?: string;
  id?: string;
  size?: "sm" | "md";
};

/** Select owns popup behavior; Field owns visible label/help/error association. */
export function KoraSelect({
  value, onValueChange, options, label, disabled = false, readOnly = false,
  required = false, invalid = false, name, id, size = "md",
}: KoraSelectProps) {
  return <Select.Root
    items={options}
    value={value}
    disabled={disabled}
    readOnly={readOnly}
    required={required}
    name={name}
    id={id}
    onValueChange={(nextValue) => {
      if (nextValue !== null) onValueChange(nextValue);
    }}
  >
    <Select.Trigger className="kora-select__trigger" aria-label={label} aria-invalid={invalid || undefined} data-invalid={invalid || undefined} data-size={size}>
      <Select.Value className="kora-select__value" />
      <Select.Icon className="kora-select__icon"><ChevronDown size={15} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner className="kora-select__positioner" sideOffset={6} alignItemWithTrigger={false}>
        <Select.Popup className="kora-select__popup">
          <Select.List className="kora-select__list">
            {options.map((option) => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="kora-select__item">
              <Select.ItemIndicator className="kora-select__indicator"><Check size={14} aria-hidden="true" /></Select.ItemIndicator>
              <Select.ItemText className="kora-select__copy">
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
              </Select.ItemText>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}

/* ── SearchField ─────────────────────────────────────────────────────── */

export function SearchField({
  value,
  onValueChange,
  placeholder = "Search",
  label,
  className = "",
  autoFocus,
  onKeyDown,
  inputRef,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: InputHTMLAttributes<HTMLInputElement>["onKeyDown"];
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={`k-search ${className}`}>
      <Search size={15} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value ? (
        <button type="button" className="k-search__clear" aria-label="Clear search" onClick={() => onValueChange("")}>
          <X size={13} />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/* ── Switch ──────────────────────────────────────────────────────────── */

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <BaseSwitch.Root
      id={id}
      className="k-switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    >
      <BaseSwitch.Thumb className="k-switch__thumb" />
    </BaseSwitch.Root>
  );
}

/* ── Checkbox ────────────────────────────────────────────────────────── */

export function CheckboxControl({
  checked,
  indeterminate = false,
  onCheckedChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Checkbox.Root
      className="k-checkbox"
      aria-label={label}
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    >
      <Checkbox.Indicator>
        {indeterminate ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

/** Checkbox with its label and hint, as one clickable target. */
export function CheckboxChoice({
  checked,
  onCheckedChange,
  title,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="k-choice" htmlFor={id}>
      <Checkbox.Root
        id={id}
        className="k-checkbox"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      >
        <Checkbox.Indicator>
          <Check size={12} strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className="k-choice__copy">
        <span>{title}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/* ── Radio ───────────────────────────────────────────────────────────── */

export type RadioOption = { value: string; title: ReactNode; hint?: ReactNode; preview?: ReactNode; disabled?: boolean };

export function RadioGroup({
  value,
  onValueChange,
  options,
  label,
  layout = "list",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  label: string;
  layout?: "list" | "tiles";
}) {
  const groupId = useId();
  return (
    <BaseRadioGroup
      className="k-radio-group"
      data-layout={layout}
      aria-label={label}
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
    >
      {options.map((option, index) => {
        const titleId = `${groupId}-option-${index}-title`;
        const hintId = option.hint ? `${groupId}-option-${index}-hint` : undefined;
        return (
        <label className="k-choice" key={option.value}>
          {option.preview && <span className="k-choice__preview" aria-hidden="true">{option.preview}</span>}
          <Radio.Root
            value={option.value}
            className="k-radio"
            disabled={option.disabled}
            aria-labelledby={titleId}
            aria-describedby={hintId}
          >
            <Radio.Indicator className="k-radio__indicator" />
          </Radio.Root>
          <span className="k-choice__copy">
            <span id={titleId}>{option.title}</span>
            {option.hint && <small id={hintId}>{option.hint}</small>}
          </span>
        </label>
        );
      })}
    </BaseRadioGroup>
  );
}

/* ── SegmentedControl ────────────────────────────────────────────────── */

export type SegmentedOption = { value: string; label: ReactNode };

export function SegmentedControl({
  value,
  onValueChange,
  options,
  label,
  layoutId,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
  label: string;
  /** Unique per instance — two mounted controls sharing an id fight over it. */
  layoutId: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      className="k-segmented"
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const chosen = next[0];
        if (typeof chosen === "string" && chosen !== value) onValueChange(chosen);
      }}
    >
      {options.map((option) => (
        <Toggle key={option.value} value={option.value} disabled={disabled} className="k-segmented__item">
          {option.value === value && (
            <motion.span
              layoutId={layoutId}
              className="k-segmented__active"
              transition={{ duration: DUR.base, ease: EASE.out }}
            />
          )}
          <span>{option.label}</span>
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
