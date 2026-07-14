export function startOfChinaDayIso(date = new Date()) {
  const chinaOffsetMs = 8 * 60 * 60 * 1000;
  const chinaNow = new Date(date.getTime() + chinaOffsetMs);

  const startChina = Date.UTC(
    chinaNow.getUTCFullYear(),
    chinaNow.getUTCMonth(),
    chinaNow.getUTCDate(),
    0,
    0,
    0,
    0
  );

  return new Date(startChina - chinaOffsetMs).toISOString();
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatFenToYuan(amountFen: number) {
  return `¥${(amountFen / 100).toFixed(2)}`;
}

export function createOrderNo() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function toPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
