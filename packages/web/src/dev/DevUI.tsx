import { Badges } from "./galleries/Badges";
import { Buttons } from "./galleries/Buttons";
import { Checkboxes } from "./galleries/Checkboxes";
import { Chips } from "./galleries/Chips";
import { Feedback } from "./galleries/Feedback";
import { Fields } from "./galleries/Fields";
import { Overlays } from "./galleries/Overlays";
import { Progress } from "./galleries/Progress";
import { TokenSheet } from "./TokenSheet";

/**
 * The kitchen sink. Every primitive in every variant × state, on one page that
 * ships with the app and works on a real phone — not Storybook.
 *
 * D-02 covers batch 1, D-03 batch 2; D-05 turns this into the route that
 * `docs/design-system.md` indexes.
 */
export function DevUI() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <TokenSheet />
      <Buttons />
      <Fields />
      <Chips />
      <Checkboxes />
      <Badges />
      <Overlays />
      <Feedback />
      <Progress />
    </main>
  );
}
