## Stickers

1. Inside an **unlocked** album, stickers can be acquired either directly, by clicking an empty placeholder, or through a random purchase.
2. Locked stickers are displayed in black and white. A button beneath the sticker displays its purchase price.
3. Unlocked stickers are displayed in color.
4. Duplicate stickers are indicated by a quantity number in the upper-left corner.
5. A duplicate obtained from a random purchase may be sold for half the album's random-sticker price.
6. **Random purchase is disabled once the album is complete**, and whenever no unowned sticker is reachable by the roll.

**Enhancements (MVP)**

- **The reveal.** A random pull animates the black-and-white slot flooding into color, held a beat longer for higher tiers. This is the app's single most rewarding moment; it earns real attention.
- **Duplicate, then decide.** A duplicate surfaces its "sell for X" action inline, so a pull that returns a dupe still ends in a choice rather than a dead end.
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
