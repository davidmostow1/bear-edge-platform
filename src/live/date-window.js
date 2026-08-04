const DEFAULT_TIME_ZONE = "America/New_York";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseDateString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));

  if (!match) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Date must be a valid calendar date in YYYY-MM-DD format.");
  }

  return { year, month, day };
}

function addCalendarDays(dateString, days) {
  const { year, month, day } = parseDateString(dateString);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function dateStringForInstant(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const instant = now instanceof Date ? now : new Date(now);

  if (!Number.isFinite(instant.getTime())) {
    throw new Error("now must be a valid date or timestamp.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function resolveDateWindow(options = {}) {
  const requestedDate = options.date ?? "today";
  const days = Number.isInteger(options.days) && options.days > 0 ? Math.min(options.days, 7) : 2;
  const timeZone = options.timeZone ?? process.env.BEAR_EDGE_TIME_ZONE ?? DEFAULT_TIME_ZONE;
  let startDate;

  if (requestedDate === "today" || requestedDate === "tomorrow") {
    const today = dateStringForInstant(options.now ?? new Date(), timeZone);
    startDate = requestedDate === "tomorrow" ? addCalendarDays(today, 1) : today;
  } else {
    startDate = String(requestedDate);
  }

  parseDateString(startDate);

  return Array.from({ length: days }, (_, index) => addCalendarDays(startDate, index));
}

module.exports = {
  DEFAULT_TIME_ZONE,
  addCalendarDays,
  dateStringForInstant,
  parseDateString,
  resolveDateWindow
};
