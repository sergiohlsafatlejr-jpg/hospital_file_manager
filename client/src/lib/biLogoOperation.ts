export type BiLogoOperationKind =
  | "palette"
  | "upload"
  | "apply"
  | "save"
  | "reset";

export interface BiLogoOperationToken {
  readonly generation: number;
  readonly scope: number;
  readonly logo: string | null;
  readonly kind: BiLogoOperationKind;
  readonly signal: AbortSignal;
}

/** One owner per dialog; even requests for the same scope/logo get a new generation. */
export function createBiLogoOperationOwner() {
  let generation = 0;
  let active: BiLogoOperationToken | null = null;
  let controller: AbortController | null = null;

  const invalidate = () => {
    generation += 1;
    active = null;
    controller?.abort();
    controller = null;
  };

  return {
    invalidate,
    begin(scope: number, logo: string | null, kind: BiLogoOperationKind) {
      invalidate();
      controller = new AbortController();
      active = { generation, scope, logo, kind, signal: controller.signal };
      return active;
    },
    isCurrent(token: BiLogoOperationToken) {
      return (
        active === token &&
        token.generation === generation &&
        !token.signal.aborted
      );
    },
    finish(token: BiLogoOperationToken) {
      if (active !== token || token.signal.aborted) return false;
      active = null;
      controller = null;
      return true;
    },
    get kind() {
      return active?.kind ?? null;
    },
  };
}

/**
 * Stop awaiting invalidated work without changing the extraction algorithm.
 * The underlying browser promise may finish later; both outcomes remain handled.
 */
export function awaitBiLogoOperation<T>(
  promise: Promise<T>,
  token: BiLogoOperationToken
): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () =>
      reject(new DOMException("Operação de logo cancelada.", "AbortError"));
    if (token.signal.aborted) {
      // Attach a rejection handler even when cancellation precedes this call.
      void promise.catch(() => undefined);
      aborted();
      return;
    }
    token.signal.addEventListener("abort", aborted, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => token.signal.removeEventListener("abort", aborted));
  });
}
