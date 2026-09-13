import { ChevronDown } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { Button } from "../components/primitives";
import { KoraMark } from "../components/KoraMark";

type NavigationToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-controls"> & {
  open: boolean;
  onToggle?: () => void;
  controls?: string;
};

/**
 * One compact Kora label opens global workspace navigation. Page identity
 * belongs to the page header and local destinations belong to the workspace
 * rail.
 */
export const NavigationToggle = forwardRef<HTMLButtonElement, NavigationToggleProps>(function NavigationToggle({
  open,
  onToggle,
  controls = "kora-navigator-menu",
  onClick,
  ...buttonProps
}, ref) {
  const label = `${open ? "Close" : "Open"} Kora navigation`;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) onToggle?.();
  };

  return (
    <Button
      {...buttonProps}
      ref={ref}
      title={buttonProps.title ?? "Navigate Kora"}
      className={`navigation-toggle ${buttonProps.className ?? ""}`}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={handleClick}
    >
      <KoraMark width={17} height={17} aria-hidden="true" />
      <span className="navigation-toggle__label">Kora</span>
      <ChevronDown className="navigation-toggle__chevron" size={14} strokeWidth={1.8} aria-hidden="true" />
    </Button>
  );
});
