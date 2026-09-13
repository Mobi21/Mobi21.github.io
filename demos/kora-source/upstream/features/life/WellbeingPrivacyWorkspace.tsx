import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  ArchiveRestore,
  Check,
  Database,
  FileClock,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, PageHeader } from "../../components/primitives";
import { runtime, type WellbeingPrivacyOverview } from "../../lib/runtime";
import { WellbeingFrame } from "./WellbeingNavigation";
import "./wellbeing-privacy.css";

export type WellbeingPrivacyLoaders = {
  read: () => Promise<WellbeingPrivacyOverview>;
};

const defaultLoaders: WellbeingPrivacyLoaders = {
  read: runtime.wellbeingPrivacy,
};

function PrivacyLoading() {
  return (
    <div className="wellbeing-privacy__loading" aria-busy="true">
      <span className="sr-only" role="status">Loading Wellbeing privacy boundaries</span>
      <div className="wellbeing-privacy__loading-statement" aria-hidden="true" />
      <div className="wellbeing-privacy__loading-groups" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => <section className="wellbeing-privacy__loading-group" key={index}>
          <span className="wellbeing-privacy__loading-title" />
          <span className="wellbeing-privacy__loading-description" />
          <div className="wellbeing-privacy__loading-lines"><i /><i /></div>
        </section>)}
      </div>
    </div>
  );
}

function PrivacyUnavailable({ retry }: { retry: () => void }) {
  return (
    <section className="wellbeing-privacy__unavailable" role="alert" aria-labelledby="privacy-unavailable-title">
      <TriangleAlert size={20} aria-hidden="true" />
      <div>
        <h2 id="privacy-unavailable-title">Privacy details could not be loaded</h2>
        <p>Your existing permissions still apply. Try again to reload this explanation.</p>
      </div>
      <Button onClick={retry}>Try again</Button>
    </section>
  );
}

function SavedRecords({ policy, longCopy = false }: { policy: WellbeingPrivacyOverview; longCopy?: boolean }) {
  const localStorage = policy.policy.storageAuthority === "local_sqlite";
  return (
    <section className="wellbeing-privacy__group" aria-labelledby="privacy-saved-title">
      <header>
        <span className="wellbeing-privacy__group-icon"><Database size={18} aria-hidden="true" /></span>
        <div><h2 id="privacy-saved-title">Saved on this device</h2><p>{localStorage ? "Your records and their source details are stored on this device." : "Your records and their source details stay with the storage provided for this account."}</p></div>
      </header>
      <div className="wellbeing-privacy__group-body">
        <p>{longCopy ? "Records added manually or saved from a provider or import remain here with the source details needed to identify them." : "Records added manually or saved from a provider or import remain here with their source details."}</p>
        <p className="wellbeing-privacy__supporting-copy">Provider credentials stay with the provider connection and are not copied into these records.</p>
      </div>
    </section>
  );
}

function UseWithKora({ policy }: { policy: WellbeingPrivacyOverview }) {
  const privateRecordsPermitted = policy.ordinaryUse.permittedPrivateRecords === "wellbeing_workspace";
  const restrictedOmitted = policy.ordinaryUse.restrictedRecords === "omitted" && policy.ordinaryUse.restrictedCounts === "omitted";
  const exactBinding = policy.exactRestrictedAccess.enforcement === "record_version_purpose_request_expiry";
  const contextAttachment = policy.exactRestrictedAccess.permittedPurpose === "kora_context_attachment";
  return (
    <section className="wellbeing-privacy__group wellbeing-privacy__group--use" aria-labelledby="privacy-use-title">
      <header>
        <span className="wellbeing-privacy__group-icon"><MessageSquareText size={18} aria-hidden="true" /></span>
        <div><h2 id="privacy-use-title">Use with Kora and permissions</h2><p>{privateRecordsPermitted ? "Private records are visible in Wellbeing. Conversation use follows your personal-information permissions." : "Private records follow the permissions supplied for this account."}</p></div>
      </header>
      <div className="wellbeing-privacy__group-body">
        <div className="wellbeing-privacy__classification">
          <article>
            <span className="wellbeing-privacy__classification-icon" data-tone="private"><ShieldCheck size={18} aria-hidden="true" /></span>
            <div><h3>Private <small>(Default)</small></h3><p>{privateRecordsPermitted ? "Visible in Wellbeing. Use in a conversation follows your personal-information permissions." : "Available only where the supplied permissions allow it."}</p></div>
          </article>
          <article>
            <span className="wellbeing-privacy__classification-icon" data-tone="restricted"><LockKeyhole size={18} aria-hidden="true" /></span>
            <div><h3>Restricted</h3><p>{restrictedOmitted ? "Hidden from ordinary views, searches, and summaries, including titles and counts." : "Restricted records follow the permissions supplied for this account."}</p></div>
          </article>
        </div>
        <details className="wellbeing-privacy__details">
          <summary><KeyRound size={16} aria-hidden="true" />How temporary access works</summary>
          <div className="wellbeing-privacy__exact-boundary" role="note">
            <div>
              <h3>Temporary access is narrow</h3>
              <p>{exactBinding ? "Approval applies to one specific record and version, for the named purpose and request, and expires. Permission to read does not allow changes, and a link does not grant access." : "Any temporary access follows the permissions supplied for this account. Permission to read does not allow changes."}</p>
              <p>{contextAttachment ? "Attaching an eligible Restricted record to a Kora conversation requires specific approval." : "This account does not expose a supported temporary access purpose here."}</p>
              <span>This page cannot open Restricted records or grant that approval.</span>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

function ManageRecover({ policy }: { policy: WellbeingPrivacyOverview }) {
  const recordControls = policy.controls.recordCorrection === "records" || policy.controls.archiveRestore === "records" || policy.controls.exactDeletion === "records";
  return (
    <section className="wellbeing-privacy__group" aria-labelledby="privacy-manage-title">
      <header>
        <span className="wellbeing-privacy__group-icon"><ArchiveRestore size={18} aria-hidden="true" /></span>
        <div><h2 id="privacy-manage-title">Manage and recover records</h2><p>{recordControls ? "Edit a record or change its privacy in Records." : "Record management follows the permissions supplied for this account."}</p></div>
      </header>
      <div className="wellbeing-privacy__group-body">
        <div className="wellbeing-privacy__control-rows">
          <div>
            <ArchiveRestore size={18} aria-hidden="true" />
            <span><strong>Archive is reversible</strong><small>It removes a record from active views and lets you restore it later from the archive.</small></span>
          </div>
          <div className="wellbeing-privacy__danger-control">
            <Trash2 size={18} aria-hidden="true" />
            <span><strong>Deletion is permanent</strong><small>Review the selected record and confirm before deleting it. If deletion cannot finish, Records explains the result and next step.</small></span>
          </div>
        </div>
        <Link className="button button--secondary" to="/life/wellbeing/records">Manage records</Link>
        <details className="wellbeing-privacy__details">
          <summary><FileClock size={16} aria-hidden="true" />Details about limits</summary>
          <p>Privacy settings are changed on each record; category-wide settings and privacy history are not available here.</p>
          <dl className="wellbeing-privacy__authority-list">
            <div><dt><Check size={15} aria-hidden="true" />Record privacy</dt><dd>{policy.controls.recordCorrection === "records" ? "Choose Private or Restricted when adding or editing a record in Records." : "Record privacy changes are unavailable here."}</dd></div>
            <div><dt><FileClock size={15} aria-hidden="true" />Privacy activity</dt><dd>No Wellbeing privacy history is available here.</dd></div>
            <div><dt><KeyRound size={15} aria-hidden="true" />Category-wide settings</dt><dd>Category-wide privacy settings are not available here.</dd></div>
          </dl>
        </details>
      </div>
    </section>
  );
}

export function WellbeingPrivacyWorkspace({
  loaders = defaultLoaders,
  longCopy = false,
}: {
  loaders?: WellbeingPrivacyLoaders;
  longCopy?: boolean;
}) {
  const overview = useQuery({
    queryKey: ["wellbeing", "privacy"],
    queryFn: loaders.read,
    retry: false,
  });
  const recoveredStatementRef = useRef<HTMLDivElement>(null);
  const hadReadErrorRef = useRef(false);
  useEffect(() => {
    if (overview.isError) {
      hadReadErrorRef.current = true;
      return;
    }
    if (overview.data && hadReadErrorRef.current) {
      hadReadErrorRef.current = false;
      recoveredStatementRef.current?.focus();
    }
  }, [overview.data, overview.isError]);
  const policy = overview.data;
  return (
    <section className="wellbeing-privacy-workspace">
      <WellbeingFrame>
        <PageHeader
          title="Privacy"
          description="See where your Wellbeing records are stored, how they are used, and where to manage them."
          status={<><span>Private by default · Privacy</span>{policy ? <><span aria-hidden="true">·</span><span>Read-only guidance</span></> : null}</>}
        />
        {overview.isLoading ? <PrivacyLoading /> : overview.isError || !policy ? (
          <PrivacyUnavailable retry={() => overview.refetch()} />
        ) : (
          <div className="wellbeing-privacy__content">
            <div className="wellbeing-privacy__statement" ref={recoveredStatementRef} tabIndex={-1}>
              <ShieldCheck size={23} aria-hidden="true" />
              <div>
                <h2>Your Wellbeing records are private by default.</h2>
                <p>Restricted records stay outside ordinary views and Kora context unless temporary permission allows a specific use.</p>
              </div>
            </div>
            <div className="wellbeing-privacy__groups">
              <SavedRecords policy={policy} longCopy={longCopy} />
              <UseWithKora policy={policy} />
              <ManageRecover policy={policy} />
            </div>
          </div>
        )}
      </WellbeingFrame>
    </section>
  );
}
