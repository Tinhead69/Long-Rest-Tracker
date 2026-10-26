const ID = "long-rest-tracker";
const CALENDARS = ["foundryvtt-simple-calendar", "foundryvtt-simple-calendar-reborn"];

function clockError(key, uncertain = false) {
  const error = new Error(game.i18n.localize(`LRT.${key}`));
  error.userMessage = error.message;
  error.clockMayHaveAdvanced = uncertain;
  return error;
}

function provider() {
  const choice = game.settings.get(ID, "clockSource") || "auto";
  if (choice === "native") return null;
  const active = CALENDARS.filter(id => game.modules?.get(id)?.active);
  if (active.length > 1) throw clockError("ClockMultipleCalendars");
  if (choice === "auto" && !active.length) return null;
  const id = choice === "auto" ? active[0] : choice;
  if (!CALENDARS.includes(id) || !active.includes(id)) throw clockError("ClockUnavailable");
  // Both upstream projects publish the same documented global API.
  const api = globalThis.SimpleCalendar?.api;
  if (typeof api?.getCurrentCalendar !== "function") throw clockError("ClockUnavailable");
  return {api, calendar: api.getCurrentCalendar()};
}

export function calendarUnits() {
  const external = provider();
  if (external) {
    const time = external.calendar?.time;
    const minute = time?.secondsInMinute, hour = minute * time?.minutesInHour, day = hour * time?.hoursInDay;
    if (![minute, hour, day].every(value => Number.isFinite(value) && value > 0)) throw clockError("ClockInvalidUnits");
    return {minute, hour, day};
  }
  const calendar = game.time.calendar;
  if (typeof calendar?.componentsToTime === "function") {
    const minute = calendar.componentsToTime({minute: 1}), hour = calendar.componentsToTime({hour: 1}), day = calendar.componentsToTime({day: 1});
    if (![minute, hour, day].every(value => Number.isFinite(value) && value > 0)) throw clockError("ClockInvalidUnits");
    return {minute, hour, day};
  }
  // The world clock can exist without a configured CalendarData instance.
  return {minute: 60, hour: 3600, day: 86400};
}

export function hoursToSeconds(hours) {
  if (!Number.isFinite(hours) || hours < 0) throw clockError("ClockInvalidUnits");
  return hours * calendarUnits().hour;
}

export function formatTimestamp(time) {
  const external = provider();
  if (external) {
    const display = external.api.timestampToDate?.(time)?.display;
    if (display?.date && display?.time) return `${display.date} ${display.time}`;
  } else if (typeof game.time.calendar?.format === "function") {
    return game.time.calendar.format(time, "timestamp");
  }
  return game.i18n.format("LRT.ClockWorldSeconds", {seconds: time});
}

/** Validate before claiming the party advance. Call the returned operation once. */
export function prepareClockAdvance(hours) {
  if (!game.user.isGM) throw clockError("ClockGMOnly");
  const external = provider(), seconds = hoursToSeconds(hours);
  if (!Number.isFinite(seconds) || seconds <= 0) throw clockError("ClockInvalidUnits");
  if (!Number.isFinite(game.time.worldTime) || !Number.isFinite(game.time.worldTime + seconds)) throw clockError("ClockInvalidTime");
  if (!external) return () => game.time.advance(seconds);
  const {api, calendar} = external;
  const mode = calendar?.generalSettings?.gameWorldTimeIntegration;
  if (!["self", "mixed", "third-party"].includes(mode)) throw clockError("ClockIntegrationRequired");
  // Mixed and third-party modes subscribe to updateWorldTime themselves. Updating
  // both APIs would advance twice. Keep all stored rest flags on world-time seconds.
  if (mode !== "self") return () => game.time.advance(seconds);
  if (typeof api.changeDate !== "function" || typeof api.timestamp !== "function") throw clockError("ClockUnavailable");
  const calendarTime = api.timestamp();
  if (!Number.isFinite(calendarTime) || Math.abs(calendarTime - game.time.worldTime) > 1) throw clockError("ClockNotSynchronized");
  // Calendar-authority mode ignores external world-time changes. Its public API
  // initiates an asynchronous world-clock sync; its boolean return is not readiness.
  return () => new Promise((resolve, reject) => {
    const target = game.time.worldTime + seconds;
    let hook, timer, settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      Hooks.off("updateWorldTime", hook);
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    hook = Hooks.on("updateWorldTime", worldTime => {
      if (Math.abs(worldTime - target) <= 1) finish();
    });
    timer = setTimeout(() => finish(clockError("ClockSyncUncertain", true)), 10000);
    try {
      if (api.changeDate({hour: hours}) !== true) finish(clockError("ClockChangeRejected"));
      else if (Math.abs(game.time.worldTime - target) <= 1) finish();
    } catch {
      // The calendar may have changed before its API threw. Never retry via core.
      finish(clockError("ClockSyncUncertain", true));
    }
  });
}
