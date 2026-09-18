import React from "react";

interface ErrorBoundaryState { error: Error | null }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[web] React render error", error, info.componentStack);
  }
  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return <main className="startup-error"><h1>Não foi possível carregar o sistema</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>Tentar novamente</button></main>;
  }
}
