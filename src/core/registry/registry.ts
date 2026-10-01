import type { ComponentDefinition, ComponentPackage } from '../model/component';
import { validateDefinition } from './validate';

export interface CategoryNode {
  name: string;
  subcategories: Map<string, ComponentDefinition[]>;
  count: number;
}

/**
 * Holds every registered component definition. Packages can be added at
 * runtime (built-in library, user packages discovered on disk).
 */
export class ComponentRegistry {
  private defs = new Map<string, ComponentDefinition>();
  private packages = new Map<string, ComponentPackage>();
  private listeners = new Set<() => void>();
  readonly problems: string[] = [];

  registerPackage(pkg: ComponentPackage): void {
    this.packages.set(pkg.id, pkg);
    for (const def of pkg.components) {
      const errors = validateDefinition(def);
      if (errors.length) {
        this.problems.push(`${pkg.id}/${def.type}: ${errors.join('; ')}`);
        continue;
      }
      this.defs.set(def.type, { ...def, packageId: pkg.id });
    }
    this.emit();
  }

  get(type: string): ComponentDefinition | undefined {
    return this.defs.get(type);
  }

  require(type: string): ComponentDefinition {
    const d = this.defs.get(type);
    if (!d) throw new Error(`Unknown component type "${type}"`);
    return d;
  }

  all(): ComponentDefinition[] {
    return [...this.defs.values()];
  }

  listPackages(): ComponentPackage[] {
    return [...this.packages.values()];
  }

  categories(): CategoryNode[] {
    const byCat = new Map<string, CategoryNode>();
    for (const d of this.defs.values()) {
      let node = byCat.get(d.category);
      if (!node) {
        node = { name: d.category, subcategories: new Map(), count: 0 };
        byCat.set(d.category, node);
      }
      const sub = d.subcategory ?? 'General';
      if (!node.subcategories.has(sub)) node.subcategories.set(sub, []);
      node.subcategories.get(sub)!.push(d);
      node.count++;
    }
    return [...byCat.values()];
  }

  /** Ranked fuzzy-ish search over name, type, tags, category and description. */
  search(query: string): ComponentDefinition[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return this.all();
    const scored: [number, ComponentDefinition][] = [];
    for (const d of this.defs.values()) {
      const name = d.name.toLowerCase();
      const hay = [d.name, d.type, d.category, d.subcategory ?? '', ...(d.tags ?? []), d.docs.summary]
        .join(' ')
        .toLowerCase();
      let score = 0;
      let ok = true;
      for (const t of terms) {
        if (name.startsWith(t)) score += 10;
        else if (name.includes(t)) score += 6;
        else if (d.tags?.some((tag) => tag.toLowerCase().startsWith(t))) score += 4;
        else if (hay.includes(t)) score += 1;
        else {
          ok = false;
          break;
        }
      }
      if (ok) scored.push([score, d]);
    }
    return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).map((s) => s[1]);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}
