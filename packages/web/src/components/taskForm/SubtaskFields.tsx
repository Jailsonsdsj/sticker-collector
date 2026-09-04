import { MAX_SUBTASKS } from "@sticker-collector/shared";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { TaskFormAction, TaskFormState } from "../../lib/taskForm";
import { Button, Field, Input } from "../ui";

export interface SubtaskFieldsProps {
  state: TaskFormState;
  dispatch: (action: TaskFormAction) => void;
}

/**
 * The steps, under the description.
 *
 * **A row is only ever added by asking** — with the button, or with Enter. A
 * list that grows a blank row as you type the last one is a list you cannot
 * finish: there is always one more empty box, and Save sits under it looking
 * unreachable.
 *
 * Blank rows are kept in the form's state rather than dropped as they empty —
 * clearing a field would otherwise delete the field you were clearing — and
 * trimmed away at the payload (`cleanSubtasks`).
 */
export function SubtaskFields({ state, dispatch }: SubtaskFieldsProps) {
  const full = state.subtasks.length >= MAX_SUBTASKS;
  const list = useRef<HTMLDivElement>(null);

  /**
   * Which row to put the cursor in once React has rendered it.
   *
   * The row does not exist at the moment Enter is pressed — it is one dispatch
   * away — so the focus has to wait for the render that creates it. Held as
   * state rather than done in the handler for exactly that reason.
   */
  const [focusRow, setFocusRow] = useState<number | null>(null);

  useEffect(() => {
    if (focusRow === null) return;
    list.current?.querySelector<HTMLInputElement>(`input[data-step="${focusRow}"]`)?.focus();
    setFocusRow(null);
  }, [focusRow]);

  /**
   * Enter continues the list, the way it does in every checklist.
   *
   * It **inserts after the current row** rather than appending, so a step added
   * in the middle lands where the cursor was. And it does nothing on a row that
   * is still blank: pressing Enter twice would otherwise stack empty boxes, and
   * an empty row is also the natural way to say "that is the last one".
   *
   * `preventDefault` because Enter in a field is the browser's submit gesture,
   * and this sheet's Save is not something to trip over mid-list.
   */
  const onKey = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    // `isComposing`: mid-IME, Enter commits the candidate rather than meaning
    // Enter, and swallowing it would eat the word being typed.
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (state.subtasks[index]?.trim() === "" || full) return;

    dispatch({ kind: "addSubtask", after: index });
    setFocusRow(index + 1);
  };

  return (
    <Field label="Steps" hint="optional — Enter adds another">
      <div ref={list} className="flex flex-col gap-2">
        {state.subtasks.map((title, index) => (
          <div
            // The index IS the identity here: a step has no id until it is
            // saved, and two rows may legitimately hold the same text while
            // being typed.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            className="flex items-center gap-2"
          >
            <Input
              aria-label={`Step ${index + 1}`}
              // How the focus effect finds the row it just created. An
              // attribute rather than an array of refs: the list is rebuilt on
              // every keystroke, and a ref array has to be kept in step with it.
              data-step={index}
              placeholder="What has to happen?"
              className="flex-1"
              value={title}
              onKeyDown={onKey(index)}
              onChange={(event) => dispatch({ kind: "subtask", index, value: event.target.value })}
            />
            <Button
              variant="ghost"
              tone="magenta"
              size="sm"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => dispatch({ kind: "removeSubtask", index })}
            >
              ✕
            </Button>
          </div>
        ))}

        {/* Absent at the ceiling rather than disabled: a control that can never
            do anything is noise on the screen it sits on. */}
        {!full && (
          <Button
            variant="outline"
            // Cyan, the app's colour for "this does something" — the same one
            // the Create button and the type tabs wear. As `neutral` it read as
            // disabled chrome sitting under the fields rather than as the one
            // control in the section, which is what it is.
            tone="cyan"
            size="sm"
            onClick={() => {
              dispatch({ kind: "addSubtask" });
              setFocusRow(state.subtasks.length);
            }}
          >
            {state.subtasks.length === 0 ? "Add a step" : "Add another"}
          </Button>
        )}
      </div>
    </Field>
  );
}
