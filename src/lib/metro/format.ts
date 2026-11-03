const DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function faNum(value: number | string) {
  return String(value).replace(/\d/g, (digit) => DIGITS[Number(digit)] ?? digit);
}

export function formatClock(minute: number) {
  const clock = `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return faNum(clock) + (minute >= 1440 ? " ⁺¹" : "");
}

export function lineColor(line: string) {
  return `var(--color-line-${line})`;
}

export const BRANCH: Record<string, string> = {
  "1P": "انشعاب پرند",
  "4A": "انشعاب مهرآباد",
  "5H": "انشعاب هشتگرد",
};

export const DAY_OPTIONS = [
  { value: 1, label: "شنبه تا چهارشنبه" },
  { value: 2, label: "پنجشنبه" },
  { value: 4, label: "جمعه و تعطیل" },
] as const;
