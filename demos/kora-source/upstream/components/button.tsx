import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Tooltip } from "./overlays";

/**
 * The shared ordinary-action primitive. Keeping this below the public
 * primitives barrel lets other foundation modules use the same control
 * without introducing a barrel dependency cycle.
 */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "danger" | "link";
  loading?: boolean;
  size?: "sm" | "md";
};

/**
 * Semantic button behavior for controls whose owning feature supplies the
 * complete visual treatment (calendar cells, ledger rows, segmented choices).
 * This keeps default type/ref/disabled ownership in the primitive layer
 * without applying the ordinary action-button skin.
 */
export const Pressable = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function Pressable({ type = "button", ...props }, ref) {
    return <button ref={ref} type={type} {...props} />;
  },
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = "secondary", loading = false, disabled, size = "md", type = "button", className = "", children, ...props },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      className={`button button--${tone} ${className}`}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
      {children}
    </Pressable>
  );
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tooltip?: string;
  loading?: boolean;
  size?: "sm" | "md";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tooltip, loading = false, size = "md", disabled, className = "", children, ...props }, ref,
) {
  const control = <Pressable
    {...props}
    ref={ref}
    className={`icon-button ${className}`}
    data-size={size}
    aria-label={label}
    aria-busy={loading || undefined}
    disabled={disabled || loading}
  >{loading ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : children}</Pressable>;
  return tooltip ? <Tooltip content={tooltip} disabled={disabled || loading}>{control}</Tooltip> : control;
});
