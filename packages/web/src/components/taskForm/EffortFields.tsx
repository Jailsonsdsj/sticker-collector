import {
  EFFORT_PRESETS,
  rewardHint,
  type TaskFormAction,
  type TaskFormState,
} from "../../lib/taskForm";
import { Chip, Input } from "../ui";

/**
 * Effort and reward together, because reward only means anything beside it:
 * one minute of effort is one coin until the user overrides it, and the hint
 * says which of those two states they are in.
 */
export function EffortFields({
  state,
  dispatch,
}: {
  state: TaskFormState;
  dispatch: (action: TaskFormAction) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Input
          id="task-effort"
          tone="numeric"
          inputMode="numeric"
          label="Effort (min) → coins"
          placeholder="30"
          value={state.effortMinutes}
          onChange={(e) => dispatch({ kind: "effort", value: e.target.value })}
        />
        {/* Scrolls sideways instead of wrapping. Seven chips cannot share one
            phone-width row without dropping under a comfortable tap target, and
            a second row pushes Reward off the first screenful. `shrink-0` is
            what stops flex compressing them back down to fit. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {EFFORT_PRESETS.map((minutes) => (
            <Chip
              key={minutes}
              tone="lime"
              className="shrink-0"
              selected={state.effortMinutes === String(minutes)}
              onClick={() => dispatch({ kind: "effort", value: String(minutes) })}
            >
              {minutes}m
            </Chip>
          ))}
        </div>
      </div>

      <Input
        id="task-reward"
        tone="coin"
        inputMode="numeric"
        label="Reward (coins)"
        hint={rewardHint(state)}
        value={state.rewardCoins}
        onChange={(e) => dispatch({ kind: "reward", value: e.target.value })}
      />
    </>
  );
}
