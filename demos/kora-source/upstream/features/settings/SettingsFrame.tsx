import { ChevronRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Badge, Item, PageFrame, PageHeader, PageSection, type BadgeTone, type PageFrameWidth } from "../../components/primitives";
import "./settings-frame.css";

export function SettingsFrame({ title, description, breadcrumb, status, actions, width = "standard", children }: {
  title: string;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  width?: PageFrameWidth;
  children: ReactNode;
}) {
  return <div className="k-settings-frame">
    <PageFrame width={width}>
      <PageHeader
        breadcrumb={breadcrumb}
        title={title}
        description={description}
        status={status}
        actions={actions}
      />
      {children}
    </PageFrame>
  </div>;
}

export function SettingsSection({ title, description, actions, children, layout = "stack" }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; layout?: "stack" | "split" }) {
  return <PageSection className="k-settings-section" title={title} description={description} actions={actions} layout={layout}>{children}</PageSection>;
}

export function SettingsListRow({ href, icon, title, description, qualification, state, stateTone = "quiet", actionLabel }: {
  href: string;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  qualification?: ReactNode;
  state: string;
  stateTone?: BadgeTone;
  actionLabel: string;
}) {
  return <Item kind="link" href={href} title={title} leading={icon}
    description={<>{description}{qualification ? <span> · {qualification}</span> : null}</>}
    trailing={<><Badge tone={stateTone} dot>{state}</Badge><span>{actionLabel}</span><ChevronRight size={15} aria-hidden="true" /></>}
  />;
}

/** A preference keeps its explanation beside the control it describes. */
export function SettingsPreference({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const headingId = useId();
  return <section className="settings-preference" aria-labelledby={headingId}>
    <div className="settings-preference__identity"><h2 id={headingId}>{title}</h2><p>{description}</p></div>
    <div className="settings-preference__control">{children}</div>
  </section>;
}
