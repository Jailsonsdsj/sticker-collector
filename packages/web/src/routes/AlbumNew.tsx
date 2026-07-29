import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router";
import { AppHeader } from "../components/layout";
import { Button, Tabs } from "../components/ui";
import { DetailsStep } from "../components/wizard/DetailsStep";
import { EconomyStep } from "../components/wizard/EconomyStep";
import { SealStep } from "../components/wizard/SealStep";
import { StickersStep } from "../components/wizard/StickersStep";
import {
  type AlbumDraft,
  initialDraft,
  isSealable,
  reduce,
  toPayload,
  validate,
} from "../lib/albumDraft";
import { clearDraft, loadDraft, saveDraft } from "../lib/draftStore";
import { useCreateAlbum } from "../lib/mutations";

/**
 * Creating an album, from scratch.
 *
 * An album is sealed on creation, so this whole screen is one long-lived form:
 * nothing reaches the server until the final POST except the images, which are
 * uploaded as they are cropped. Every change is persisted, so closing the tab
 * mid-wizard costs nothing.
 */
const STEPS = [
  { value: "details" as const, label: "Details", tone: "violet" as const },
  { value: "stickers" as const, label: "Stickers", tone: "cyan" as const },
  { value: "economy" as const, label: "Economy", tone: "coin" as const },
  { value: "seal" as const, label: "Seal", tone: "lime" as const },
];

type Step = (typeof STEPS)[number]["value"];

export function AlbumNew() {
  const navigate = useNavigate();
  const [draft, dispatch] = useReducer(reduce, initialDraft);
  const [step, setStep] = useState<Step>("details");
  const [restored, setRestored] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const create = useCreateAlbum();

  // A draft left behind by an earlier visit is the whole arrangement — restore
  // it before the user can type over it.
  useEffect(() => {
    let cancelled = false;
    void loadDraft().then((stored) => {
      if (!cancelled && stored) dispatch({ type: "replace", draft: stored });
      if (!cancelled) setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change, but never before the restore has run — an empty
  // initial draft must not overwrite the stored one on the way in.
  useEffect(() => {
    if (!restored) return;
    void saveDraft(draft);
  }, [draft, restored]);

  const problems = validate(draft);
  const sealable = isSealable(draft);

  const seal = async () => {
    setFailure(null);
    try {
      const sealed = await create.mutateAsync(toPayload(draft));
      // Cleared only after the album exists. The reverse order would drop the
      // draft on a failed request and lose everything.
      await clearDraft();
      navigate(`/albums/${sealed.album.id}`);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "The album could not be sealed.");
    }
  };

  const stepProps = { draft: draft as AlbumDraft, problems, dispatch };

  return (
    <>
      <AppHeader
        title="New album"
        trailing={
          <Button variant="ghost" tone="neutral" size="sm" onClick={() => navigate("/albums")}>
            Close
          </Button>
        }
      />

      <Tabs items={STEPS} value={step} onChange={setStep} label="Creation step" className="mb-5" />

      {step === "details" && <DetailsStep {...stepProps} />}
      {step === "stickers" && <StickersStep {...stepProps} />}
      {step === "economy" && <EconomyStep {...stepProps} />}
      {step === "seal" && <SealStep {...stepProps} />}

      {failure && (
        <p role="alert" className="mt-4 font-body text-sm text-magenta">
          {failure}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        {step !== "seal" ? (
          <Button tone="cyan" onClick={() => setStep(nextStep(step))}>
            Next
          </Button>
        ) : (
          <Button
            tone="lime"
            disabled={!sealable || create.isPending}
            loading={create.isPending}
            onClick={seal}
          >
            Seal album
          </Button>
        )}
      </div>
    </>
  );
}

function nextStep(step: Step): Step {
  const index = STEPS.findIndex((entry) => entry.value === step);
  return (STEPS[Math.min(index + 1, STEPS.length - 1)] as (typeof STEPS)[number]).value;
}
