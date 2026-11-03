import coords from "./coords.json";
import raw from "./timetable.json";
import type { MetroData } from "@/lib/metro/engine";

export const DATA = raw as unknown as MetroData;
export const COORDS = coords as [number, number][];
