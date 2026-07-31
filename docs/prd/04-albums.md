## Albums

1. There must be a tab dedicated to listing albums.
2. All albums live in a **single section**. There is no store. Locked and unlocked albums are displayed together.
3. Status — **locked**, **in progress**, **completed** — is available both as a filter and as a sort classification. (Sorting only reorders; filtering shows and hides albums.)
4. Albums are displayed in a grid, both locked and unlocked. New albums can be added via a **Create album** button.
5. Clicking an album — locked or unlocked — must allow the user to view its stickers, both locked and unlocked. Browsing a locked album is permitted; **buying inside one is not.**
6. Each album must display its cover, and directly beneath it a button or text spanning the full width of the album. The status of each album is described below.

**Enhancements (MVP)**

- **"Almost there" surfacing.** The listing sorts an album within one or two stickers of completion to the top, or badges it. The last slot is the hardest and the most motivating; the app should point at it.
- **Affordability cue.** An album the current balance could unlock is subtly marked. It answers "what can I afford right now" without arithmetic.

**Locked albums**

1. Display the cover in black and white.
2. Display the button **Unlock <value>**.
3. On click, it must be possible to enter the album and see all of its locked stickers.
4. No sticker may be purchased — directly or at random — until the album itself is unlocked.

**Unlocked albums**

1. Display the cover in color.
2. Instead of the button, display a progress bar with the completion percentage centered inside it.
3. Clicking the album must allow the user to enter it and see its stickers, both locked and unlocked.

**Completed albums**

1. Completion unlocks the album's **print export** — see *Export for print*. This is the reward for finishing.
2. Random sticker purchase is disabled.
3. The export may be run as many times as the user wishes, for as long as the album exists.

**Creating new albums**

1. On the album listing, there must be a button to create a new album.
2. The first step of creation asks the user to choose: **create from scratch**, or **create from an existing album**.
3. Creating from scratch: the user fills in title, description, and cover image, and selects the stickers. Both the cover and the stickers are imported from the local device.
4. All stickers must be the same size. See *Geometry* below.
5. Each sticker is assigned a **rarity tier**. The tiers are fixed and ordered: **common, rare, epic, legendary.** They cannot be renamed, added to, or removed.
6. The album defines, **for itself**, a price and a drop chance for each tier. Two albums may value the same tier completely differently.
7. **A sticker has no price of its own.** Its price is the price of its tier, in its album.
8. Drop odds must sum to 100%, and must decrease from common to legendary. The creation screen pre-fills a sensible default — 60 / 25 / 12 / 3 — so the user starts from a working economy rather than four empty fields.
9. The user sets the price of a **random sticker** — a single price for the whole album, paid regardless of what the roll returns.
10. **Slot order.** On sealing, the stickers are shuffled at random and that
    order is stored. It is **no longer what the album is laid out by**: both the
    grid and the print export order stickers **by rarity, commonest first**, and
    the stored slot order breaks ties inside a tier. One order, so a printed
    sheet matches the screen. The shuffle is still drawn once and stored — it is
    what makes the order deterministic — and it is still immutable. Note this
    changed after the first albums were sealed: an album printed before the
    change comes out in a different arrangement now.
11. **Sealing.** On creation, the album is sealed. Its sticker set, its unlock price, its tier prices, its drop odds, every rarity assignment, the random-sticker price, and the slot order all become immutable. The seal is a commitment device, not a security boundary — the user may always supersede or delete the album, at a cost.

**Geometry**

Sticker and cover share one aspect ratio, 5:7. The cover is exactly three times the sticker, and lands on A5 — which matters the moment the album is printed.

|         | Ratio | Physical          | Stored, at 300 dpi |
| ------- | ----- | ----------------- | ------------------ |
| Sticker | 5:7   | 50 × 70 mm        | 591 × 827 px       |
| Cover   | 5:7   | 150 × 210 mm (A5) | 1772 × 2480 px     |

1. These sizes are canonical and identical on every device. They are the geometry of the stored image, not of the screen.
2. On import, an image is fitted by **aspect-fill**: center-cropped to the ratio, with a drag-to-reposition handle before it is committed. Aspect-fit is not used; transparent bars look wrong on a sticker.
3. The crop is applied on import. The original is not retained.
4. **Grid layout is responsive.** Sticker columns: 3 on iPhone, 4 on iPad, 6 on desktop. Album columns: 2 / 3 / 4.

**The album economy**

An album is a contract of ten numbers: an unlock price, a random-sticker price, and a price and a drop chance for each of the four tiers. Before the user seals it, the creation screen must show them what they have just written:

1. **Total album cost** — the unlock price plus the sum of every sticker's tier price. Displayed in coins and in hours, since one coin is one minute. *"This album will cost 4,200 coins — about 70 hours."*
2. **Expected value of a random sticker** — the sum of each tier's price weighted by its drop chance. Displayed beside the random-sticker price. *"A random sticker costs 40. On average it is worth 78."*

Neither figure blocks sealing. They exist so the user cannot design an incoherent economy by accident — a random pull that costs more than it returns, or an album priced at three hundred hours.

**Creating from an existing album**

1. This mode exists to create a **new version** of an album without re-importing its artwork.
2. The new album inherits the source album's cover, title, description, and sticker images as editable starting points. Its prices arrive pre-filled from the source and may be changed. `[ASSUMPTION — the user may also add and remove stickers from the inherited set before sealing.]`
3. The new album then passes through the same creation flow and is **sealed** on completion.
4. The new album arrives **locked** and must be unlocked at its own price.
5. **No ownership is carried over.** Every sticker starts locked. Every sticker must be earned and bought again.
6. The source album is unaffected and continues to exist.

**Deleting an album**

1. Deletion is destructive. The user loses the album, every sticker purchased inside it, every coin spent on it, and the right to export it. Nothing is refunded.
2. Deletion must show an explicit warning and require the user to type **the album's title** before proceeding. The match is trimmed and case-insensitive.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*

**Hiding locked slots**

An album may be created with **hide locked images**. With it set, a slot that has
not been collected shows a single **locked cover** — one image per album, like
the back of a card — instead of its own art under the grayscale filter. With no
cover chosen, the slot shows a `?`. The rarity frame still reads on a hidden
slot: that is how a locked slot announces its tier.

This does not create a second asset. Grayscale remains a CSS filter over one
colour master; the locked cover is a different picture the author supplied, and
it is stored once for the whole album.

**A sticker's own words**

Each sticker may carry an optional **title** and **description**, written during
creation and frozen by the seal along with its tier. Both are carried into a new
edition — re-typing a hundred names to reprint an album would be absurd. An
empty box is stored as `null`, not `""`: "no title" and "a deliberately blank
title" must not be the same row.

**Looking at a sticker**

Tapping a **collected** sticker opens it full size, with whatever the author
wrote about it in a single scrolling block beneath the picture — a title above a
separately scrolling description reads as two panels rather than one caption.
Swiping moves between collected stickers **without closing**: the point is to
look through a collection, and a viewer that shut on every step would make that
a tap per sticker. The ends stop rather than wrap, so reaching the end of an
album is something you can tell. Arrow keys do the same as a swipe, because a
swipe cannot be performed with a keyboard and this is the only way to read a
description.

A locked sticker cannot be opened. Its art is the thing being earned, and in an
album that hides locked slots it is not downloaded at all.
