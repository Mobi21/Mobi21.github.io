const CONSUMED_PREFIX = "kora.activation.consumed.";

export type SessionActivation = { id: string; targetSessionId: string; stableRoute: string };

function activationId(targetSessionId: string) {
  // React Router gives every fresh navigation a history key and preserves it
  // across renderer reload. A raw deep link has no key, so its exact hash is
  // the stable launch identity. Both cases prevent replay after interruption.
  const historyKey = (window.history.state as { key?: unknown } | null)?.key;
  const source = typeof historyKey === "string" ? `${targetSessionId}|${historyKey}` : window.location.hash;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `${targetSessionId}:${(hash >>> 0).toString(36)}`;
}

export function consumeSessionActivation(pathname: string, search: string): SessionActivation | undefined {
  if (pathname !== "/kora") return;
  const parameters = new URLSearchParams(search);
  const targetSessionId = parameters.get("session")?.trim();
  if (!targetSessionId) return;
  const id = activationId(targetSessionId);
  const consumedKey = `${CONSUMED_PREFIX}${id}`;
  // Consumption is recorded before any asynchronous validation or transition.
  // A renderer interruption can therefore never replay this mutation.
  if (sessionStorage.getItem(consumedKey)) return;
  sessionStorage.setItem(consumedKey, "1");
  return { id, targetSessionId, stableRoute: "/kora" };
}

export function clearActivationFromHash() {
  const route = window.location.hash.slice(1);
  const question = route.indexOf("?");
  if (question < 0) return;
  const pathname = route.slice(0, question) || "/kora";
  const parameters = new URLSearchParams(route.slice(question + 1));
  parameters.delete("session");
  const next = parameters.size ? `${pathname}?${parameters}` : pathname;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${next}`);
}

export function __activationStoragePrefixForTests() { return CONSUMED_PREFIX; }
