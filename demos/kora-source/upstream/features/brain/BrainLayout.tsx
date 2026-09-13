import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { CanvasPageHeader } from "../../app/ViewBar";
import { WorkspaceNavigation } from "../../app/WorkspaceNavigation";
import { PageFrame } from "../../components/primitives";
import { searchReturnPath, readBrainOrigin, withBrainOrigin } from "./brain-navigation";
import "./brain.css";

export function BrainLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Collection routes contribute their title/actions through useViewBar and
  // are rendered here as the one canvas header. People and Created render an
  // explicit PageHeader because their feature layouts own that composition.
  const routeOwnsHeader = /^\/brain\/(people|restricted|outputs)(?:\/|$)/.test(location.pathname);
  const brainOrigin = readBrainOrigin(location.state);
  const showReturn = Boolean(brainOrigin && location.pathname !== "/brain" && location.pathname.startsWith("/brain/"));
  const returnTo = brainOrigin?.kind === "search" ? searchReturnPath(brainOrigin.snapshot) : "/brain";

  return (
    <section className="brain-workspace">
      <PageFrame
        className="brain-page-frame"
        width="fill"
        scroll="internal"
        sidebar={<WorkspaceNavigation workspacePath="/brain" />}
        sidebarLabel="Brain"
      >
        <div className="brain-stage">
          {showReturn && brainOrigin && <div className="brain-return-bar">
            <Link
              className="brain-return-bar__link"
              to={returnTo}
              state={withBrainOrigin(location.state, brainOrigin)}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {brainOrigin.kind === "search" ? "Back to Search" : "Back to Brain"}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>}
          {!routeOwnsHeader && <CanvasPageHeader className="brain-canvas-page-header" />}
          {children}
        </div>
      </PageFrame>
    </section>
  );
}
