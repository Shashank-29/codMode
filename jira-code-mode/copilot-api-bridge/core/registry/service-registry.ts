/**
 * Service Registry — manages all registered service adapters.
 *
 * Adapters are registered at startup. The MCP tool factory
 * iterates over registered adapters to create tools.
 */
import { ServiceAdapter } from './types.js';

class ServiceRegistryImpl {
  private adapters = new Map<string, ServiceAdapter>();

  /** Register a service adapter. Throws if name is already taken. */
  register(adapter: ServiceAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(
        `Service "${adapter.name}" is already registered. Each service must have a unique name.`
      );
    }
    this.adapters.set(adapter.name, adapter);
    console.log(`[Registry] Registered service: ${adapter.name}`);
  }

  /** Get an adapter by name. Returns undefined if not found. */
  get(name: string): ServiceAdapter | undefined {
    return this.adapters.get(name);
  }

  /** List all registered adapters. */
  list(): ServiceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Get count of registered services. */
  get size(): number {
    return this.adapters.size;
  }
}

/** Singleton service registry instance. */
export const ServiceRegistry = new ServiceRegistryImpl();
