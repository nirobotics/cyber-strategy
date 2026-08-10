import { useFetcher } from "react-router";
import { Badge, Button, Card, Input } from "./ui";
import { DATA_RANGE_OPTIONS, type DataRange } from "../lib/data-range";
import {
  RANKED_TIER_ORDER,
  tierDisplayLabel,
  type TierPercentages,
} from "../lib/tier-settings";
import type { ScoutingEventOption } from "../lib/scouting";

export function StrategySettingsPanel({
  tierPercentages,
  dataRange,
  readOnly = false,
  events = [],
  selectedEventKey,
  onSelectEvent,
}: {
  tierPercentages: TierPercentages;
  dataRange: DataRange[];
  readOnly?: boolean;
  events?: ScoutingEventOption[];
  selectedEventKey?: string;
  onSelectEvent?: (eventKey: string) => void;
}) {
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const busy = fetcher.state !== "idle";
  const tierKey = RANKED_TIER_ORDER.map((label) => tierPercentages[label]).join(":");

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3">
      {fetcher.data?.error ? (
        <Card className="border-danger/40 bg-danger/10 p-3 text-danger">{fetcher.data.error}</Card>
      ) : null}

      {!readOnly && events.length && selectedEventKey && onSelectEvent ? (
        <Card className="p-4">
          <label className="grid gap-2 text-sm font-medium text-ink-dim">
            赛事
            <select
              value={selectedEventKey}
              onChange={(event) => onSelectEvent(event.target.value)}
              className="input h-10 w-full font-sans"
            >
              {!events.some((event) => event.eventKey === selectedEventKey) ? <option value={selectedEventKey}>{selectedEventKey}</option> : null}
              {events.map((event) => (
                <option key={event.eventKey} value={event.eventKey}>
                  {event.name || event.eventKey}{event.isActive ? " · 当前" : ""}
                </option>
              ))}
            </select>
          </label>
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">综合均分排名</h2>
          </div>
        </div>
        <fetcher.Form id="tier-percentages-form" key={tierKey} method="post" action="/admin" className="grid gap-3" onSubmit={readOnly ? (event) => event.preventDefault() : undefined}>
          <input type="hidden" name="intent" value="save-tier-percentages" />
          <div className="grid gap-2 sm:grid-cols-4">
            {RANKED_TIER_ORDER.map((label) => (
              <label key={label} className="grid gap-1 text-sm">
                <span className="font-medium text-ink-dim">{tierDisplayLabel(label)}</span>
                <div className="flex items-center gap-1">
                  <Input
                    name={`tier_${label}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    defaultValue={tierPercentages[label]}
                    disabled={readOnly}
                    className="h-10"
                  />
                  <span className="text-sm text-ink-faint">%</span>
                </div>
              </label>
            ))}
          </div>
        </fetcher.Form>
        {!readOnly ? (
          <div className="mt-3 flex gap-2">
            <Button type="submit" form="tier-percentages-form" variant="primary" disabled={busy}>保存比例</Button>
            <fetcher.Form method="post" action="/admin">
              <input type="hidden" name="intent" value="reset-tier-percentages" />
              <Button type="submit" disabled={busy}>恢复默认</Button>
            </fetcher.Form>
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">数据范围</h2>
          </div>
          <Badge className="border-line bg-surface-2 text-ink-dim">{dataRange.length} / {DATA_RANGE_OPTIONS.length}</Badge>
        </div>
        <fetcher.Form key={dataRange.join(":")} method="post" action="/admin" className="grid gap-3" onSubmit={readOnly ? (event) => event.preventDefault() : undefined}>
          <input type="hidden" name="intent" value="save-data-range" />
          <div className="grid gap-2 sm:grid-cols-3">
            {DATA_RANGE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink-dim">
                <input
                  name="dataRange"
                  type="checkbox"
                  value={option.value}
                  defaultChecked={dataRange.includes(option.value)}
                  disabled={readOnly}
                  className="size-4 accent-[var(--accent)]"
                />
                {option.label}
              </label>
            ))}
          </div>
          {!readOnly ? <Button type="submit" variant="primary" disabled={busy} className="w-fit">保存范围</Button> : null}
        </fetcher.Form>
      </Card>
    </div>
  );
}
