# UI Sync Evidence: Official Route + GPX

- Source baseline: `54ac489933fd0cf4ac8d7170272b88e601d92634`
- Capture date: 2026-10-13
- WeChat DevTools screenshots: `726 x 1570` pixels
- Pages screenshots: real `375 x 812` CSS viewport at device scale 1
- Mini program: WeChat DevTools with `miniprogram-automator@0.12.1`
- Pages prototype: Playwright Core driving local Google Chrome against `docs/`

The seven paired routes cover activity editing, activity details, the official
route fallback, profile, personal card, review list, and review detail.
DevTools uses local compiled WXML/WXSS with sanitized visual-state fixtures; it
does not call undeployed GPX write APIs. `devtools-results.json` records all
seven page paths, empty page errors, and zero runtime exceptions.

`pages-results.json` records a true `375 x 812` viewport for every route, no
document or phone-screen horizontal overflow, and zero console/page errors.
The activity detail contains 12 visible elevation bars and a route visual. The
official-route failure action was exercised and exposed “路线暂时无法显示” with
copy and return actions.

The DevTools screenshot compositor offsets Canvas layers while a page is
scrolled, which is visible in the two route screenshots. Canvas behavior is
covered by route-outline/elevation unit tests, and the matching Pages images
show the intended nonblank framing. Physical iOS/Android Canvas verification
remains a P0 acceptance item and is not claimed by this evidence.

These files prove local visual synchronization only. They do not prove
CloudBase deployment, GPX runtime persistence/download, production Pages
deployment, or physical-device acceptance.
