import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../../components/primitives";

export class ConversationBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Kora conversation workspace failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section className="conversation-route-error" role="alert">
      <AlertTriangle size={22} />
      <div><strong>The conversation view needs to reopen.</strong><p>Your conversation remains in Kora's native runtime.</p></div>
      <Button tone="primary" onClick={() => window.location.reload()}>Reopen conversation</Button>
    </section>;
  }
}
