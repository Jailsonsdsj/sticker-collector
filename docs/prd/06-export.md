## Export for print

Exporting an album is the reward for completing it. Incomplete albums cannot be exported. The export may be run any number of times, for as long as the album exists.

The artifact is a **single PDF**, generated client-side in the browser. No server is involved.

1. **Paper** — A4 by default, US Letter as an option.
2. **Page 1** — the cover, printed at its native 150 × 210 mm, centered. The album title and its completion date appear beneath it.
3. **Pages 2…N** — the stickers, in stored `slot_index` order, laid out three across and three down at 50 × 70 mm, with 12 mm gutters. Nine stickers per page.
4. Each sticker is printed inside its **rarity frame**. The frame is part of the album, not a screen affordance.
5. A 0.25 pt cut guide is drawn on each sticker's trim edge. There is no bleed.
6. A footer carries the album title and *page N of M*.
7. Images are embedded at native resolution, so the sheet prints at a true 300 dpi.
8. File name: `sticker-collector-{album-slug}-{yyyy-mm-dd}.pdf`

Note: this is distinct from *Services → import and export the application's data*, which is a backup file and is always available.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*
