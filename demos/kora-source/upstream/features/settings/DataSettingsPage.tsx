import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bot, Check, ChevronRight, Database, ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { LocalRecoveryControls } from "../../components/LocalRecoveryControls";
import { Button } from "../../components/primitives";
import { desktopHost, hasDesktopHost } from "../../lib/desktop-host";
import { clearAllDrafts } from "../../lib/persistence";
import { ErrorState, Section } from "./shared";
import { SettingsFrame } from "./SettingsFrame";

type DraftClearState = "idle" | "confirm" | "success" | "error";

type FolderState = "idle" | "pending" | "success" | "error";

function LocalDestination({ href, icon, title, description }: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return <Link className="settings-row" to={href}>
    <span className="settings-row__mark">{icon}</span>
    <span><strong>{title}</strong><small>{description}</small></span>
    <ChevronRight size={15} aria-hidden="true" />
  </Link>;
}

export function DataSettingsPage() {
  const [draftClearState, setDraftClearState] = useState<DraftClearState>("idle");
  const [folderState, setFolderState] = useState<FolderState>("idle");
  const [folderError, setFolderError] = useState<unknown>();

  const clearDrafts = () => {
    if (draftClearState === "error") setDraftClearState("confirm");
    try {
      setDraftClearState("confirm");
      clearAllDrafts();
      setDraftClearState("success");
    } catch {
      // clearAllDrafts can remove some keys before storage throws. Keep the
      // action available and describe that the result may be partial.
      setDraftClearState("error");
    }
  };

  const openDataFolder = async () => {
    if (folderState === "pending") return;
    setFolderState("pending");
    setFolderError(undefined);
    try {
      await desktopHost.openLocation("data_root");
      setFolderState("success");
    } catch (error) {
      setFolderState("error");
      setFolderError(error);
    }
  };

  const folderAction = hasDesktopHost
    ? <Button type="button" onClick={() => void openDataFolder()} disabled={folderState === "pending"}>
      <FolderOpen size={14} aria-hidden="true" />
      {folderState === "pending" ? "Opening…" : "Open data folder"}
    </Button>
    : undefined;

  return <SettingsFrame
    title="Local data"
    description="Manage the local places Kora uses for conversations, outputs, Work, and unsent drafts."
  >
    <Section title="Stored locally" description="Kora keeps these working records on this device. Original files remain where you put them.">
      <div className="settings-ledger" aria-label="Local data destinations">
        <LocalDestination href="/kora" icon={<Bot size={16} aria-hidden="true" />} title="Manage conversations" description="Open saved conversation history." />
        <LocalDestination href="/brain/outputs" icon={<ExternalLink size={16} aria-hidden="true" />} title="Review outputs" description="Open files and artifacts Kora created." />
        <LocalDestination href="/work" icon={<Database size={16} aria-hidden="true" />} title="Manage Work" description="Open projects and work items." />
      </div>
    </Section>

    <Section title="Conversation drafts" description="Drafts stay on this computer and enter a conversation only after you send them.">
      {draftClearState === "success" && <p className="settings-success" role="status"><Check size={14} aria-hidden="true" /> All unsent conversation drafts were cleared.</p>}
      {draftClearState === "error" && <ErrorState
        title="Draft clearing did not finish."
        error={new Error("Some unsent drafts may have been cleared before local storage reported an error. Review your conversations before trying again.")}
        onRetry={clearDrafts}
        retryLabel="Try again"
      />}
      {draftClearState === "confirm"
        ? <div className="settings-inline-actions">
          <p className="settings-prose">This removes every unsent conversation draft stored on this device. Sent messages and conversation history stay unchanged.</p>
          <div className="settings-actions">
            <Button type="button" tone="primary" onClick={clearDrafts}><Trash2 size={14} aria-hidden="true" /> Clear all drafts</Button>
            <Button type="button" onClick={() => setDraftClearState("idle")}>Cancel</Button>
          </div>
        </div>
        : draftClearState !== "error" && <Button type="button" onClick={() => setDraftClearState("confirm")}><Trash2 size={14} aria-hidden="true" /> Clear all drafts</Button>}
    </Section>

    <Section title="Data folder" description="Use the desktop app when you need to inspect the local storage location.">
      {hasDesktopHost && folderState === "idle" && <p className="settings-prose">Open the folder to browse Kora’s local files.</p>}
      {!hasDesktopHost && <p className="settings-prose">Open Kora on your desktop to browse this folder. This browser view cannot access your filesystem.</p>}
      {hasDesktopHost && folderState !== "error" && <div className="settings-actions">{folderAction}</div>}
      {hasDesktopHost && folderState === "success" && <p className="settings-success" role="status"><Check size={14} aria-hidden="true" /> Data folder opened.</p>}
      {hasDesktopHost && folderState === "error" && <ErrorState title="The data folder could not be opened." error={folderError} onRetry={() => void openDataFolder()} />}
    </Section>

    <Section title="Backup and restore" description="Create a safe local backup, or inspect one before replacing the current local state.">
      <LocalRecoveryControls />
    </Section>
  </SettingsFrame>;
}

export default DataSettingsPage;
