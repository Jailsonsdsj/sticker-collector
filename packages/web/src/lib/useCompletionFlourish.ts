import gsap from "gsap";
import { type RefObject, useEffect, useRef } from "react";
import { prefersMotion } from "./placement";

/**
 * The short flourish a task row plays when it is ticked.
 *
 * It exists because the toast went away. The undo window is still three
 * seconds, and unticking still writes nothing — but with no banner announcing
 * it, the tick itself has to feel like it landed. A row that simply greys out
 * is indistinguishable from a row that failed to save.
 *
 * **Only on the transition into done**, never on mount. Without that guard
 * every row on the home screen would flourish on first paint, and again after
 * every refetch — turning "you finished something" into wallpaper.
 */
export function useCompletionFlourish(element: RefObject<HTMLElement | null>, done: boolean) {
  const wasDone = useRef(done);

  useEffect(() => {
    const justFinished = done && !wasDone.current;
    wasDone.current = done;

    if (!justFinished || !element.current || !prefersMotion()) return;

    const context = gsap.context(() => {
      const target = element.current;
      if (!target) return;

      gsap
        .timeline()
        // A quick lift and settle: felt more than watched. Anything longer
        // competes with the next tick, and ticking several things in a row is
        // the normal case rather than the exception.
        .fromTo(target, { scale: 1 }, { scale: 1.03, duration: 0.12, ease: "power2.out" })
        .to(target, { scale: 1, duration: 0.28, ease: "elastic.out(1, 0.5)" })
        // The lime wash reads as "earned" — the same colour the wallet pays in.
        .fromTo(
          target,
          { boxShadow: "0 0 0 0 var(--color-lime)" },
          {
            boxShadow: "0 0 0 3px transparent",
            duration: 0.5,
            ease: "power2.out",
            clearProps: "boxShadow",
          },
          0,
        );
    });

    return () => context.revert();
  }, [done, element]);
}
