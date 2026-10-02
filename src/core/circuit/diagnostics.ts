export type Severity = 'error' | 'warning' | 'info';

/** A problem found by static ERC or by the running simulation. */
export interface Diagnostic {
  /** Stable code for de-duplication and documentation, e.g. "short-circuit". */
  code: string;
  severity: Severity;
  message: string;
  /** The values in the message, so the interface can show it in another language. */
  params?: Record<string, string | number>;
  componentIds?: string[];
  netIds?: number[];
  source: 'erc' | 'simulation' | 'toolchain';
}
