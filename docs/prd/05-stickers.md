## Stickers

1. Inside an **unlocked** album, stickers can be acquired either directly, by clicking an empty placeholder, or through a random purchase.
2. Locked stickers are displayed in black and white. A button beneath the sticker displays its purchase price. **Unless the album hides its locked slots** (§Albums, "Hide locked images"), in which case each one is a **sealed envelope for its tier** — the design's artwork, with its own frame, the rarity name across the top and a LOCKED badge — and the sticker's image is never requested at all, so the surprise is not in the network tab either. An album that also supplies its own stand-in shows that instead: an authored decision about one album outranks the generic pack.
3. Unlocked stickers are displayed in color.
4. Duplicate stickers are indicated by a quantity number in the upper-left corner.
5. A duplicate obtained from a random purchase may be sold for half the album's random-sticker price.
6. **Random purchase is disabled once the album is complete**, and whenever no unowned sticker is reachable by the roll.

**Enhancements (MVP)**

- **The reveal.** A random pull shakes open the tier's envelope — the *same* file the locked slot wears, so the pack you have been looking at is the pack that opens — and the sticker rises out of it in colour, held a beat longer for higher tiers. This is the app's single most rewarding moment; it earns real attention.
- **Duplicate, then decide.** A duplicate surfaces its "sell for X" action inline, so a pull that returns a dupe still ends in a choice rather than a dead end.
- **The sticker viewer.** Tapping a collected sticker opens it full-size with its title and description. Swiping — or the arrow keys — moves through the **collected** stickers only, without closing, and the next one **slides in from the side the last one left towards**, so "back" never feels like "next". A locked slot has nothing to show: its art is the thing being earned.
- **Saving a sticker to the device.** The viewer offers a download icon (no label — the glyph is the whole control, with an accessible name behind it). On a device that can share files it opens the share sheet, which is the only route to an iOS camera roll; everywhere else it downloads, named after the sticker's title rather than its content address.
- **Missing-only view.** A toggle inside an album that dims owned slots and highlights what's left. It turns "what do I still need" into a glance.

**Rarity**

1. Every sticker carries a rarity tier: common, rare, epic, legendary.
2. Rarity is assigned by the user at album creation and frozen by the seal.
3. Rarity is visible on the album grid **before the sticker is owned**. The empty placeholder's border communicates the tier — plain for common, increasingly ornate up to legendary. Locked or unlocked, the user always knows which slot holds the legendary.
4. Rarity determines two things: the price of the sticker, and its odds in a random pull.
5. Both are properties of the album, not of the sticker. A common sticker is cheap *in this album*.

**Random purchase**

1. A random purchase costs the album's random-sticker price, regardless of what it returns.
2. The roll happens in two stages: first a tier is chosen according to the album's drop odds, then a sticker is chosen uniformly at random from every sticker in that tier — owned or not.
3. Owned stickers are therefore eligible. A repeat pull is a duplicate, and duplicates are the price of gambling.
4. A tier containing no stickers is excluded from the roll, and its odds are redistributed proportionally across the remaining tiers.
5. A tier may be given zero odds. Its stickers then exist but can never be pulled — they can only be bought directly. This is permitted, and warned about at seal.
6. **Random purchase is disabled whenever no unowned sticker is reachable by the roll** — that is, when every remaining sticker sits in a tier with zero odds, or when the album is complete. Otherwise the user would be paying for guaranteed duplicates. (The completed-album rule is a special case of this.)
7. Direct purchase always remains available. It is the user's protection against bad luck: when only one sticker is missing, buying it outright is cheaper than pulling for it.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*

**The reveal**

A pull arrives in a pack that shakes, opens, and lets the sticker out. **How
much show a tier gets is the point**: a common is a shake and a card; a rare
adds a ring; an epic adds a bloom; a legendary shakes harder, gets both, and
keeps shining while you look at it. If they arrived the same way, rarity would
be a label rather than a feeling.

Nothing dismisses itself. The sticker is held until the user taps it — the
reward is the looking — and the buttons stay hidden until it is out, so there is
nothing to dismiss a reveal that has not happened yet. A duplicate still ends in
a choice: "sell for X" sits beside the sticker.

Tapping answers *where did that go?*. The album clears its filter if one is
hiding the new sticker, scrolls that slot to the middle of the screen, and
settles it into place. Clearing the filter is not a courtesy: with "Locked" on,
the sticker that was just earned is no longer in the grid at all.

Every part of this is an **enhancement over a working result**. Reduced motion —
or any environment that does not answer the motion query — still gets the
sticker, still gets the scroll, and still gets a way out.

**Buying one outright**

A direct purchase is not a surprise — you chose that sticker — so there is no
pack. The slot celebrates **in place**, with the grid still on screen: the art
floods into colour as its filter lifts, and the tier's own flourishes fire
around it.

The rarity ladder is the same table the pack uses (`lib/rarity.ts`): a common
gets the flood and nothing else, a rare adds a ring, an epic a bloom, and a
legendary keeps shining. "What does a legendary get that a common does not" has
to be one answer across both paths, or rarity stops meaning anything consistent.

Only the tiers that earn a flourish carry the nodes for it — a grid is mostly
commons, and dead nodes in every one of them is a cost paid on every render for
an effect that never fires.
