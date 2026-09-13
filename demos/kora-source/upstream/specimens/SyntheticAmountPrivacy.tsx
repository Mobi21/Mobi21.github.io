import { useEffect } from "react";
import { useAmountPrivacy } from "../app/amount-privacy";

/**
 * Seeds ephemeral browser-review state without creating a second persisted
 * product preference. Specimens never run this inside the native host.
 */
export function SyntheticAmountPrivacy({ hidden }: { hidden: boolean }) {
  const { setAmountsHidden } = useAmountPrivacy();
  useEffect(() => setAmountsHidden(hidden), [hidden, setAmountsHidden]);
  return null;
}
