---
description: Build a UI component from the design system only
---

Read docs/design-system.md and packages/web/src/styles/tokens.css. Read nothing else.

Build or modify the component: $ARGUMENTS

Constraints:
- Every colour, space, radius, shadow and duration comes from a token.
  No literal hex, rgb() or px font sizes — CI fails on them.
- Add the component to the /dev/ui kitchen-sink route in every state.
- Add a row to the inventory table in docs/design-system.md.
