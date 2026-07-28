import type { EpicAccent, Priority } from "@sticker-collector/shared";
import { QuickAdd } from "../../components/QuickAdd";
import { SectionHeading } from "../../components/SectionHeading";
import { TaskRow } from "../../components/TaskRow";
import { WalletCard } from "../../components/WalletCard";
import { Panel, Row, Section } from "../Section";

const PRIORITIES: Priority[] = ["high", "medium", "low"];
const ACCENTS: (EpicAccent | null)[] = ["epic-1", "epic-2", "epic-3", "epic-4", "epic-5", null];

export function Home() {
  return (
    <Section n="16" title="Home screen">
      <Panel>
        <Row label="wallet — pending coins are felt before the server hears about them">
          <div className="w-full">
            <WalletCard balance={1240} pendingCoins={30} />
          </div>
        </Row>

        <Row label="quick-add — Enter or the + button; a failure keeps the text">
          <div className="w-full">
            <QuickAdd onAdd={async (t) => console.info("quick-add", t)} />
          </div>
        </Row>

        <Row label="priority tint × epic accent — both must read at every level">
          <div className="flex w-full flex-col gap-2">
            {PRIORITIES.map((priority) =>
              ACCENTS.map((accent) => (
                <TaskRow
                  key={`${priority}-${accent ?? "none"}`}
                  title={`${priority} priority · ${accent ?? "no epic"}`}
                  priority={priority}
                  rewardCoins={30}
                  epicAccent={accent}
                  epicTitle={accent ? "Sticker App" : null}
                  disabled
                />
              )),
            )}
          </div>
        </Row>

        <div className="flex flex-col gap-6">
          <section>
            <SectionHeading tone="missed" count={1}>
              Missed
            </SectionHeading>
            <TaskRow
              title="Water the plants"
              priority="high"
              rewardCoins={15}
              epicAccent="epic-2"
              epicTitle="Home"
              typeLabel="↻ routine"
              disabled
            />
          </section>

          <section>
            <SectionHeading tone="today" count="1/2">
              Today
            </SectionHeading>
            <div className="flex flex-col gap-2">
              <TaskRow
                title="Stretch"
                priority="medium"
                rewardCoins={15}
                epicAccent="epic-3"
                epicTitle="Health"
                typeLabel="↻ routine"
                disabled
              />
              <TaskRow
                title="Finish the laundry"
                priority="low"
                rewardCoins={30}
                typeLabel="· one-off"
                done
                disabled
              />
            </div>
          </section>

          <section>
            <SectionHeading tone="backlog" count={1}>
              Backlog
            </SectionHeading>
            <TaskRow title="Buy milk" priority="medium" rewardCoins={30} disabled />
          </section>
        </div>
      </Panel>
    </Section>
  );
}
