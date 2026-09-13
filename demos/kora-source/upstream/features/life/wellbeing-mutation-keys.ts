import { useRef } from "react";

export type WellbeingMutationOperation = "update" | "archive" | "restore";

type PendingMutation = {
  fingerprint: string;
  requestKey: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  return value;
}

function intentId(operation: WellbeingMutationOperation, recordId: string) {
  return `${operation}:${recordId}`;
}

export class WellbeingMutationKeys {
  private readonly pending = new Map<string, PendingMutation>();

  constructor(
    private readonly createKey: () => string = () => crypto.randomUUID(),
  ) {}

  acquire(
    operation: WellbeingMutationOperation,
    recordId: string,
    expectedVersion: number,
    changes?: unknown,
  ) {
    const id = intentId(operation, recordId),
      fingerprint = JSON.stringify(
        stableValue({ expectedVersion, changes: changes ?? null }),
      ),
      current = this.pending.get(id);
    if (current?.fingerprint === fingerprint) return current.requestKey;
    const requestKey = this.createKey();
    this.pending.set(id, { fingerprint, requestKey });
    return requestKey;
  }

  settle(operation: WellbeingMutationOperation, recordId: string) {
    this.pending.delete(intentId(operation, recordId));
  }
}

export function useWellbeingMutationKeys() {
  const keys = useRef<WellbeingMutationKeys | null>(null);
  if (!keys.current) keys.current = new WellbeingMutationKeys();
  return keys.current;
}
