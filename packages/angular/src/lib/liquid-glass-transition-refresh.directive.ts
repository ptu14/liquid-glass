import { Directive } from '@angular/core'

/**
 * Marker directive for "live" elements inside the container's `bgElement`.
 * Their CSS hover / focus effects and transforms show up under the glass in
 * real time: the element is cut out of the main background snapshot, gets
 * its own snapshot (refreshed on hover/focus changes and while non-transform
 * transitions run) and is drawn every frame with its current transform.
 * Assumes the default `transform-origin: center`.
 *
 * The directive itself does no work — its attribute (`lgtransitionrefresh`
 * in the DOM) is what the background capture looks for. Equivalent to
 * `data-lg-live` (`LIVE_ATTR`).
 *
 * Usage:
 * ```html
 * <div class="movie-card" lgTransitionRefresh>
 *   <img src="poster.jpg" />
 * </div>
 * ```
 */
@Directive({
  selector: '[lgTransitionRefresh]',
  standalone: true,
})
export class LiquidGlassTransitionRefreshDirective {}
