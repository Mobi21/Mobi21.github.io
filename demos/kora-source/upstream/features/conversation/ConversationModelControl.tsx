import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  LoaderCircle,
  LogIn,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, KoraSelect, Modal, Popover, Tooltip } from "../../components/primitives";
import { useConnection } from "../../app/connection-context";
import {
  runtime,
  type NativeAuthInteractionEvent,
  type NativeModelCatalog,
  type NativeThinkingLevel,
} from "../../lib/runtime";
import { copyText } from "../../lib/clipboard";

const MODEL_PAGE_SIZE = 40;

type ModelEntry = {
  provider: NativeModelCatalog[number];
  model: NativeModelCatalog[number]["models"][number];
};

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modelMatches(entry: ModelEntry, query: string) {
  if (!query) return true;
  const haystack = [entry.provider.name, entry.provider.id, entry.model.name, entry.model.id].join(" ").toLocaleLowerCase();
  return haystack.includes(query);
}

function providerMatches(provider: NativeModelCatalog[number], query: string) {
  if (!query) return true;
  return `${provider.name} ${provider.id}`.toLocaleLowerCase().includes(query)
    || provider.models.some((model) => `${model.name} ${model.id}`.toLocaleLowerCase().includes(query));
}

function modelReasoning(model: ModelEntry["model"], current: NativeThinkingLevel | undefined): NativeThinkingLevel {
  return model.reasoning.includes(current as never) ? current as NativeThinkingLevel : model.reasoning[0] ?? "medium";
}

function ModelAuthFlow({ providerId, providerName, methods, onComplete, onClose }: { providerId: string; providerName: string; methods: Array<"oauth" | "api-key">; onComplete: () => Promise<void>; onClose: () => void }) {
  const [interactionId, setInteractionId] = useState<string>();
  const [authEvent, setAuthEvent] = useState<NativeAuthInteractionEvent>();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [codeCopied, setCodeCopied] = useState(false);
  const lifecycle = useRef({ closed: false, interactionId: undefined as string | undefined, completed: false });

  const begin = async (method: "oauth" | "api-key") => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await runtime.startModelAuth(providerId, method);
      if (lifecycle.current.closed) {
        await runtime.cancelModelAuth(result.id).catch(() => undefined);
        return;
      }
      lifecycle.current.interactionId = result.id;
      setInteractionId(result.id);
      setAuthEvent({ type: "waiting" });
    } catch (reason) {
      if (!lifecycle.current.closed) setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    lifecycle.current.closed = false;
    lifecycle.current.completed = false;
    return () => {
      lifecycle.current.closed = true;
      const pendingInteractionId = lifecycle.current.interactionId;
      if (pendingInteractionId && !lifecycle.current.completed) {
        void runtime.cancelModelAuth(pendingInteractionId).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!interactionId) return;
    const controller = new AbortController();
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          const next = await runtime.nextModelAuth(interactionId);
          if (controller.signal.aborted) return;
          setAuthEvent(next);
          if (next.type === "complete") {
            lifecycle.current.completed = true;
            await onComplete();
            return;
          }
          if (next.type === "failed" || next.type === "cancelled" || next.type === "expired") return;
        } catch (reason) {
          if (!controller.signal.aborted) setError((reason as Error).message);
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [interactionId, onComplete]);

  const respond = async (promptId: string, response: string) => {
    if (!interactionId || !response) return;
    setBusy(true);
    setError(undefined);
    try {
      await runtime.respondModelAuth(interactionId, promptId, response);
      setValue("");
      setAuthEvent({ type: "waiting" });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    lifecycle.current.closed = true;
    const pendingInteractionId = lifecycle.current.interactionId;
    lifecycle.current.interactionId = undefined;
    if (pendingInteractionId) await runtime.cancelModelAuth(pendingInteractionId).catch(() => undefined);
    onClose();
  };

  return <section className="model-auth-flow">
    <div className="model-auth-flow__head"><span><LogIn size={16} /><strong>Connect {providerName}</strong></span><Button tone="link" onClick={() => void cancel()}>Cancel</Button></div>
    {!interactionId && <div className="model-auth-methods">{methods.map((method) => <Button key={method} disabled={busy} onClick={() => void begin(method)}>{method === "oauth" ? "Continue in browser" : "Use API key"}</Button>)}</div>}
    {(authEvent?.type === "waiting" || authEvent?.type === "progress") && <div className="auth-waiting"><LoaderCircle size={16} className="spin" />{authEvent.type === "progress" ? authEvent.message : "Waiting for provider…"}</div>}
    {authEvent?.type === "auth_url" && <div className="auth-instruction"><p>{authEvent.instructions ?? "Continue securely with the provider, then return to Kora."}</p><a href={authEvent.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open secure sign-in</a></div>}
    {authEvent?.type === "device_code" && <div className="auth-device"><p>Open <a href={authEvent.verificationUri} target="_blank" rel="noreferrer">{authEvent.verificationUri}</a> and enter:</p><Button tone="ghost" onClick={() => void copyText(authEvent.userCode).then(() => setCodeCopied(true), (reason: Error) => setError(reason.message))}><code>{authEvent.userCode}</code>{codeCopied ? <Check size={14} /> : <Clipboard size={14} />}</Button></div>}
    {authEvent?.type === "prompt" && authEvent.prompt.type !== "select" && <form className="auth-prompt" onSubmit={(formEvent) => { formEvent.preventDefault(); void respond(authEvent.promptId, value); }}><label>{authEvent.prompt.message}<Input autoFocus type={authEvent.prompt.type === "secret" ? "password" : "text"} value={value} placeholder={authEvent.prompt.placeholder} onChange={(inputEvent) => setValue(inputEvent.target.value)} /></label><Button tone="primary" disabled={busy || !value}>Continue</Button></form>}
    {authEvent?.type === "prompt" && authEvent.prompt.type === "select" && <div className="auth-select"><p>{authEvent.prompt.message}</p>{authEvent.prompt.options.map((option) => <Button tone="ghost" key={option.id} disabled={busy} onClick={() => void respond(authEvent.promptId, option.id)}><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</Button>)}</div>}
    {authEvent?.type === "complete" && <div className="auth-complete"><Check size={16} />Provider connected. Catalog refreshed.</div>}
    {authEvent?.type === "failed" && <div className="composer-error"><AlertTriangle size={14} />{authEvent.message}</div>}
    {authEvent?.type === "expired" && <div className="composer-error"><AlertTriangle size={14} />{authEvent.message ?? "This sign-in session expired. Start again."}</div>}
    {error && <div className="composer-error"><AlertTriangle size={14} />{error}</div>}
  </section>;
}

export function ModelControl({ active }: { active: boolean }) {
  const { bootstrap, refresh } = useConnection();
  const [open, setOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [authProvider, setAuthProvider] = useState<string>();
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(MODEL_PAGE_SIZE);
  const catalog = useQuery<{ providers: NativeModelCatalog }>({ queryKey: ["model-catalog"], queryFn: runtime.models, enabled: true, staleTime: 30_000 });
  const { refetch: refetchCatalog } = catalog;

  const currentProvider = catalog.data?.providers.find((provider) => provider.id === bootstrap?.model.provider);
  const currentModel = currentProvider?.models.find((model) => model.id === bootstrap?.model.model);
  const currentModelName = currentModel?.name ?? bootstrap?.model.model ?? "Kora";
  const currentProviderName = currentProvider?.name ?? bootstrap?.model.provider ?? "Kora";
  const currentConnected = currentProvider?.configured ?? bootstrap?.model.configured ?? false;
  const currentReasoning = (bootstrap?.model.reasoning ?? "medium") as NativeThinkingLevel;

  useEffect(() => {
    const openModel = (event: Event) => {
      setOpen(true);
      const provider = (event as CustomEvent<{ provider?: string }>).detail?.provider;
      if (provider) setAuthProvider(provider);
    };
    window.addEventListener("kora:open-model-control", openModel);
    return () => window.removeEventListener("kora:open-model-control", openModel);
  }, []);

  useEffect(() => {
    setVisibleCount(MODEL_PAGE_SIZE);
  }, [providerFilter, query]);

  const select = async (provider: string, model: string, reasoning: NativeThinkingLevel, modelName: string) => {
    if (active || busy) return;
    setBusy(true);
    setError(undefined);
    setFeedback(undefined);
    let selectionSettled = false;
    try {
      await runtime.selectModel({ provider, model, reasoning });
      selectionSettled = true;
      await refresh();
      setFeedback(`${modelName} selected for the next turn · ${humanize(reasoning)} reasoning.`);
    } catch (reason) {
      setError(selectionSettled ? "The model changed, but Kora could not refresh the current session." : (reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const authSelection = catalog.data?.providers.find((provider) => provider.id === authProvider);
  const completeAuth = useCallback(async () => {
    await refetchCatalog();
    await refresh();
    setAuthProvider(undefined);
  }, [refetchCatalog, refresh]);

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (catalog.data?.providers ?? [])
      .filter((provider) => providerFilter === "all" || provider.id === providerFilter)
      .filter((provider) => providerMatches(provider, normalizedQuery))
      .sort((left, right) => Number(right.configured) - Number(left.configured));
  }, [catalog.data?.providers, providerFilter, query]);
  const providerFilterOptions = useMemo(() => [
    { value: "all", label: "All providers", description: "Show connected models and connection options" },
    ...(catalog.data?.providers ?? [])
      .slice()
      .sort((left, right) => Number(right.configured) - Number(left.configured))
      .map((provider) => ({ value: provider.id, label: provider.name, description: provider.configured ? "Connected" : "Connection needed" })),
  ], [catalog.data?.providers]);

  const filteredModels = useMemo<ModelEntry[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return filteredProviders.flatMap((provider) => provider.configured
      ? provider.models.map((model) => ({ provider, model })).filter((entry) => modelMatches(entry, normalizedQuery))
      : []);
  }, [filteredProviders, query]);
  const duplicateModelNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const provider of catalog.data?.providers ?? []) {
      if (!provider.configured) continue;
      for (const model of provider.models) counts.set(model.name, (counts.get(model.name) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [catalog.data?.providers]);
  const visibleModels = filteredModels.slice(0, visibleCount);
  const hasMore = visibleModels.length < filteredModels.length;
  const visibleProviderIds = new Set(visibleModels.map((entry) => entry.provider.id));
  const disconnectedProviders = filteredProviders.filter((provider) => !provider.configured);
  const hasSearchResults = visibleModels.length > 0 || disconnectedProviders.length > 0;

  return <div className="model-controls">
    <Tooltip content={currentModelName}><Button tone="ghost" className="model-state model-state--model" onClick={() => setOpen(true)} disabled={active} aria-label={active ? "Model changes are available when Kora is idle" : "Change model"}><span className="model-state__model-name">{currentModelName}</span></Button></Tooltip>
    <Popover open={reasoningOpen} onOpenChange={setReasoningOpen} side="top" sideOffset={8} align="start" className="reasoning-popover" trigger={<Button tone="ghost" className="model-state model-state--reasoning" disabled={active} aria-label={active ? "Reasoning changes are available when Kora is idle" : "Change reasoning level"}><span>{humanize(bootstrap?.model.reasoning ?? "medium")}</span><ChevronDown size={12} />
    </Button>}>
      <strong>Reasoning</strong>
      {catalog.isLoading && <span className="reasoning-popover__loading"><LoaderCircle size={14} className="spin" />Loading levels…</span>}
      {catalog.error && <div className="reasoning-popover__state" role="alert"><AlertTriangle size={14} /><span>Reasoning levels could not be loaded.</span><Button tone="link" onClick={() => void refetchCatalog()}>Try again</Button></div>}
      {!catalog.isLoading && !catalog.error && !currentModel && <div className="reasoning-popover__state" role="status"><AlertTriangle size={14} /><span>Reasoning controls are unavailable for this model.</span></div>}
      {!catalog.isLoading && !catalog.error && currentModel?.reasoning.map((level) => <Button tone="ghost" key={level} aria-pressed={level === bootstrap?.model.reasoning} disabled={busy || active} onClick={() => { void select(currentProvider!.id, currentModel.id, level, currentModel.name); setReasoningOpen(false); }}><span>{humanize(level)}</span>{level === bootstrap?.model.reasoning && <Check size={14} />}</Button>)}
    </Popover>
    <Modal open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) { setAuthProvider(undefined); setError(undefined); setFeedback(undefined); } }} title="Model & reasoning" description={active ? "The current run is active. Selection is available after it settles." : "Choose what Kora uses for the next turn."}>
      {authSelection && <ModelAuthFlow providerId={authSelection.id} providerName={authSelection.name} methods={authSelection.authMethods} onComplete={completeAuth} onClose={() => setAuthProvider(undefined)} />}
      {!authSelection && <div className="model-picker">
        <section className="model-current" aria-label="Current model selection">
          <div><span className="model-current__label">Current model</span><strong>{currentModelName}</strong><small>{currentProviderName} · {currentConnected ? "Connected" : "Connection needed"}</small></div>
          <div className="model-current__reasoning"><span>Reasoning</span><div className="model-current__reasoning-options">{(currentModel?.reasoning ?? [currentReasoning]).map((level) => <Button tone="ghost" key={level} aria-pressed={level === currentReasoning} disabled={busy || active || !currentProvider || !currentModel} onClick={() => currentProvider && currentModel ? void select(currentProvider.id, currentModel.id, level, currentModel.name) : undefined}>{humanize(level)}</Button>)}</div></div>
        </section>
        <label className="model-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search models and providers</span><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search model, provider, or ID…" /></label>
        <div className="model-provider-filter"><KoraSelect label="Filter models by provider" value={providerFilter} onValueChange={setProviderFilter} options={providerFilterOptions} /></div>
        {catalog.isLoading && <div className="model-picker__state" role="status"><LoaderCircle className="spin" size={18} />Loading available models…</div>}
        {catalog.error && <div className="model-picker__state model-picker__state--error" role="alert"><AlertTriangle size={18} /><div><strong>Models could not be loaded.</strong><p>{(catalog.error as Error).message}</p></div><Button onClick={() => void refetchCatalog()}>Try again</Button></div>}
        {!catalog.isLoading && !catalog.error && catalog.data && <>
          <div className="model-results__meta"><span>{filteredModels.length === 0 ? "No connected models" : `Showing ${visibleModels.length} of ${filteredModels.length} models`}</span>{query && <small>Search includes provider names and IDs.</small>}</div>
          <div className="model-results">
            {filteredProviders.filter((provider) => provider.configured && visibleProviderIds.has(provider.id)).map((provider) => <section className="model-provider-group" key={provider.id}>
              <div className="model-provider-label"><span>{provider.name}</span><small>Connected · {provider.models.length} models</small></div>
              {visibleModels.filter((entry) => entry.provider.id === provider.id).map(({ model }) => {
                const selected = provider.id === bootstrap?.model.provider && model.id === bootstrap?.model.model;
                const showModelId = query.trim().length > 0 && duplicateModelNames.has(model.name);
                return <Button tone="ghost" key={`${provider.id}:${model.id}`} disabled={busy || active} aria-pressed={selected} onClick={() => void select(provider.id, model.id, modelReasoning(model, currentReasoning), model.name)}>
                  <Tooltip content={model.id}><span className="model-result__identity"><strong>{model.name}</strong>{showModelId && <code>{model.id}</code>}</span></Tooltip><small>{model.input.includes("image") ? "Text + images" : "Text"}</small>{selected && <Check size={16} aria-label="Selected" />}
                </Button>;
              })}
            </section>)}
            {disconnectedProviders.map((provider) => <section className="model-provider-group model-provider-group--disconnected" key={provider.id}>
              <div className="model-provider-label"><span>{provider.name}</span><Button tone="link" disabled={active || busy || provider.authMethods.length === 0} onClick={() => setAuthProvider(provider.id)}><LogIn size={12} />{provider.authMethods.length ? "Connect" : "No sign-in method"}</Button></div>
              <p>{provider.authError ?? "Connect this provider to use its models."}</p>
            </section>)}
            {!hasSearchResults && <div className="model-picker__state"><Search size={18} /><div><strong>No matching models</strong><p>Try a different model, provider, or ID.</p></div></div>}
          </div>
          {hasMore && <Button className="model-show-more" tone="secondary" onClick={() => setVisibleCount((count) => count + MODEL_PAGE_SIZE)}>Show 40 more</Button>}
        </>}
        {feedback && <p className="model-feedback" role="status"><Check size={14} />{feedback}</p>}
        {error && <p className="composer-error" role="alert"><AlertTriangle size={14} />{error}</p>}
      </div>}
    </Modal>
  </div>;
}
