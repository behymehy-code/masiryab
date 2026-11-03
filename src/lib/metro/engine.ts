export type Station = [string, string[]];
export type Trip = [number, number, number, number, number[]];

export type MetroData = {
  stations: Station[];
  routes: string[];
  orders: Record<string, number[]>;
  trips: Trip[];
};

export type PlanInput = {
  from: number;
  to: number;
  day: number;
  dep: number;
  def: number;
  over?: Record<number, number>;
  fromLine?: string | null;
  toLine?: string | null;
};

export type Leg = {
  route: string;
  line: string;
  term: string;
  exp: boolean;
  from: number;
  to: number;
  dep: number;
  arr: number;
  stops: [number, number][];
  rdy: number;
  wait: number;
  walk?: number;
  walkEst?: boolean;
};

export type Journey = {
  legs: Leg[];
  transfers: number;
  total: number;
  arrive: number;
  wait: number;
  walk: number;
  est: boolean;
  u: boolean;
};

const INF = 1e9;
const MAX_RIDES = 5;

export function lineOf(route: string) {
  return route.replace(/\D/g, "");
}

export function norm(value: string) {
  return String(value).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\s()ـ]/g, "");
}

export function searchStations(data: MetroData, query: string, line?: string) {
  const q = norm(query);
  const names = data.stations.map((station) => norm(station[0]));
  return data.stations
    .map((_, index) => index)
    .filter((index) => {
      const onLine = !line || data.stations[index][1].includes(line);
      const matches = !q || names[index].includes(q);
      return onLine && matches;
    })
    .sort((a, b) => {
      const prefix = (names[a].startsWith(q) ? 0 : 1) - (names[b].startsWith(q) ? 0 : 1);
      return prefix || a - b;
    });
}

export function plan(data: MetroData, input: PlanInput): Journey[] {
  const stations = data.stations;
  const routes = data.routes;
  const trips = data.trips.filter((trip) => trip[1] & input.day);
  const count = stations.length;
  const transfer = (station: number) =>
    input.over && input.over[station] != null ? input.over[station] : input.def;

  const arr: number[][] = [new Array(count).fill(INF)];
  const lab: ({ ti: number; bi: number; ai: number; rdy: number } | null)[][] = [
    new Array(count).fill(null),
  ];
  const best = new Array<number>(count).fill(INF);
  arr[0][input.from] = input.dep;
  best[input.from] = input.dep;
  const results: Journey[] = [];
  let prevBest = INF;

  const build = (rides: number): Journey => {
    const legs: Leg[] = [];
    let station = input.to;
    let ride = rides;
    while (station !== input.from) {
      while (!lab[ride][station]) ride -= 1;
      const label = lab[ride][station]!;
      const trip = trips[label.ti];
      const stopsFlat = trip[4];
      const stops: [number, number][] = [];
      for (let index = label.bi; index <= label.ai; index += 2) {
        stops.push([stopsFlat[index], stopsFlat[index + 1]]);
      }
      legs.unshift({
        route: routes[trip[0]],
        line: lineOf(routes[trip[0]]),
        term: stations[trip[2]][0],
        exp: !!trip[3],
        from: stopsFlat[label.bi],
        to: station,
        dep: stopsFlat[label.bi + 1],
        arr: stopsFlat[label.ai + 1],
        stops,
        rdy: label.rdy,
        wait: 0,
      });
      station = stopsFlat[label.bi];
      ride -= 1;
    }

    let wait = 0;
    let walk = 0;
    let est = false;
    legs.forEach((leg, index) => {
      if (index) {
        const minutes = transfer(leg.from);
        leg.walk = minutes;
        leg.walkEst = !(input.over && input.over[leg.from] != null);
        walk += minutes;
        est = est || !!leg.walkEst;
      }
      leg.wait = leg.dep - (index ? legs[index - 1].arr + (leg.walk ?? 0) : input.dep);
      wait += leg.wait;
    });

    return {
      legs,
      transfers: legs.length - 1,
      total: legs[legs.length - 1].arr - input.dep,
      arrive: legs[legs.length - 1].arr,
      wait,
      walk,
      est,
      u: legs.some((leg) => leg.route === "1P"),
    };
  };

  for (let rides = 1; rides <= MAX_RIDES; rides += 1) {
    const arrival = arr[rides - 1].slice();
    const labels = new Array<(typeof lab)[number][number]>(count).fill(null);
    for (let tripIndex = 0; tripIndex < trips.length; tripIndex += 1) {
      const trip = trips[tripIndex];
      const stops = trip[4];
      const line = lineOf(routes[trip[0]]);
      let board = -1;
      let ready = 0;
      for (let index = 0; index < stops.length; index += 2) {
        const station = stops[index];
        const minute = stops[index + 1];
        if (
          board >= 0 &&
          minute < best[station] &&
          !(station === input.to && input.toLine && line !== input.toLine)
        ) {
          arrival[station] = minute;
          best[station] = minute;
          labels[station] = { ti: tripIndex, bi: board, ai: index, rdy: ready };
        }
        if (board < 0 && arr[rides - 1][station] < INF) {
          const readyAt = arr[rides - 1][station] + (station === input.from ? 0 : transfer(station));
          const wrongOrigin =
            rides === 1 && station === input.from && input.fromLine && line !== input.fromLine;
          const reboardOrigin = station === input.from && rides > 1;
          if (readyAt <= minute && !wrongOrigin && !reboardOrigin) {
            board = index;
            ready = readyAt;
          }
        }
      }
    }
    arr.push(arrival);
    lab.push(labels);
    if (arrival[input.to] < prevBest) {
      prevBest = arrival[input.to];
      results.push(build(rides));
    }
  }

  return results;
}
