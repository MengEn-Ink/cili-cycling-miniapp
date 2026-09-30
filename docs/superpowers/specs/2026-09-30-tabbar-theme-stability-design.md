# Tabbar Theme Stability Design

## Context

The native tabbar already uses the CILI dark palette, and the three tab page roots render dark after their page styles load. The global app window and `page` surface still default to the old light palette. During cold start, tab switches, weak-network loading, and foreground restoration, WeChat can paint that global surface before page-specific styles, exposing a white flash or a white strip around the bottom safe area.

## Options considered

1. **Make the native shell dark from first paint (selected).** Keep the native tabbar, set the global window, page surface, pull-down regions, tabbar, and every tab root to the same `#0b0b0c` base. This fixes the earliest paint without runtime calls or a custom navigation layer.
2. **Set colors from page lifecycle code.** Calling platform APIs from `onLoad`/`onShow` is too late to prevent first-frame white and adds more asynchronous state.
3. **Replace the native tabbar.** A custom tabbar can control every pixel but increases accessibility, safe-area, routing, and lifecycle risk without solving a need that static configuration already covers.

## Approved direction

- Preserve the native three-tab navigation and existing icon assets.
- Use CILI black `#0b0b0c` for global page/window, top and bottom system backgrounds, native tabbar, and all three tab root surfaces.
- Use silver `#a8a8ad` for inactive tab text and race orange `#d55b1f` for the selected state; keep the native border black.
- Keep each tab root at least viewport height and preserve both `constant()` and `env()` safe-area fallbacks.
- Do not introduce lifecycle-time color APIs, page transition animation, or custom tabbar markup.
- Keep content surfaces charcoal and text silver/white through existing page-local styles; this change only removes the light shell beneath them.

## Verification

- Static contracts must assert the global window colors, global page background, native tabbar palette, three tab page JSON fallbacks, root viewport coverage, and both safe-area syntaxes.
- Existing lifecycle tests continue to cover retained data during `onShow` refresh; the dark shell must be present independently of request completion.
- Device acceptance remains required for cold start, repeated switching across all three tabs, background/foreground restoration, weak-network loading, iPhone safe area, and Android navigation-area behavior.
