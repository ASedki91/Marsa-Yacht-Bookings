const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function getZonedParts(instant: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new Error("Invalid IANA time zone");
  }
}

export function tripStartToUtc(
  bookingDate: string,
  startTime: string,
  timeZone: string,
): Date {
  assertValidTimeZone(timeZone);
  const dateMatch = DATE_PATTERN.exec(bookingDate);
  const timeMatch = TIME_PATTERN.exec(startTime);
  if (!dateMatch || !timeMatch) throw new Error("Invalid booking date or start time");

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] ?? 0),
  };

  const targetAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );

  let candidateMs = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getZonedParts(new Date(candidateMs), timeZone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const difference = representedAsUtc - targetAsUtc;
    if (difference === 0) break;
    candidateMs -= difference;
  }

  const candidate = new Date(candidateMs);
  const verified = getZonedParts(candidate, timeZone);
  if (
    verified.year !== target.year ||
    verified.month !== target.month ||
    verified.day !== target.day ||
    verified.hour !== target.hour ||
    verified.minute !== target.minute ||
    verified.second !== target.second
  ) {
    throw new Error("Trip time does not exist in the selected time zone");
  }
  return candidate;
}

export function remainingWholeMinutes(tripStartsAt: Date, requestedAt: Date): number {
  return Math.floor((tripStartsAt.getTime() - requestedAt.getTime()) / 60_000);
}
