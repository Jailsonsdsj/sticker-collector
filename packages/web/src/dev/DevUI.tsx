import { Badges } from "./galleries/Badges";
import { Buttons } from "./galleries/Buttons";
import { Checkboxes } from "./galleries/Checkboxes";
import { Chips } from "./galleries/Chips";
import { Feedback } from "./galleries/Feedback";
import { Fields } from "./galleries/Fields";
import { Home } from "./galleries/Home";
import { Layout } from "./galleries/Layout";
import { Overlays } from "./galleries/Overlays";
import { Progress } from "./galleries/Progress";
import { Weekly } from "./galleries/Weekly";
import { SectionIndex } from "./SectionIndex";
import { TokenSheet } from "./TokenSheet";

/**
 * The kitchen sink. Every token and every component in every variant × state,
 * on one page that ships with the app and works on a real phone — not
 * Storybook, which is six dependencies and a story file per component.
 *
 * The written counterpart is `docs/design-system.md`. That inventory, not this
 * page and not the design bundle, is what later tasks read.
 */
export function DevUI() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <a
        href="/"
        className="mb-6 inline-block font-numeric text-2xs text-cyan tracking-kicker uppercase no-underline hover:underline"
      >
        ← back to the app
      </a>
      <SectionIndex />
      <TokenSheet />
      <Buttons />
      <Fields />
      <Chips />
      <Checkboxes />
      <Badges />
      <Overlays />
      <Feedback />
      <Progress />
      <Layout />
      <Home />
      <Weekly />
    </main>
  );
}
