import { Component, type ReactNode } from "react";
import { ErrorState } from "./ui";

/**
 * The last line of defence against a genuinely blank screen.
 *
 * React unmounts the **entire tree** when a render throws — one malformed date,
 * one `undefined.map` — and what is left is a white page with the reason only
 * in a console the user will never open. Nothing else in the app catches this:
 * a `try/catch` cannot, and an error hook does not exist. A class component is
 * still the only way, which is why this one file is written in an idiom found
 * nowhere else in the codebase.
 *
 * It is mounted **inside** `AppShell`, not around it, so the tab bar survives
 * the crash and the user can leave the broken screen under their own steam.
 */
interface Props {
  children: ReactNode;
  /** Injected in tests; the default reports to the console. */
  onError?: (error: unknown) => void;
}

interface State {
  error: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    // There is no telemetry in a single-user app, and swallowing it silently
    // would make the one screenshot a user can send us worthless.
    (this.props.onError ?? ((e: unknown) => console.error("Screen crashed:", e)))(error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <ErrorState
        title="This screen broke"
        // The copy is written here rather than inferred from the caught error:
        // a render crash is a bug, never an offline blip, and nothing the user
        // did caused it. Retrying is genuinely worth one attempt — the state
        // that triggered it may have moved on.
        description="Something went wrong drawing this screen. Your data is untouched — try again, or move to another tab."
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}
