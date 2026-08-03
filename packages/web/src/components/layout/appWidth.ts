/**
 * How wide the app is allowed to get.
 *
 * This is a phone app that happens to open in a desktop browser. Left
 * unconstrained it stretched to 64rem: a five-tab bar spread across a 27"
 * monitor with a thumb's worth of chrome at either end, album grids eight
 * across, and a wallet on one side of the screen with its balance on the other.
 *
 * So on a **desktop** it is one centred column. On a **tablet** it is not: an
 * iPad in either orientation is a touch device running the app full-screen, and
 * a narrow strip down the middle of a 1024px iPad is a phone emulator, not a
 * layout. That distinction is made by input, not by width — see `.app-column`
 * in `styles/app.css`, which caps the width only under
 * `(pointer: fine) and (hover: hover)`. Width alone cannot tell a landscape
 * iPad from a small laptop; the pointer can.
 *
 * The cap itself is 49.92rem (799px), set in that stylesheet — wide enough that
 * the album and weekly grids are not cramped on a monitor, narrow enough that
 * the tab bar stays a reasonable reach across.
 *
 * Every part of the frame uses **this** constant — the content, the tab bar's
 * row, and the inside of a sheet — because the failure mode is one of them
 * drifting: a tab bar wider than the screen it belongs to looks like a bug in a
 * way that a merely narrow app never does.
 */
export const APP_WIDTH = "app-column";
