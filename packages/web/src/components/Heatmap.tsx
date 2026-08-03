import type { DayTally, LocalDate } from "@sticker-collector/shared";
import { addDays, daysBetween, WEEKDAYS, weekdayOf } from "@sticker-collector/shared";
import gsap from "gsap";
import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from "react";
import { addMonth, clampMonth, monthLabel, monthOf } from "../lib/calendarMonth";
import { prefersMotion } from "../lib/placement";
import { swipeDirection } from "../lib/swipe";
import { Button } from "./ui";

export interface HeatmapProps {
  days: readonly DayTally[];
  today: LocalDate;
  /** Opens that day's review. Absent leaves the cells inert pictures. */
  onSelectDay?: (date: LocalDate) => void;
}

/**
 * Consistency, as a calendar: one month at a time, each day shaded by how much
 * of it was completed.
 *
 * It was a year of 12px dots — compact, and unreadable as *dates*. "I dropped
 * off around the 20th" is the thought this view has to answer, and a wall of
 * anonymous squares makes you count columns to find a day. A calendar is the
 * shape people already hold that answer in.
 *
 * The scale is unchanged, and deliberately: the bottom has **two** states, not
 * one, because a day where work was scheduled and missed reads differently from
 * a day with nothing scheduled (`prd/08-reports.md` §Consistency). Conflate
 * them and every rest day becomes a failure, every failure a rest day, and the
 * gap the view exists to show disappears.
 *
 * **Monday-first**, matching the mask (bit 0 = Monday) and the weekly grid. A
 * Sunday-first calendar puts every date in the wrong column and looks entirely
 * plausible.
 *
 * Swiping moves between months, the same gesture and the same thresholds as
 * every other swipe in the app (`lib/swipe.ts`) — a calendar you can only page
 * with two small arrows is a calendar nobody pages.
 */
export type HeatLevel = "empty" | "missed" | 1 | 2 | 3 | 4;

export function heatLevel(day: DayTally): HeatLevel {
  if (day.scheduled === 0) return "empty";
  if (day.done === 0) return "missed";

  const share = day.done / day.scheduled;
  if (share >= 1) return 4;
  if (share > 0.66) return 3;
  if (share > 0.33) return 2;
  return 1;
}

const LEVEL_COLOUR: Record<string, string> = {
  empty: "var(--color-heat-empty)",
  missed: "var(--color-heat-missed)",
  "1": "var(--color-heat-1)",
  "2": "var(--color-heat-2)",
  "3": "var(--color-heat-3)",
  "4": "var(--color-heat-4)",
};

/** The top of the scale is solid lime; a date written on it in white is a
 *  smudge. */
const LEVEL_INK: Record<string, string> = {
  empty: "var(--color-ink-faint)",
  missed: "var(--color-ink)",
  "1": "var(--color-ink-secondary)",
  "2": "var(--color-ink)",
  "3": "var(--color-ink-inverse)",
  "4": "var(--color-ink-inverse)",
};

export function Heatmap({ days, today, onSelectDay }: HeatmapProps) {
  // Opens on today's month, which is the one the user is living in — not on the
  // oldest month in a year of history.
  const [month, setMonth] = useState(() => monthOf(today));
  const grid = useRef<HTMLDivElement>(null);
  const touchFrom = useRef<{ x: number; y: number } | null>(null);
  // Which way the last move went, so the new month enters from the side the old
  // one left towards. Same rule as the sticker viewer: without it, "back" and
  // "forward" look identical.
  const direction = useRef(1);
  const previous = useRef(month);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = month;
    if (from === month || !grid.current || !prefersMotion()) return;

    gsap.fromTo(
      grid.current,
      { xPercent: direction.current * 25, autoAlpha: 0 },
      { xPercent: 0, autoAlpha: 1, duration: 0.24, ease: "power2.out", clearProps: "transform" },
    );
  }, [month]);

  const first = days[0]?.date;
  const last = days.at(-1)?.date;
  if (!first || !last) return null;

  const tally = new Map(days.map((day) => [day.date, day]));
  const shown = clampMonth(month, monthOf(first), monthOf(last));

  const start = `${shown}-01` as LocalDate;
  const length = daysBetween(start, addMonth(shown, 1));
  const lead = weekdayOf(start);

  /** Steps a month, refusing to walk off either end of the history. */
  const step = (by: -1 | 1) => {
    const next = monthOf(addMonth(shown, by));
    if (next < monthOf(first) || next > monthOf(last)) return;
    direction.current = by;
    setMonth(next);
  };

  return (
    <figure aria-label="Completion calendar" className="flex flex-col gap-3">
      <figcaption className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          aria-label="Previous month"
          disabled={shown <= monthOf(first)}
          onClick={() => step(-1)}
        >
          ‹
        </Button>
        <span aria-live="polite" className="font-body text-md font-bold text-ink">
          {monthLabel(shown)}
        </span>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          aria-label="Next month"
          disabled={shown >= monthOf(last)}
          onClick={() => step(1)}
        >
          ›
        </Button>
      </figcaption>

      <div
        ref={grid}
        className="grid grid-cols-7 gap-1 touch-pan-y"
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (event.pointerType === "mouse") return;
          touchFrom.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
          const from = touchFrom.current;
          touchFrom.current = null;
          if (!from) return;
          // Right means "back", the way pages turn.
          const swiped = swipeDirection(event.clientX - from.x, event.clientY - from.y);
          if (swiped !== 0) step(swiped > 0 ? -1 : 1);
        }}
        onPointerCancel={() => {
          touchFrom.current = null;
        }}
      >
        {WEEKDAYS.map((label) => (
          <span
            // Keyed on the full weekday name: the rendered initial is not
            // unique (two T's, two S's), the name is.
            key={label}
            aria-hidden="true"
            className="text-center font-body text-3xs text-ink-faint"
          >
            {label.slice(0, 1)}
          </span>
        ))}

        {Array.from({ length: lead }, (_, i) => (
          // The blanks before the 1st. Marked so the count is assertable: a
          // calendar that pads by the wrong number puts every date in the
          // wrong column while still looking like a calendar.
          <span key={`pad-${addDays(start, i - lead)}`} data-pad aria-hidden="true" />
        ))}

        {Array.from({ length }, (_, i) => {
          const date = addDays(start, i);
          const day = tally.get(date);
          // A day inside the month but outside the reported window — later this
          // week, or before the account existed. It gets the empty shade but
          // says something different, because "nothing scheduled" is a claim
          // about a day nobody has data for.
          const level = day ? String(heatLevel(day)) : "empty";

          const label = labelFor(date, day);
          const shape = `flex aspect-square items-center justify-center rounded-md font-numeric text-2xs${
            date === today ? " ring-2 ring-ring-today" : ""
          }`;
          const paint = { background: LEVEL_COLOUR[level], color: LEVEL_INK[level] };

          // A day with nothing finished opens nothing: a dialog reading "you
          // finished nothing that day" is a punishment, not a review.
          const reviewable = Boolean(onSelectDay) && (day?.done ?? 0) > 0;

          return reviewable ? (
            <button
              key={date}
              type="button"
              data-date={date}
              data-level={level}
              data-col={weekdayOf(date)}
              title={label}
              // The name says what is in the day AND that it opens. A cell that
              // reads only as a picture gives a screen reader no reason to
              // press it.
              aria-label={`${label}. Review this day`}
              onClick={() => onSelectDay?.(date)}
              className={`${shape} cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan`}
              style={paint}
            >
              {date.slice(8)}
            </button>
          ) : (
            <span
              key={date}
              // A cell is a small picture of one day. Without a role the label
              // is not exposed at all — `getByLabelText` would still find it,
              // which is exactly how that goes unnoticed.
              role="img"
              data-date={date}
              data-level={day ? level : "none"}
              data-col={weekdayOf(date)}
              title={label}
              aria-label={label}
              className={shape}
              style={paint}
            >
              {date.slice(8)}
            </span>
          );
        })}
      </div>

      <div className="flex items-center gap-2 font-body text-2xs text-ink-muted">
        <span>Less</span>
        {(["missed", 1, 2, 3, 4] as HeatLevel[]).map((level) => (
          <span
            key={String(level)}
            className="h-3 w-3 rounded-xs"
            style={{ background: LEVEL_COLOUR[String(level)] }}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </div>
    </figure>
  );
}

/** A colour alone is not a report — every cell says what it means. */
function labelFor(date: LocalDate, day?: DayTally): string {
  if (!day) return `${date}: outside the reported period`;
  if (day.scheduled === 0) return `${date}: nothing scheduled`;
  return `${date}: ${day.done} of ${day.scheduled} completed`;
}
