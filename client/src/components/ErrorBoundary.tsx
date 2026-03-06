import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** If true, silently recover from known benign errors (like removeChild) */
  silentRecovery?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recoveryAttempts: number;
}

/**
 * Known benign DOM errors that can be safely recovered from.
 * These typically occur when:
 * - Browser extensions (Google Translate, Grammarly) modify the DOM
 * - React tries to remove/update nodes that were already modified externally
 * - Race conditions during fast re-renders with Suspense/lazy loading
 */
const BENIGN_ERROR_PATTERNS = [
  "Failed to execute 'removeChild' on 'Node'",
  "Failed to execute 'insertBefore' on 'Node'",
  "Failed to execute 'appendChild' on 'Node'",
  "The node to be removed is not a child of this node",
  "NotFoundError",
];

function isBenignDOMError(error: Error): boolean {
  const message = error.message || "";
  const name = error.name || "";
  return BENIGN_ERROR_PATTERNS.some(
    (pattern) => message.includes(pattern) || name.includes(pattern)
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, recoveryAttempts: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // For benign DOM errors, try to recover silently
    if (isBenignDOMError(error)) {
      console.warn(
        "[ErrorBoundary] Benign DOM error intercepted (likely browser extension conflict):",
        error.message
      );
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isBenignDOMError(error)) {
      console.warn(
        "[ErrorBoundary] Recovered from benign DOM error:",
        error.message
      );
      // If we keep getting the same error, increment recovery attempts
      this.setState((prev) => {
        const newAttempts = prev.recoveryAttempts + 1;
        // After 3 recovery attempts, show the error to prevent infinite loops
        if (newAttempts >= 3) {
          return { hasError: true, error, recoveryAttempts: newAttempts };
        }
        return { hasError: false, error: null, recoveryAttempts: newAttempts };
      });
      return;
    }

    // Log non-benign errors
    console.error("[ErrorBoundary] Unrecoverable error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, recoveryAttempts: 0 });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2 text-foreground">
              Ocorreu um erro inesperado
            </h2>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Isso pode ter sido causado por uma extensão do navegador (como
              tradutor automático). Tente desativar extensões e recarregar a
              página.
            </p>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.message || "Erro desconhecido"}
              </pre>
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-secondary text-secondary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <RotateCcw size={16} />
                Tentar Novamente
              </button>
              <button
                onClick={this.handleReload}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <RotateCcw size={16} />
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
