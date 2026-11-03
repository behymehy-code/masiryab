import { ArrowLeftRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MetroMap, type Highlight } from "@/components/metro/metro-map";
import { DATA } from "@/data/metro";
import { plan, searchStations, type Journey } from "@/lib/metro/engine";
import { BRANCH, DAY_OPTIONS, faNum, formatClock, lineColor } from "@/lib/metro/format";

const LINES = [...new Set(DATA.stations.flatMap((station) => station[1]))].sort();
const INTERCHANGES = DATA.stations.map((_, index) => index).filter((index) => DATA.stations[index][1].length > 1);

function legPath(route: string, from: number, to: number) {
  const order = DATA.orders[route];
  const start = order.indexOf(from);
  const end = order.indexOf(to);
  if (start < 0 || end < 0) return [from, to];
  return start <= end ? order.slice(start, end + 1) : order.slice(end, start + 1).reverse();
}

export function Planner() {
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [fromLine, setFromLine] = useState<string | null>(null);
  const [toLine, setToLine] = useState<string | null>(null);
  const [qFrom, setQFrom] = useState("");
  const [qTo, setQTo] = useState("");
  const [open, setOpen] = useState<"from" | "to" | null>(null);
  const [lineFilter, setLineFilter] = useState("");
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("08:00");
  const [transfer, setTransfer] = useState(5);
  const [over, setOver] = useState<Record<number, number>>({});
  const [ix, setIx] = useState(String(INTERCHANGES[0] ?? 0));
  const [ixMin, setIxMin] = useState(5);
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [frameKey, setFrameKey] = useState("city");
  const [mapMode, setMapMode] = useState<"schematic" | "geographic">("schematic");

  useEffect(() => {
    const mask = ({ 4: 2, 5: 4 } as Record<number, number>)[new Date().getDay()] || 1;
    setDay(mask);
    try {
      const savedMode = localStorage.getItem("metro-map-mode");
      if (savedMode === "geographic" || savedMode === "schematic") setMapMode(savedMode);
      const saved = JSON.parse(localStorage.getItem("metro-transfer-mins") || "{}") as Record<string, number>;
      const next: Record<number, number> = {};
      for (const [key, value] of Object.entries(saved)) next[Number(key)] = Number(value);
      setOver(next);
    } catch {
      /* keep defaults */
    }
  }, []);

  const changeMapMode = (mode: "schematic" | "geographic") => {
    setMapMode(mode);
    localStorage.setItem("metro-map-mode", mode);
    setFrameKey(`map-${mode}-${Date.now()}`);
  };

  const saveOver = (next: Record<number, number>) => {
    setOver(next);
    localStorage.setItem("metro-transfer-mins", JSON.stringify(next));
  };

  const choose = (role: "from" | "to", id: number, line: string | null) => {
    const name = DATA.stations[id][0];
    if (role === "from") {
      setFrom(id);
      setFromLine(line);
      setQFrom(name);
    } else {
      setTo(id);
      setToLine(line);
      setQTo(name);
    }
    setOpen(null);
  };

  const matches = (query: string) => searchStations(DATA, query, lineFilter || undefined).slice(0, 8);

  const shown = journeys?.[active] ?? null;
  const highlight: Highlight[] = useMemo(() => {
    if (!shown) return [];
    return shown.legs.map((leg) => ({ route: leg.route, ids: legPath(leg.route, leg.from, leg.to) }));
  }, [shown]);
  const frameIds = shown ? [...new Set(highlight.flatMap((item) => item.ids))] : null;

  const calculate = () => {
    if (from == null || to == null) {
      setJourneys(null);
      setMessage("مبدأ و مقصد را انتخاب کنید.");
      return;
    }
    if (from === to) {
      setJourneys(null);
      setMessage("مبدأ و مقصد یکی است.");
      return;
    }
    const [hour, minute] = time.split(":").map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      setJourneys(null);
      setMessage("ساعت حرکت معتبر نیست.");
      return;
    }
    let dep = hour * 60 + minute;
    if (dep < 240) dep += 1440;
    const result = plan(DATA, { from, to, fromLine, toLine, day, dep, def: transfer, over });
    if (!result.length) {
      setJourneys([]);
      setActive(0);
      setMessage("با این روز و ساعت، مسیری در برنامه قطارها پیدا نشد.");
      return;
    }
    setMessage(null);
    setJourneys(result);
    setActive(result.length - 1);
    setFrameKey(`go-${from}-${to}-${Date.now()}`);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setFromLine(toLine);
    setToLine(fromLine);
    setQFrom(to == null ? "" : DATA.stations[to][0]);
    setQTo(from == null ? "" : DATA.stations[from][0]);
  };

  return (
    <main className="mx-auto max-w-6xl px-3 py-4">
      <header className="mb-3">
        <p className="text-xs text-muted">بر اساس برنامه حرکت قطارها</p>
        <h1 className="text-xl font-bold text-ink">مسیریاب متروی تهران</h1>
      </header>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <div className="order-2 lg:order-1">
        <section className="rounded-2xl border border-line bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field
              label="مبدأ"
              value={qFrom}
              open={open === "from"}
              options={matches(qFrom)}
              selected={from}
              line={fromLine}
              onFocus={() => setOpen("from")}
              onChange={(value) => {
                setQFrom(value);
                setOpen("from");
              }}
              onPick={(id) => choose("from", id, null)}
              onLine={(line) => setFromLine(line)}
            />
            <Field
              label="مقصد"
              value={qTo}
              open={open === "to"}
              options={matches(qTo)}
              selected={to}
              line={toLine}
              onFocus={() => setOpen("to")}
              onChange={(value) => {
                setQTo(value);
                setOpen("to");
              }}
              onPick={(id) => choose("to", id, null)}
              onLine={(line) => setToLine(line)}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-36 flex-1 text-xs text-muted">
              فیلتر خط در جست‌وجو
              <select
                className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink"
                value={lineFilter}
                onChange={(event) => setLineFilter(event.target.value)}
              >
                <option value="">همه خط‌ها</option>
                {LINES.map((line) => (
                  <option key={line} value={line}>
                    خط {faNum(line)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={swap} className="inline-flex items-center gap-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink">
              <ArrowLeftRight className="size-4" />
              جابه‌جایی
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              نوع روز
              <select
                className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink"
                value={day}
                onChange={(event) => setDay(Number(event.target.value))}
              >
                {DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              ساعت حرکت
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-muted">از نیمه‌شب تا ۴ بامداد، ادامه سرویس شب همان روز حساب می‌شود.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">زمان تعویض خط (تخمینی)</summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="w-24 text-xs text-muted">
                پیش‌فرض
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={transfer}
                  onChange={(event) => setTransfer(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-2 py-2 text-sm text-ink"
                />
              </label>
              <label className="min-w-40 flex-1 text-xs text-muted">
                ایستگاه تقاطعی
                <select
                  value={ix}
                  onChange={(event) => setIx(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-2 py-2 text-sm text-ink"
                >
                  {INTERCHANGES.map((id) => (
                    <option key={id} value={id}>
                      {DATA.stations[id][0]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-20 text-xs text-muted">
                دقیقه
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={ixMin}
                  onChange={(event) => setIxMin(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-2 py-2 text-sm text-ink"
                />
              </label>
              <button
                type="button"
                className="rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink"
                onClick={() => saveOver({ ...over, [Number(ix)]: ixMin })}
              >
                ثبت
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              {Object.keys(over).length
                ? Object.entries(over).map(([id, mins]) => (
                    <button
                      key={id}
                      type="button"
                      className="ml-2 underline"
                      onClick={() => {
                        const next = { ...over };
                        delete next[Number(id)];
                        saveOver(next);
                      }}
                    >
                      {DATA.stations[Number(id)][0]}: {faNum(mins)} دقیقه، حذف
                    </button>
                  ))
                : "همه تعویض‌ها با زمان پیش‌فرض و به‌صورت تخمینی حساب می‌شوند."}
            </p>
          </details>
          <button type="button" onClick={calculate} className="mt-3 w-full rounded-xl bg-accent px-3 py-3 text-sm font-bold text-surface">
            محاسبه مسیر
          </button>
          {message && <p className="mt-2 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">{message}</p>}
        </section>
        {journeys && journeys.length > 0 && (
          <section className="mt-3 rounded-2xl border border-line bg-surface p-3">
            <h2 className="mb-2 text-sm font-bold text-ink">مسیرها</h2>
            <JourneyCard
              journey={journeys[journeys.length - 1]}
              title="سریع‌ترین"
              selected={active === journeys.length - 1}
              onSelect={() => {
                setActive(journeys.length - 1);
                setFrameKey(`pick-${Date.now()}`);
              }}
            />
            {journeys.length > 1 && (
              <JourneyCard
                journey={journeys[0]}
                title="کمترین تعویض"
                selected={active === 0}
                onSelect={() => {
                  setActive(0);
                  setFrameKey(`pick-${Date.now()}`);
                }}
              />
            )}
            {journeys.slice(1, -1).map((journey, index) => {
              const real = index + 1;
              return (
                <JourneyCard
                  key={real}
                  journey={journey}
                  title="گزینه دیگر"
                  selected={active === real}
                  onSelect={() => {
                    setActive(real);
                    setFrameKey(`pick-${Date.now()}`);
                  }}
                />
              );
            })}
          </section>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          زمان سوار شدن، انتظار و رسیدن از جدول قطار است. توقف در ایستگاه در منبع نیست و صفر فرض شده. تعویض خط تخمینی است، مگر خودتان برای یک ایستگاه تنظیم کرده باشید.
        </p>
      </div>
      <div className="order-1 lg:sticky lg:top-3 lg:order-2">
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-2">
          <span className="text-xs font-semibold text-ink">نوع نقشه</span>
          <div className="flex rounded-lg bg-bg p-1">
            <button type="button" onClick={() => changeMapMode("schematic")} aria-pressed={mapMode === "schematic"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mapMode === "schematic" ? "bg-ink text-surface shadow-sm" : "text-muted"}`}>نقشه خطوط مترو</button>
            <button type="button" onClick={() => changeMapMode("geographic")} aria-pressed={mapMode === "geographic"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mapMode === "geographic" ? "bg-ink text-surface shadow-sm" : "text-muted"}`}>نقشه جغرافیایی</button>
          </div>
        </div>
        <MetroMap from={from} to={to} highlight={highlight} frameKey={frameKey} frameIds={frameIds} onSet={choose} mapMode={mapMode} />
      </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  open,
  options,
  selected,
  line,
  onFocus,
  onChange,
  onPick,
  onLine,
}: {
  label: string;
  value: string;
  open: boolean;
  options: number[];
  selected: number | null;
  line: string | null;
  onFocus: () => void;
  onChange: (value: string) => void;
  onPick: (id: number) => void;
  onLine: (line: string | null) => void;
}) {
  const lines = selected == null ? [] : DATA.stations[selected][1];
  return (
    <div className="relative block text-xs text-muted">
      {label}
      <input
        value={value}
        placeholder="نام ایستگاه"
        autoComplete="off"
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none"
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-line bg-surface shadow-md">
          {options.length === 0 && <p className="px-3 py-2 text-sm text-muted">در جدول زمان‌بندی پیدا نشد.</p>}
          {options.map((id) => (
            <button
              key={id}
              type="button"
              className="flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-right text-sm text-ink last:border-0"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(id)}
            >
              <span>{DATA.stations[id][0]}</span>
              <span className="flex gap-1">
                {DATA.stations[id][1].map((item) => (
                  <i key={item} className="size-2 rounded-full" style={{ background: lineColor(item) }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      )}
      {lines.length > 1 && (
        <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
          خط در این تقاطع:
          <button type="button" className={`rounded-full border px-2 py-0.5 ${line == null ? "border-ink bg-ink text-surface" : "border-line"}`} onClick={() => onLine(null)}>
            هر خط
          </button>
          {lines.map((item) => (
            <button
              key={item}
              type="button"
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${line === item ? "border-ink bg-ink text-surface" : "border-line"}`}
              onClick={() => onLine(item)}
            >
              <i className="size-2 rounded-full" style={{ background: lineColor(item) }} />
              {faNum(item)}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function JourneyCard({
  journey,
  title,
  selected,
  onSelect,
}: {
  journey: Journey;
  title: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`mb-2 w-full rounded-xl border p-3 text-right ${selected ? "border-accent bg-bg" : "border-line bg-surface"}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-sm font-bold text-ink">{title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {faNum(journey.transfers)} تعویض · انتظار {faNum(journey.wait)} دقیقه · تعویض {faNum(journey.walk)} دقیقه
            {journey.est ? " · تخمینی" : ""}
          </span>
        </span>
        <span className="text-left">
          <span className="block text-lg font-bold text-accent">{formatClock(journey.arrive)}</span>
          <span className="block text-xs text-muted">{faNum(journey.total)} دقیقه</span>
        </span>
      </span>
      <span className="mt-2 block space-y-1">
        {journey.legs.map((leg, index) => (
          <span key={`${leg.route}-${leg.dep}-${index}`} className="block border-s-4 ps-2 text-xs text-ink" style={{ borderColor: lineColor(leg.line) }}>
            {index > 0 && (
              <span className="mb-1 block text-muted">
                تعویض در {DATA.stations[leg.from][0]} · {faNum(leg.walk ?? 0)} دقیقه{leg.walkEst ? " تخمینی" : ""}
              </span>
            )}
            خط {faNum(leg.line)}
            {BRANCH[leg.route] ? ` · ${BRANCH[leg.route]}` : ""} به سمت {leg.term}
            {leg.exp ? " · تندرو" : ""}
            <span className="mt-0.5 block text-muted">
              {formatClock(leg.dep)} از {DATA.stations[leg.from][0]} تا {formatClock(leg.arr)} در {DATA.stations[leg.to][0]} · انتظار {faNum(leg.wait)} دقیقه
            </span>
          </span>
        ))}
      </span>
      {journey.u && (
        <span className="mt-2 block rounded-lg bg-warn-bg px-2 py-1 text-xs text-warn">
          نوع روز قطارهای پرند–شاهد در منبع مشخص نیست و برای همه روزها به صورت تخمینی آمده است.
        </span>
      )}
    </button>
  );
}
