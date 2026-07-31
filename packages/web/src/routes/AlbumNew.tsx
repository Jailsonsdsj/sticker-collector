import type { AlbumDetail } from "@sticker-collector/shared";
import { useEffect, useReducer, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router";
import { DiscardDraftDialog } from "../components/DiscardDraftDialog";
import { AppHeader } from "../components/layout";
import { Button, Skeleton, Tabs } from "../components/ui";
import { DetailsStep } from "../components/wizard/DetailsStep";
import { EconomyStep } from "../components/wizard/EconomyStep";
import { SealStep } from "../components/wizard/SealStep";
import { SourceStep } from "../components/wizard/SourceStep";
import { StickersStep } from "../components/wizard/StickersStep";
import {
  type AlbumDraft,
  draftFromAlbum,
  initialDraft,
  isPristine,
  isSealable,
  reduce,
  toPayload,
  validate,
} from "../lib/albumDraft";
import { api } from "../lib/api";
import { clearDraft, loadDraft, saveDraft } from "../lib/draftStore";
import { useCreateAlbum } from "../lib/mutations";
import { useAlbums } from "../lib/queries";

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
  // Whether the first question is still open. Decided once, when the stored
  // draft is read, and then only by the user answering it.
  const [choosing, setChoosing] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const create = useCreateAlbum();
  // Sealing navigates too, and it must not be asked whether to discard the
  // album it just created. A ref rather than state: the blocker reads it at
  // navigation time, and a re-render would arrive too late.
  const leaving = useRef(false);
  const albums = useAlbums({ sort: "created" });

  // A draft left behind by an earlier visit is the whole arrangement — restore
  // it before the user can type over it.
  useEffect(() => {
    let cancelled = false;
    void loadDraft().then((stored) => {
      if (cancelled) return;
      if (stored) dispatch({ type: "replace", draft: stored });
      // A draft that survived a refresh has already answered the first
      // question; asking again would look like losing the work.
      setChoosing(!stored || isPristine(stored));
      setRestored(true);
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

  /**
   * Leaving with work in it asks first — and then discards.
   *
   * The blocker covers **every** in-app exit, not just the Close button: the
   * tab bar and the browser's back button leave this screen too, and a guard
   * that only one of the three respects is a guard the user cannot trust.
   */
  const dirty = restored && !isPristine(draft);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const discard = async () => {
    await clearDraft();
    blocker.proceed?.();
  };

  const problems = validate(draft);
  const sealable = isSealable(draft);

  const seal = async () => {
    setFailure(null);
    try {
      const sealed = await create.mutateAsync(toPayload(draft));
      leaving.current = true;
      // Cleared only after the album exists. The reverse order would drop the
      // draft on a failed request and lose everything.
      await clearDraft();
      navigate(`/albums/${sealed.album.id}`);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "The album could not be sealed.");
    }
  };

  const stepProps = { draft: draft as AlbumDraft, problems, dispatch };

  /** Seeds the whole draft from an album that already exists. Uploads nothing. */
  const copyFrom = async (albumId: string) => {
    setSeeding(true);
    setFailure(null);
    try {
      const source = await api<AlbumDetail>(`/api/albums/${albumId}`);
      dispatch({ type: "replace", draft: draftFromAlbum(source) });
      setChoosing(false);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "That album could not be copied.");
    } finally {
      setSeeding(false);
    }
  };

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

      {/* Nothing is decided until the stored draft has been read. Rendering the
          steps first would flash the form and then replace it with the chooser
          — and a first tap landing in that gap goes nowhere. */}
      {!restored ? (
        <Skeleton variant="block" />
      ) : choosing ? (
        <SourceStep
          albums={albums.data ?? []}
          loading={albums.isLoading}
          seeding={seeding}
          onScratch={() => setChoosing(false)}
          onCopy={(albumId) => void copyFrom(albumId)}
        />
      ) : (
        <>
          <Tabs
            items={STEPS}
            value={step}
            onChange={setStep}
            label="Creation step"
            className="mb-5"
          />

          {step === "details" && <DetailsStep {...stepProps} />}
          {step === "stickers" && <StickersStep {...stepProps} />}
          {step === "economy" && <EconomyStep {...stepProps} />}
          {step === "seal" && <SealStep {...stepProps} />}
        </>
      )}

      <DiscardDraftDialog
        open={blocker.state === "blocked"}
        onKeep={() => blocker.reset?.()}
        onDiscard={() => void discard()}
      />

      {failure && (
        <p role="alert" className="mt-4 font-body text-sm text-magenta">
          {failure}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        {choosing ? null : step !== "seal" ? (
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
