import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CircleAlert, DatabaseBackup, RotateCcw } from "lucide-react";
import { desktopHost, hasDesktopHost, type LocalBackupInspectionOutcome } from "../lib/desktop-host";
import { Button } from "./primitives";
import "./local-recovery.css";

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

const formatBytes = (bytes: number) => new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte",
  unitDisplay: "short",
  maximumFractionDigits: 1,
}).format(bytes / (bytes >= 1024 * 1024 ? 1024 * 1024 : 1024));

const exclusionLabel = (value: string) => value.replace(/_/g, " ");

export function LocalRecoveryControls({ startup = false }: { startup?: boolean }) {
  const [inspection, setInspection] = useState<Extract<LocalBackupInspectionOutcome, { status: "settled" }>>();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmUnvalidated, setConfirmUnvalidated] = useState(false);

  const create = useMutation({ mutationFn: desktopHost.createLocalBackup });
  const inspect = useMutation({
    mutationFn: desktopHost.inspectLocalBackup,
    onSuccess: (result) => {
      setConfirmReplace(false);
      setConfirmUnvalidated(false);
      setInspection(result.status === "settled" ? result : undefined);
    },
    onError: () => {
      setConfirmReplace(false);
      setConfirmUnvalidated(false);
      setInspection(undefined);
    },
  });
  const restore = useMutation({
    mutationFn: (allowUnvalidatedCurrentState: boolean) => desktopHost.restoreLocalBackup(
      inspection!.backupHandle,
      { replaceCurrentState: true, ...(allowUnvalidatedCurrentState ? { allowUnvalidatedCurrentState: true } : {}) },
    ),
    onSuccess: (result) => {
      if (result.status === "failed" && result.code === "validated_rollback_unavailable") {
        setConfirmReplace(false);
        setConfirmUnvalidated(true);
      } else if (result.status !== "failed") {
        setConfirmReplace(false);
        setConfirmUnvalidated(false);
        setInspection(undefined);
      }
    },
    onError: () => {
      setConfirmReplace(false);
      setConfirmUnvalidated(false);
      setInspection(undefined);
    },
  });
  const latest = useQuery({
    queryKey: ["host", "local-recovery", "latest"],
    queryFn: desktopHost.latestRecoveryStatus,
    enabled: hasDesktopHost,
    refetchInterval: (query) => create.isPending || restore.isPending || query.state.data?.status === "running" ? 750 : false,
  });

  if (!hasDesktopHost) {
    return <div className="local-recovery__callout"><DatabaseBackup size={18} /><div><strong>Desktop recovery</strong><p>Open the built Kora desktop app to create, inspect, or restore a local backup.</p></div></div>;
  }

  const failure = [create.data, inspect.data, restore.data].find(result => result?.status === "failed");
  const operation = latest.data?.status === "running" ? latest.data : undefined;
  const inspectBackup = () => {
    setConfirmReplace(false);
    setConfirmUnvalidated(false);
    setInspection(undefined);
    inspect.mutate();
  };
  const refreshAction = <Button type="button" onClick={() => void latest.refetch()} disabled={latest.isFetching}><RotateCcw size={14} /> {latest.isFetching ? "Checking…" : "Refresh recovery status"}</Button>;

  return <div className={`local-recovery${startup ? " local-recovery--startup" : ""}`}>
    {!startup && <div className="local-recovery__callout"><CircleAlert size={18} /><div><strong>Backups contain private local Kora data</strong><p>Credentials, provider-owned data, external originals, device preferences, and regenerable previews stay out. Models and integrations may need sign-in after restore.</p></div></div>}
    <div className="local-recovery__actions">
      {!startup && <Button onClick={() => create.mutate()} disabled={create.isPending || restore.isPending}><DatabaseBackup size={14} /> {create.isPending ? "Creating backup…" : "Create local backup"}</Button>}
      <Button onClick={inspectBackup} disabled={inspect.isPending || restore.isPending}><RotateCcw size={14} /> {inspect.isPending ? "Inspecting…" : "Inspect backup"}</Button>
    </div>

    {operation && <p role="status">Recovery {operation.operationId}: {operation.phase.replace(/_/g, " ")}…</p>}
    {create.error && <div className="local-recovery__callout" role="alert"><CircleAlert size={18} /><div><strong>Backup status is unavailable</strong><p>The backup request may have reached the desktop host. Check the latest recovery status before trying again.</p><div className="local-recovery__actions">{refreshAction}</div></div></div>}
    {inspect.error && <div className="local-recovery__callout" role="alert"><CircleAlert size={18} /><div><strong>Backup status is unavailable</strong><p>The backup request may have reached the desktop host. Check the latest recovery status before trying again.</p><div className="local-recovery__actions">{refreshAction}</div></div></div>}
    {restore.error && <div className="local-recovery__callout" role="alert"><CircleAlert size={18} /><div><strong>Restore status is unavailable</strong><p>The restore request may have reached the desktop host. Check the latest recovery status before trying again.</p><div className="local-recovery__actions">{refreshAction}</div></div></div>}
    {latest.data && latest.data.status !== "running" && !create.data && !restore.data && <p role={latest.data.status === "failed" ? "alert" : "status"}>Last local recovery: {latest.data.status} · receipt {latest.data.operationId}.{latest.data.currentStatePreserved === true ? " Current state was preserved." : latest.data.currentStatePreserved === false ? " Current state preservation could not be confirmed." : ""}{latest.data.receipt?.unvalidatedCurrentStateConfirmed ? " Validated rollback was unavailable; the owner confirmed preserving raw state before restore." : ""}</p>}
    {create.data?.status === "settled" && <p className="local-recovery__success" role="status"><Check size={14} /> Backup created · receipt {create.data.operationId}</p>}
    {create.data?.status === "cancelled" && <p role="status">Backup creation cancelled · receipt {create.data.operationId}</p>}
    {inspect.data?.status === "cancelled" && <p role="status">Backup selection cancelled · receipt {inspect.data.operationId}</p>}

    {inspection && <div className="local-recovery__panel">
      <div>
        <strong>Compatible Kora backup</strong>
        <p>Created {formatDate(inspection.summary.createdAt)}. Restoring replaces the current local Kora state.</p>
        <div className="local-recovery__facts">
          <div><span>Schema</span><strong>{inspection.summary.schemaVersion}</strong></div>
          <div><span>Records</span><strong>{inspection.summary.recordCount}</strong></div>
          <div><span>Artifacts</span><strong>{inspection.summary.artifactCount}</strong></div>
          <div><span>Payload</span><strong>{formatBytes(inspection.summary.totalBytes)}</strong></div>
        </div>
        <small>Excluded: {inspection.summary.exclusions.map(exclusionLabel).join(", ")}.</small>
      </div>
      {!confirmReplace && !confirmUnvalidated && <Button tone="danger" onClick={() => setConfirmReplace(true)}>Restore this backup</Button>}
    </div>}

    {confirmReplace && <div className="local-recovery__panel" role="alert">
      <div><strong>Replace current local Kora state?</strong><p>Kora will stop the local runtime, preserve a validated safety copy of the current state, install this backup, verify it, and restart.</p></div>
      <div className="local-recovery__actions"><Button onClick={() => setConfirmReplace(false)}>Cancel</Button><Button tone="danger" loading={restore.isPending} onClick={() => restore.mutate(false)}>Replace current state</Button></div>
    </div>}

    {confirmUnvalidated && <div className="local-recovery__panel" role="alert">
      <div><strong>A validated rollback is unavailable</strong><p>The current state appears damaged. Kora can preserve its raw database, sidecars, artifacts, and recovery metadata in quarantine, but cannot promise that copy can be restored automatically.</p></div>
      <div className="local-recovery__actions"><Button onClick={() => setConfirmUnvalidated(false)}>Keep current state</Button><Button tone="danger" loading={restore.isPending} onClick={() => restore.mutate(true)}>Preserve raw state and restore</Button></div>
    </div>}

    {restore.data?.status === "settled" && <p className="local-recovery__success" role="status"><Check size={14} /> Backup restored and Kora restarted · receipt {restore.data.operationId}.{restore.data.unvalidatedCurrentStateConfirmed ? " Validated rollback was unavailable; raw state was preserved after explicit confirmation." : restore.data.validatedRollbackAvailable ? " A validated rollback copy was retained." : ""}</p>}
    {restore.data?.status === "cancelled" && <p role="status">Restore cancelled · receipt {restore.data.operationId}</p>}
    {failure && failure.code !== "validated_rollback_unavailable" && <div className="local-recovery__callout" role="alert"><CircleAlert size={18} /><div><strong>Local recovery did not settle</strong><p>{failure.message} Receipt {failure.operationId}.{failure.currentStatePreserved === true ? " Current state was preserved." : failure.currentStatePreserved === false ? " Current state preservation could not be confirmed." : ""}</p></div></div>}
    {latest.isError && <div className="local-recovery__callout" role="alert"><CircleAlert size={18} /><div><strong>Recovery status is unavailable</strong><p>Kora could not read the latest recovery status. Try refreshing it again.</p><div className="local-recovery__actions">{refreshAction}</div></div></div>}
  </div>;
}
