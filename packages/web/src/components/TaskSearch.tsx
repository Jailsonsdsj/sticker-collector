import { Button, Input } from "./ui";

export interface TaskSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Finding a task by typing part of its title.
 *
 * **No submit.** There is no button to press and no Enter to hit: the list
 * narrows on every keystroke, because the whole point is to watch it narrow.
 * A search that waits for a submit is a search you have to be sure about
 * before you start.
 *
 * `type="search"` rather than a plain text field: it gets the right keyboard on
 * a phone, and iOS puts its own clear affordance in it. The explicit Clear
 * button is for everywhere else, and for a thumb — a 12px native cross is not a
 * tap target.
 */
export function TaskSearch({ value, onChange }: TaskSearchProps) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Input
        id="task-search"
        type="search"
        // No visible label: the placeholder says it, and a field this size with
        // a label above it pushes the list it filters off the screen.
        aria-label="Search tasks"
        placeholder="Search tasks…"
        autoComplete="off"
        className="flex-1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value !== "" && (
        <Button variant="ghost" tone="neutral" size="sm" onClick={() => onChange("")}>
          Clear
        </Button>
      )}
    </div>
  );
}
