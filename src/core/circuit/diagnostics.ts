export type Severity = 'error' | 'warning' | 'info';

/** A problem found by static ERC or by the running simulation. */
export interface Diagnostic {
  /** Stable code for de-duplication and documentation, e.g. "short-circuit". */
  code: string;
  severity: Severity;
  message: string;
  componentIds?: string[];
  netIds?: number[];
  source: 'erc' | 'simulation' | 'toolchain';
}
