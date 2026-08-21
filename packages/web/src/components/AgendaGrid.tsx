import type { EpicAccent, LocalDate, Occurrence, Task, Weekday } from "@sticker-collector/shared";
import { minutesToClock, WEEKDAYS, weekdayOf } from "@sticker-collector/shared";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  type AgendaBlock,
  agendaBlocks,
  agendaHours,
  blocksOn,
  hourRows,
  isNow,
  laneOut,
  minutesNowIn,
  nowMarker,
  openingHour,
  type PlacedBlock,
  scheduledRoutines,
} from "../lib/agenda";
import { prefersMotion } from "../lib/placement";
import { appTimeZone } from "../lib/timezone";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useNow } from "../lib/useNow";
import { EmptyState } from "./ui";
import { cx } from "./ui/cx";

/**
 * The week as an agenda — hours down the left, days across the top.
 *
 * Two layouts, not one scaled down. Seven columns on a phone is about fifty
 * pixels each, which turns "English study" into three characters and a
 * tooltip; below the breakpoint this is one day at a time instead. The week
 * grid is the same data, laid out where there is room for it.
 *
 * **Only routines with times appear.** A block with no hour has nowhere to go,
 * and every routine created before the agenda has none — hence an empty state
 * that says so rather than an empty grid.
 */
export interface AgendaGridProps {
  routines: Task[];
  occurrences: Occurrence[];
  /** The seven dates of the shown week, Monday-first. */
  dates: LocalDate[];
  today: LocalDate;
  accentOf?: (task: Task) => EpicAccent | null;
  /** Tapping a block completes that day. Absent leaves the agenda read-only. */
  onToggle?: (block: AgendaBlock) => void;
  /** Ticked and still inside the undo window. */
  isPending?: (block: AgendaBlock) => boolean;
}

/** Below this the week does not fit; above it, it does. */
const WIDE = "(min-width: 40rem)";

export function AgendaGrid({
  routines,
  occurrences,
  dates,
  today,
  accentOf,
  onToggle,
  isPending,
}: AgendaGridProps) {
  const wide = useMediaQuery(WIDE);
  // A minute tick, because the marker for "now" is the one thing here that is
  // wrong the moment it stops moving.
  const minutesNow = minutesNowIn(appTimeZone(), useNow());

  const scheduled = scheduledRoutines(routines);
  const range = agendaHours(scheduled);

  if (!range) {
    return (
      <EmptyState
        icon="◷"
        title="Nothing has a time yet"
        description="Give a routine its hours in the task form and it appears here, on the days it runs."
      />
    );
  }

  // Laned here so both layouts inherit it: a clash the rules now refuse can
  // still exist in data saved before they did.
  const blocks = laneOut(agendaBlocks(scheduled, dates, occurrences));
  const hours = hourRows(range);
  const marker = nowMarker(range, minutesNow);
  const props = { blocks, hours, range, today, minutesNow, marker, accentOf, onToggle, isPending };

  // Keyed by the date so the phone's day picker snaps back to today when the
  // day turns over under an app left open overnight.
  return wide ? <WeekAgenda {...props} /> : <DayAgenda key={today} dates={dates} {...props} />;
}

interface LayoutProps {
  blocks: PlacedBlock[];
  hours: number[];
  range: { from: number; to: number };
  today: LocalDate;
  minutesNow: number;
  marker: { hour: number; fraction: number } | null;
  accentOf?: (task: Task) => EpicAccent | null;
  onToggle?: (block: AgendaBlock) => void;
  isPending?: (block: AgendaBlock) => boolean;
}

/** Seven columns, hours as rows. */
function WeekAgenda({ blocks, hours, range, today, marker, ...rest }: LayoutProps) {
  const todayIndex = weekdayOf(today);
  const openAt = openingHour(marker, blocks);
  const openRef = useOpenAt(openAt !== null, today);

  return (
    <div
      className="relative grid gap-1"
      style={{
        gridTemplateColumns: "3.5rem repeat(7, 1fr)",
        gridTemplateRows: `auto repeat(${hours.length}, minmax(2.75rem, auto))`,
      }}
    >
      {/* Today's column, outlined once — the same treatment the weekly grids
          use, and for the same reason: seven small marks read as seven states
          rather than one day. Absolutely positioned so it takes no cell. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-lg border-2 border-ring-today"
        style={{
          gridColumn: `${todayIndex + 2} / ${todayIndex + 3}`,
          gridRow: `1 / ${hours.length + 2}`,
        }}
      />

      <span />
      {WEEKDAYS.map((day, index) => (
        <span
          key={day}
          className={cx(
            "text-center font-numeric text-2xs font-bold",
            index === todayIndex ? "text-cyan" : "text-ink-muted",
          )}
        >
          {day.slice(0, 2).toUpperCase()}
        </span>
      ))}

      {hours.map((hour, row) => (
        <span
          key={hour}
          ref={hour === openAt ? openRef : undefined}
          className="pr-1 text-right font-numeric text-3xs text-ink-muted"
          style={{ gridColumn: 1, gridRow: row + 2 }}
        >
          {String(hour).padStart(2, "0")}:00
        </span>
      ))}

      {/* A faint rule per hour, so a block's position can be read off the grid
          rather than guessed from its neighbours. */}
      {hours.map((hour, row) => (
        <span
          key={`rule-${hour}`}
          aria-hidden
          className="border-border border-t opacity-40"
          style={{ gridColumn: "2 / -1", gridRow: row + 2, alignSelf: "start" }}
        />
      ))}

      <NowLine marker={marker} range={range} column="2 / -1" headerRows={1} />

      {blocks.map((block) => (
        <Block
          key={`${block.task.id} ${block.date}`}
          block={block}
          style={{
            gridColumn: block.slot.weekday + 2,
            gridRow: `${Math.floor(block.slot.startMin / 60) - range.from + 2} / ${
              Math.ceil(block.slot.endMin / 60) - range.from + 2
            }`,
          }}
          today={today}
          {...rest}
        />
      ))}
    </div>
  );
}

/**
 * One day, full width.
 *
 * The hour column stays — the question the agenda answers is "what is at three
 * o'clock", and a bare list of times in the blocks makes that a reading
 * exercise.
 *
 * The day picker is not decoration. Without it a phone can see today and
 * nothing else: the other six days of the week the grid is already holding
 * would be unreachable, and so would ticking a day off after the fact.
 */
function DayAgenda({
  blocks,
  hours,
  range,
  today,
  marker,
  dates,
  ...rest
}: LayoutProps & { dates: LocalDate[] }) {
  const todayIndex = weekdayOf(today);
  const [shown, setShown] = useState<Weekday>(todayIndex as Weekday);
  const day = blocksOn(blocks, shown);
  // Only today has a "now"; on any other day the marker is a lie, and the grid
  // opens on that day's first block instead.
  const onToday = shown === todayIndex;
  const openAt = openingHour(onToday ? marker : null, day);
  const openRef = useOpenAt(openAt !== null, dates[shown] ?? "");

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky, because the grid opens already scrolled: a fifteen-row day
          that lands the reader at 21:00 with the picker gone is a grid with no
          answer to "which day is this". The date rides along for the same
          reason. */}
      <div className="sticky top-0 z-10 flex flex-col gap-1 bg-void pb-2">
        {/* Buttons, not another tablist: the view switch above this already is
            one, and nesting two makes both harder to move through. A fieldset
            rather than a div with role="group" — same semantics, an element
            that already has them. */}
        <fieldset className="flex min-w-0 gap-1" aria-label="Day">
          {WEEKDAYS.map((name, index) => (
            <button
              key={name}
              type="button"
              aria-pressed={index === shown}
              onClick={() => setShown(index as Weekday)}
              className={cx(
                "min-h-11 flex-1 rounded-lg font-numeric text-2xs font-bold",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
                index === shown && "bg-surface-2",
                // One colour class, not two: Tailwind resolves a conflict by
                // stylesheet order, not by the order they are written here, so
                // `text-ink-muted text-cyan` on one button is a coin toss.
                // Today stays findable even when another day is the one shown.
                index === shown
                  ? "text-ink"
                  : index === todayIndex
                    ? "text-cyan"
                    : "text-ink-muted",
              )}
            >
              {name.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </fieldset>

        {/* The date, not just the weekday: once the picker can leave today,
            "Thu" alone does not say which Thursday is being ticked off. */}
        <p className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
          {`${WEEKDAYS[shown]} · ${onToday ? "today" : dayLabel(dates[shown])}`}
        </p>
      </div>

      {day.length === 0 ? (
        <p className="font-body text-md text-ink-dim">Nothing scheduled.</p>
      ) : (
        <div
          className="relative grid gap-1"
          style={{
            gridTemplateColumns: "3.5rem 1fr",
            gridTemplateRows: `repeat(${hours.length}, minmax(2.75rem, auto))`,
          }}
        >
          {hours.map((hour, row) => (
            <span
              key={hour}
              ref={hour === openAt ? openRef : undefined}
              className="pr-1 text-right font-numeric text-3xs text-ink-muted"
              style={{ gridColumn: 1, gridRow: row + 1 }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}

          {hours.map((hour, row) => (
            <span
              key={`rule-${hour}`}
              aria-hidden
              className="border-border border-t opacity-40"
              style={{ gridColumn: 2, gridRow: row + 1, alignSelf: "start" }}
            />
          ))}

          {onToday && <NowLine marker={marker} range={range} column="2" headerRows={0} />}

          {day.map((block) => (
            <Block
              key={`${block.task.id} ${block.date}`}
              block={block}
              style={{
                gridColumn: 2,
                gridRow: `${Math.floor(block.slot.startMin / 60) - range.from + 1} / ${
                  Math.ceil(block.slot.endMin / 60) - range.from + 1
                }`,
              }}
              today={today}
              {...rest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "20 Aug" from a `YYYY-MM-DD`.
 *
 * Read back in UTC on purpose. A date-only string parses as UTC midnight, so
 * formatting it in a zone behind UTC prints the day before — the same off-by-a-
 * day this app has already fixed elsewhere.
 */
function dayLabel(date: LocalDate | undefined): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The line across the grid at the current time.
 *
 * Drawn inside its hour's row rather than at a percentage of the whole grid:
 * rows are `minmax(2.75rem, auto)`, so a row holding a two-line block is taller
 * than an empty one and a whole-grid offset drifts.
 */
function NowLine({
  marker,
  range,
  column,
  headerRows,
}: {
  marker: { hour: number; fraction: number } | null;
  range: { from: number; to: number };
  column: string;
  /** Rows above the first hour — the week layout has a weekday header. */
  headerRows: number;
}) {
  if (!marker) return null;

  return (
    <span
      aria-hidden
      data-testid="now-line"
      className="pointer-events-none relative block h-px self-start bg-cyan"
      style={{
        gridColumn: column,
        gridRow: marker.hour - range.from + 1 + headerRows,
        top: `${marker.fraction * 100}%`,
      }}
    />
  );
}

/**
 * Bring that hour into view, once.
 *
 * Only when it is actually off screen: a jump on a grid that already fits reads
 * as a glitch.
 */
function useOpenAt(enabled: boolean, day: string) {
  const ref = useRef<HTMLElement | null>(null);
  // Once per day shown, not once per mount and not once per minute: switching
  // days should land on that day's first block, but the minute tick moving the
  // "now" hour must not yank a page the reader has scrolled somewhere else.
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || done.current === day) return;
    const node = ref.current;
    if (!node || typeof node.getBoundingClientRect !== "function") return;
    done.current = day;

    const box = node.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;

    node.scrollIntoView({ block: "center", behavior: prefersMotion() ? "smooth" : "auto" });
  }, [enabled, day]);

  return ref;
}

/** One routine, on one day, at its hour. */
function Block({
  block,
  style,
  today,
  minutesNow,
  accentOf,
  onToggle,
  isPending,
}: {
  block: PlacedBlock;
  style: CSSProperties;
  today: LocalDate;
  minutesNow: number;
  accentOf?: (task: Task) => EpicAccent | null;
  onToggle?: (block: AgendaBlock) => void;
  isPending?: (block: AgendaBlock) => boolean;
}) {
  const done = block.done || Boolean(isPending?.(block));
  const running = isNow(block, today, minutesNow);
  // Inert, like the tick-off grid's future cells: T-05 refuses a completion
  // before the day it is scheduled for, so an enabled block here would be a
  // button whose only outcome is an error toast.
  const future = block.date > today;
  const accent = accentOf?.(block.task) ?? null;
  const when = `${minutesToClock(block.slot.startMin)}–${minutesToClock(block.slot.endMin)}`;

  return (
    <button
      type="button"
      disabled={!onToggle || future}
      onClick={() => onToggle?.(block)}
      // The state is in the name as well as the colour: "done" as a green wash
      // alone is unreadable to anyone who cannot see the wash.
      aria-label={`${block.task.title}, ${when}${done ? ", done" : ""}`}
      aria-pressed={onToggle && !future ? done : undefined}
      style={
        {
          ...style,
          "--ui-epic": `var(--color-${accent ?? "epic-none"})`,
          // Its share of the cell when something else is in there too. Grid
          // items in one area stack, so without this the later block simply
          // covers the earlier and one task is gone from the day. Percentages
          // resolve against the grid area, so no wrapper element is needed.
          ...(block.lanes > 1
            ? {
                width: `${100 / block.lanes}%`,
                marginLeft: `${(100 / block.lanes) * block.lane}%`,
              }
            : {}),
          // A WASH, not a fill: 18% of the colour the wallet pays in. A solid
          // lime block would be unreadable, and reading the name is the whole
          // reason the agenda shows names instead of checkboxes.
          ...(done ? { background: "color-mix(in srgb, var(--color-lime) 18%, transparent)" } : {}),
        } as CSSProperties
      }
      className={cx(
        // No `overflow-hidden`: the title wraps, and clipping it here would
        // undo that. The hour rows are `minmax(2.75rem, auto)`, so a block that
        // needs two lines grows its row rather than spilling into the next one.
        "min-w-0 rounded-lg border-l-[3px] px-2 py-1 text-left",
        "[border-left-color:var(--ui-epic)] outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
        onToggle && !future && "cursor-pointer",
        future && "opacity-60",
        // A wash, not a fill: the title has to stay readable, which is the
        // whole point of showing the name instead of a checkbox.
        done ? undefined : "bg-surface-1",
        running && "ring-2 ring-ring-today",
      )}
    >
      {/* The whole title, wrapped. A day column is narrow and the names that
          share a column are the ones most alike — "English study" and "English
          homework" truncate to the same three words. */}
      <span
        className={cx(
          "block font-body text-2xs font-semibold break-words",
          done ? "text-ink-secondary line-through" : "text-ink",
        )}
      >
        {block.task.title}
      </span>
      {/* The clock stays on one line: it is four digits and a dash, and a
          wrapped time range reads as two times. */}
      <span className="block truncate font-numeric text-3xs text-ink-muted">{when}</span>
    </button>
  );
}
