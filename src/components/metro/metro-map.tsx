import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COORDS, DATA } from "@/data/metro";
import { lineOf } from "@/lib/metro/engine";
import { faNum, lineColor } from "@/lib/metro/format";

const COS = Math.cos((35.74 * Math.PI) / 180);
const LINES = ["1", "2", "3", "4", "5", "6", "7"];

type View = { cx: number; cy: number; k: number };
type Pt = { id: number; x: number; y: number };

const PRESETS = [
  { id: "city", label: "تهران", lat: [35.56, 35.815] as [number, number], lon: [51.23, 51.53] as [number, number] },
  { id: "karaj", label: "کرج", lat: [35.79, 35.97] as [number, number], lon: [50.7, 51.22] as [number, number] },
  { id: "parand", label: "پرند", lat: [35.45, 35.6] as [number, number], lon: [50.95, 51.36] as [number, number] },
];

function project(lat: number, lon: number) {
  return { x: lon * COS, y: -lat };
}

export type Highlight = { route: string; ids: number[] };

type Props = {
  from: number | null;
  to: number | null;
  highlight: Highlight[];
  frameKey: string;
  frameIds: number[] | null;
  onSet: (role: "from" | "to", id: number, line: string | null) => void;
  mapMode: "schematic" | "geographic";
};

export function MetroMap({ from, to, highlight, frameKey, frameIds, onSet, mapMode }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [pickedLine, setPickedLine] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const moved = useRef(false);
  const drag = useRef({
    x: 0,
    y: 0,
    moved: 0,
    cx: 0,
    cy: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    pinch: 0,
  });

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitBox = (lat: [number, number], lon: [number, number], pad = 28) => {
    const node = host.current;
    const w = node?.clientWidth || size.w;
    const h = node?.clientHeight || size.h;
    if (w < 20 || h < 20) return;
    const a = project(lat[0], lon[0]);
    const b = project(lat[1], lon[1]);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const k = Math.min((w - pad * 2) / Math.max(maxX - minX, 0.002), (h - pad * 2) / Math.max(maxY - minY, 0.002));
    setView({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, k });
  };

  const fitIds = (ids: number[]) => {
    const pts = ids.map((id) => COORDS[id]).filter(Boolean);
    if (!pts.length) return;
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.35, 0.015);
    const padLon = Math.max((Math.max(...lons) - Math.min(...lons)) * 0.35, 0.015);
    fitBox(
      [Math.min(...lats) - padLat, Math.max(...lats) + padLat],
      [Math.min(...lons) - padLon, Math.max(...lons) + padLon],
      40,
    );
  };

  useEffect(() => {
    if (size.w < 20) return;
    if (frameIds && frameIds.length) {
      fitIds(frameIds);
      return;
    }
    if (!moved.current) fitBox(PRESETS[0].lat, PRESETS[0].lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, size.w, size.h]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest("[data-pop]")) return;
      event.preventDefault();
      moved.current = true;
      const rect = node.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const factor = event.deltaY > 0 ? 0.88 : 1.14;
      setView((current) => (current ? zoomAt(current, sx, sy, factor, size) : current));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [size]);

  const points: Pt[] = useMemo(() => {
    if (!view || size.w < 20) return [];
    return DATA.stations.map((_, id) => {
      const [lat, lon] = COORDS[id];
      const p = project(lat, lon);
      return {
        id,
        x: (p.x - view.cx) * view.k + size.w / 2,
        y: (p.y - view.cy) * view.k + size.h / 2,
      };
    });
  }, [view, size]);

  const hit = (x: number, y: number) => {
    let best = -1;
    let dist = 18;
    for (const point of points) {
      if (only && !DATA.stations[point.id][1].includes(only)) continue;
      const d = Math.hypot(point.x - x, point.y - y);
      if (d < dist) {
        dist = d;
        best = point.id;
      }
    }
    return best;
  };

  const localPoint = (event: React.PointerEvent) => {
    const rect = host.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("[data-pop],button")) return;
    host.current?.setPointerCapture(event.pointerId);
    drag.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    drag.current.moved = 0;
    drag.current.cx = view?.cx ?? 0;
    drag.current.cy = view?.cy ?? 0;
    if (drag.current.pointers.size === 2) {
      const [a, b] = [...drag.current.pointers.values()];
      drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current.pointers.has(event.pointerId) || !view) {
      if (drag.current.pointers.size === 0) {
        const p = localPoint(event);
        setHover(hit(p.x, p.y));
      }
      return;
    }
    drag.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (drag.current.pointers.size >= 2 && drag.current.pinch > 0) {
      const [a, b] = [...drag.current.pointers.values()];
      const next = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = host.current!.getBoundingClientRect();
      const factor = next / drag.current.pinch;
      drag.current.pinch = next;
      drag.current.moved += 20;
      moved.current = true;
      setView((current) =>
        current ? zoomAt(current, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, factor, size) : current,
      );
      return;
    }
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current.moved += Math.hypot(dx, dy);
    if (drag.current.moved > 4) moved.current = true;
    setView({ cx: drag.current.cx - dx / view.k, cy: drag.current.cy - dy / view.k, k: view.k });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const wasDrag = drag.current.moved > 6;
    drag.current.pointers.delete(event.pointerId);
    if ((event.target as HTMLElement).closest("[data-pop]")) return;
    if (wasDrag || drag.current.pointers.size > 0) return;
    const p = localPoint(event);
    const id = hit(p.x, p.y);
    if (id < 0) {
      setPicked(null);
      return;
    }
    const lines = DATA.stations[id][1];
    setPicked(id);
    setPickedLine(lines.length === 1 ? lines[0] : only && lines.includes(only) ? only : null);
  };

  const labels = placeLabels(points, size, { from, to, hover, picked, highlight, only });
  const pop = picked == null ? null : points[picked];
  const popLines = picked == null ? [] : DATA.stations[picked][1];
  const activeRoutes = new Set(highlight.map((item) => item.route));

  const pathOf = (ids: number[]) => {
    const visible = ids.map((id) => points[id]).filter(Boolean);
    if (!visible.length) return "";
    let d = `M${visible[0].x.toFixed(1)} ${visible[0].y.toFixed(1)}`;
    for (let index = 1; index < visible.length; index++) {
      const previous = visible[index - 1];
      const current = visible[index];
      if (mapMode === "schematic") {
        const dx = Math.abs(current.x - previous.x);
        const dy = Math.abs(current.y - previous.y);
        if (dx > 12 && dy > 12) {
          const bendX = (previous.x + current.x) / 2;
          d += ` L${bendX.toFixed(1)} ${previous.y.toFixed(1)} L${bendX.toFixed(1)} ${current.y.toFixed(1)}`;
        }
      }
      d += ` L${current.x.toFixed(1)} ${current.y.toFixed(1)}`;
    }
    return d;
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">انتخاب از روی نقشه</h2>
        <div className="flex flex-wrap gap-1">
          {mapMode === "geographic" && PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="rounded-full border border-line bg-bg px-2.5 py-1 text-xs text-ink"
              onClick={() => {
                moved.current = true;
                fitBox(preset.lat, preset.lon);
              }}
            >
              {preset.label}
            </button>
          ))}
          {mapMode === "geographic" && <button
            type="button"
            className="rounded-full border border-line bg-bg px-2.5 py-1 text-xs text-ink"
            onClick={() => {
              moved.current = true;
              const lats = COORDS.map((c) => c[0]);
              const lons = COORDS.map((c) => c[1]);
              fitBox([Math.min(...lats), Math.max(...lats)], [Math.min(...lons), Math.max(...lons)], 20);
            }}
          >
            همه
          </button>}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {LINES.map((line) => (
          <button
            key={line}
            type="button"
            onClick={() => setOnly((current) => (current === line ? null : line))}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${only === line ? "border-ink bg-ink text-surface" : "border-line bg-bg text-ink"}`}
          >
            <i className="size-2 rounded-full" style={{ background: lineColor(line) }} />
            {faNum(line)}
          </button>
        ))}
      </div>
      <div
        ref={host}
        className={`relative h-64 touch-none overflow-hidden rounded-xl border border-line sm:h-72 lg:h-80 ${mapMode === "schematic" ? "bg-[#f4f0e8]" : "bg-bg"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg className="absolute inset-0 h-full w-full">
          {DATA.routes.map((route) => {
            const line = lineOf(route);
            if (only && line !== only) return null;
            const d = pathOf(DATA.orders[route]);
            const dim = activeRoutes.size > 0 && !activeRoutes.has(route);
            return (
              <g key={route} opacity={dim ? 0.2 : 1}>
                <path d={d} fill="none" stroke={mapMode === "schematic" ? "#f4f0e8" : "var(--color-bg)"} strokeWidth={mapMode === "schematic" ? 9 : 7} strokeLinejoin="round" strokeLinecap="round" />
                <path d={d} fill="none" stroke={lineColor(line)} strokeWidth={mapMode === "schematic" ? 4.5 : 3.25} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {highlight.map((item) => (
            <path
              key={`${item.route}-${item.ids[0]}-${item.ids.at(-1)}`}
              d={pathOf(item.ids)}
              fill="none"
              stroke={lineColor(lineOf(item.route))}
              strokeWidth={5.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {points.map((point) => {
            const lines = DATA.stations[point.id][1];
            if (only && !lines.includes(only)) return null;
            if (point.x < -20 || point.y < -20 || point.x > size.w + 20 || point.y > size.h + 20) return null;
            const interchange = lines.length > 1;
            return (
              <circle
                key={point.id}
                cx={point.x}
                cy={point.y}
                r={interchange ? (mapMode === "schematic" ? 6 : 4.5) : (mapMode === "schematic" ? 4.5 : 3.2)}
                fill={interchange ? "var(--color-surface)" : lineColor(lines[0])}
                stroke={interchange ? "var(--color-ink)" : "var(--color-surface)"}
                strokeWidth={interchange ? 1.7 : 1.2}
              />
            );
          })}
          {from != null && points[from] && (
            <circle cx={points[from].x} cy={points[from].y} r={8} fill="none" stroke="var(--color-origin)" strokeWidth={2.5} />
          )}
          {to != null && points[to] && (
            <circle cx={points[to].x} cy={points[to].y} r={8} fill="none" stroke="var(--color-dest)" strokeWidth={2.5} />
          )}
        </svg>
        {labels.map((label) => (
          <span
            key={label.id}
            className="pointer-events-none absolute z-10 max-w-36 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-line bg-surface/95 px-1.5 py-0.5 text-xs leading-none text-ink"
            style={{ left: label.x, top: label.y }}
          >
            {DATA.stations[label.id][0]}
          </span>
        ))}
        {pop && picked != null && (
          <div
            data-pop
            className="absolute z-20 w-52 rounded-xl border border-line bg-surface p-2 shadow-md"
            style={popoverStyle(pop.x, pop.y, size)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-bold leading-snug text-ink">{DATA.stations[picked][0]}</p>
            {popLines.length > 1 && (
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className={`rounded-full border px-2 py-1 text-xs ${pickedLine == null ? "border-ink bg-ink text-surface" : "border-line text-ink"}`}
                  onClick={() => setPickedLine(null)}
                >
                  هر خط
                </button>
                {popLines.map((line) => (
                  <button
                    key={line}
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${pickedLine === line ? "border-ink bg-ink text-surface" : "border-line text-ink"}`}
                    onClick={() => setPickedLine(line)}
                  >
                    <i className="size-2 rounded-full" style={{ background: lineColor(line) }} />
                    {faNum(line)}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button
                type="button"
                className="rounded-lg bg-origin px-2 py-2 text-xs font-bold text-surface"
                onClick={() => onSet("from", picked, popLines.length > 1 ? pickedLine : popLines[0])}
              >
                مبدأ
              </button>
              <button
                type="button"
                className="rounded-lg bg-dest px-2 py-2 text-xs font-bold text-surface"
                onClick={() => onSet("to", picked, popLines.length > 1 ? pickedLine : popLines[0])}
              >
                مقصد
              </button>
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-2 z-10 flex gap-1">
          <button
            type="button"
            aria-label="بزرگ‌نمایی"
            className="rounded-lg border border-line bg-surface p-2 text-ink"
            onClick={() => {
              moved.current = true;
              setView((current) => (current ? { ...current, k: Math.min(current.k * 1.35, 60000) } : current));
            }}
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            aria-label="کوچک‌نمایی"
            className="rounded-lg border border-line bg-surface p-2 text-ink"
            onClick={() => {
              moved.current = true;
              setView((current) => (current ? { ...current, k: Math.max(current.k / 1.35, 280) } : current));
            }}
          >
            <Minus className="size-4" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {mapMode === "schematic"
          ? "نمای خطوط مترو با مسیرهای رنگی و ایستگاه‌های قابل انتخاب؛ فاصله‌ها و زاویه‌ها لزوماً مقیاس جغرافیایی ندارند. ایستگاه‌های تقاطعی با دایره توخالی مشخص‌اند."
          : "نقشه جغرافیایی بر اساس مختصات ایستگاه‌هاست. می‌توانید روی نقشه جابه‌جا شوید و بزرگ‌نمایی کنید."} حلقه سبز مبدأ و حلقه قرمز مقصد است.
      </p>
    </section>
  );
}

function zoomAt(view: View, sx: number, sy: number, factor: number, size: { w: number; h: number }): View {
  const k = Math.min(60000, Math.max(280, view.k * factor));
  const wx = (sx - size.w / 2) / view.k + view.cx;
  const wy = (sy - size.h / 2) / view.k + view.cy;
  return { k, cx: wx - (sx - size.w / 2) / k, cy: wy - (sy - size.h / 2) / k };
}

function popoverStyle(x: number, y: number, size: { w: number; h: number }) {
  const width = 208;
  const height = 126;
  let left = x + 12;
  let top = y - 20;
  if (left + width > size.w - 8) left = x - width - 12;
  if (left < 8) left = 8;
  if (top + height > size.h - 8) top = size.h - height - 8;
  if (top < 8) top = 8;
  return { left, top };
}

function placeLabels(
  points: Pt[],
  size: { w: number; h: number },
  mark: { from: number | null; to: number | null; hover: number | null; picked: number | null; highlight: Highlight[]; only: string | null },
) {
  if (!points.length || size.w < 20) return [];
  const onRoute = new Set(mark.highlight.flatMap((item) => item.ids));
  const ranked = points
    .filter((point) => point.x > 8 && point.y > 8 && point.x < size.w - 8 && point.y < size.h - 8)
    .filter((point) => !mark.only || DATA.stations[point.id][1].includes(mark.only))
    .map((point) => {
      const lines = DATA.stations[point.id][1];
      let pri = 8;
      if (point.id === mark.from || point.id === mark.to) pri = 100;
      else if (point.id === mark.hover) pri = 90;
      else if (onRoute.has(point.id)) pri = 60;
      else if (lines.length > 1) pri = 40;
      else if (isTerminal(point.id)) pri = 24;
      return { ...point, pri, name: DATA.stations[point.id][0] };
    })
    .sort((a, b) => b.pri - a.pri);

  const placed: { id: number; x: number; y: number; w: number; h: number }[] = [];
  for (const point of ranked) {
    if (point.id === mark.picked) continue;
    if (placed.length >= 48 && point.pri < 60) continue;
    const boxW = Math.min(144, point.name.length * 7 + 12);
    const boxH = 18;
    const spots = [
      { x: point.x, y: point.y - 13 },
      { x: point.x, y: point.y + 13 },
      { x: point.x + 10 + boxW / 2, y: point.y },
      { x: point.x - 10 - boxW / 2, y: point.y },
    ];
    let chosen: { x: number; y: number } | null = null;
    for (const spot of spots) {
      const left = spot.x - boxW / 2;
      const top = spot.y - boxH / 2;
      const inside = left > 2 && top > 2 && left + boxW < size.w - 2 && top + boxH < size.h - 2;
      const clash = placed.some(
        (other) => Math.abs(other.x - spot.x) < (other.w + boxW) / 2 + 2 && Math.abs(other.y - spot.y) < (other.h + boxH) / 2 + 1,
      );
      if (inside && !clash) {
        chosen = spot;
        break;
      }
    }
    if (!chosen && point.pri >= 90) {
      chosen = {
        x: Math.min(Math.max(point.x, boxW / 2 + 4), size.w - boxW / 2 - 4),
        y: Math.min(Math.max(point.y - 13, boxH / 2 + 4), size.h - boxH / 2 - 4),
      };
    }
    if (chosen) placed.push({ id: point.id, x: chosen.x, y: chosen.y, w: boxW, h: boxH });
  }
  return placed;
}

function isTerminal(id: number) {
  return Object.values(DATA.orders).some((order) => order[0] === id || order[order.length - 1] === id);
}
