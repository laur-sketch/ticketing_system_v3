import { DateTime } from "luxon";
import { DEFAULT_TIME_ZONE } from "@/lib/kpi-recurrence";

export const PHILIPPINE_TIME_ZONE = DEFAULT_TIME_ZONE;

export function philippineDateTimeFromEpoch(epochMs: number): DateTime {
  return DateTime.fromMillis(epochMs, { zone: PHILIPPINE_TIME_ZONE });
}

export function formatPhilippineClock(epochMs: number): {
  time: string;
  date: string;
  timeZoneLabel: string;
} {
  const dt = philippineDateTimeFromEpoch(epochMs);
  return {
    time: dt.toFormat("h:mm:ss a"),
    date: dt.toFormat("EEE, MMM d, yyyy"),
    timeZoneLabel: "PHT",
  };
}

export function formatPhilippineWidgetClock(epochMs: number): {
  hours: string;
  minutes: string;
  seconds: string;
  dayOfWeek: string;
  dayNumber: string;
  month: string;
  timeZoneLabel: string;
  ariaLabel: string;
} {
  const dt = philippineDateTimeFromEpoch(epochMs);
  const hours = dt.toFormat("HH");
  const minutes = dt.toFormat("mm");
  const seconds = dt.toFormat("ss");
  const dayOfWeek = dt.toFormat("ccc").toUpperCase();
  const dayNumber = dt.toFormat("d");
  const month = dt.toFormat("LLL").toUpperCase();
  const date = dt.toFormat("EEE, MMM d, yyyy");
  return {
    hours,
    minutes,
    seconds,
    dayOfWeek,
    dayNumber,
    month,
    timeZoneLabel: "PHT",
    ariaLabel: `Time ${hours}:${minutes}:${seconds}, ${date}`,
  };
}

export function formatPhilippineBarClock(epochMs: number): {
  hours: string;
  minutes: string;
  seconds: string;
  ariaLabel: string;
} {
  const dt = philippineDateTimeFromEpoch(epochMs);
  const hours = dt.toFormat("HH");
  const minutes = dt.toFormat("mm");
  const seconds = dt.toFormat("ss");
  return {
    hours,
    minutes,
    seconds,
    ariaLabel: `Time ${hours}:${minutes}:${seconds}`,
  };
}
