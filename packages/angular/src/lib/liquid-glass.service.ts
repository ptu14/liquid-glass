import { Injectable } from '@angular/core'
import {
  createGlassId,
  type GlassComponentData,
  type LiquidGlassHost,
} from '@daniluk/liquid-glass'

/** Generate a unique ID for Angular components (replaces React's useId). */
export const generateGlassId = createGlassId

/**
 * Registry service for Liquid Glass components.
 * Provided per-container (not root), so each <liquid-glass-container>
 * has its own isolated registry — mirroring how each React
 * <LiquidGlassProvider> creates its own context.
 */
@Injectable()
export class LiquidGlassService {
  private registry = new Map<string, () => GlassComponentData>()
  private host: LiquidGlassHost | null = null

  register(id: string, getData: () => GlassComponentData): void {
    this.registry.set(id, getData)
    this.host?.register(id, getData)
  }

  unregister(id: string): void {
    this.registry.delete(id)
    this.host?.unregister(id)
  }

  getAllComponentData(): GlassComponentData[] {
    return [...this.registry.values()].map((getData) => getData())
  }

  /** Request an immediate background recapture (e.g. during CSS transitions). */
  requestCapture(): void {
    this.host?.background.capture()
  }

  /** @internal Called by the container once its host exists (or is destroyed). */
  attach(host: LiquidGlassHost | null): void {
    this.host = host
    if (host) for (const [id, getData] of this.registry) host.register(id, getData)
  }
}
