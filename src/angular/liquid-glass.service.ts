import { Injectable } from '@angular/core'
import type { GlassComponentData } from '../core/types'

let nextId = 0

/** Generate a unique ID for Angular components (replaces React's useId). */
export function generateGlassId(): string {
  return `lg-${nextId++}`
}

/**
 * Registry service for Liquid Glass components.
 * Provided per-container (not root), so each <liquid-glass-container>
 * has its own isolated registry — mirroring how each React
 * <LiquidGlassProvider> creates its own context.
 */
@Injectable()
export class LiquidGlassService {
  private registry = new Map<string, () => GlassComponentData>()

  register(id: string, getData: () => GlassComponentData): void {
    this.registry.set(id, getData)
  }

  unregister(id: string): void {
    this.registry.delete(id)
  }

  getAllComponentData(): GlassComponentData[] {
    const data: GlassComponentData[] = []
    for (const getData of this.registry.values()) {
      data.push(getData())
    }
    return data
  }
}
