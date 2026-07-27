import { AlbumGrid, AppHeader, StickerGrid, TabBar } from "../../components/layout";
import { Badge, Button } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

/** Numbered cells, so the column count is countable rather than trusted. */
function Cells({ count }: { count: number }) {
  return Array.from({ length: count }, (_, i) => i + 1).map((n) => (
    <div
      key={n}
      className="flex aspect-card items-center justify-center rounded-lg border border-border bg-surface-2 font-numeric text-base text-ink-muted"
    >
      {n}
    </div>
  ));
}

export function Layout() {
  return (
    <Section n="15" title="Layout">
      <Panel>
        <Row label="app header — leading / title / trailing slots">
          <div className="w-full">
            <AppHeader
              title="Albums"
              trailing={
                <Badge tone="coin" font="numeric">
                  1,240 ¢
                </Badge>
              }
            />
            <AppHeader
              title="Cidades"
              leading={
                <Button variant="ghost" tone="neutral" size="sm">
                  ‹
                </Button>
              }
              trailing={
                <Button variant="outline" tone="magenta" size="sm">
                  🗑
                </Button>
              }
            />
          </div>
        </Row>

        <div className="flex flex-col gap-3">
          <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
            sticker grid — 3 / 4 / 6 columns at phone / iPad / desktop
          </span>
          <StickerGrid>
            <Cells count={12} />
          </StickerGrid>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
            album grid — 2 / 3 / 4 columns
          </span>
          <AlbumGrid>
            <Cells count={8} />
          </AlbumGrid>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
            tab bar — the real component, not a copy
          </span>
          {/* transform-gpu makes this a containing block, so the bar's
              position:fixed resolves here instead of over the page. */}
          <div className="relative h-24 transform-gpu overflow-hidden rounded-2xl border border-border bg-void">
            <TabBar />
          </div>
          <p className="font-body text-md text-ink-secondary">
            Active state is prefix-matched — the Albums tab stays lit inside an album. Only Tasks is
            exact-matched, since every path descends from <code className="text-cyan">/</code>.
          </p>
        </div>
      </Panel>
    </Section>
  );
}
