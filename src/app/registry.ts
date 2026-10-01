/** Application-wide component registry (UI thread). */
import { ComponentRegistry } from '../core/registry/registry';
import { builtinPackage } from '../components/builtin';
import type { ComponentPackage } from '../core/model/component';

export const registry = new ComponentRegistry();
registry.registerPackage(builtinPackage);

export const lookup = (type: string) => registry.get(type);

/** Registers JSON component packages discovered on disk (desktop build). */
export function registerExternalPackages(manifests: { path: string; manifest: string }[]): string[] {
  const errors: string[] = [];
  for (const m of manifests) {
    try {
      const pkg = JSON.parse(m.manifest) as ComponentPackage;
      if (!pkg.id || !Array.isArray(pkg.components)) throw new Error('missing id/components');
      if (pkg.id === builtinPackage.id) throw new Error('reserved package id');
      registry.registerPackage(pkg);
    } catch (e) {
      errors.push(`${m.path}: ${(e as Error).message}`);
    }
  }
  return errors;
}
