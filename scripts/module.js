import { escapeHTML as esc, restStatus, validateCooldown, compactDuration } from "./time.js";
import { calendarUnits, hoursToSeconds, formatTimestamp } from "./clock.js";
import { installShortRestTracking } from "./short-rest.js";

const ID = "long-rest-tracker";
const shortRests = installShortRestTracking();
const longRests = installShortRestTracking({type: "long", hours: 8});
const t = (key, data) => data ? game.i18n.format(`LRT.${key}`, data) : game.i18n.localize(`LRT.${key}`);
const h = (key, data) => esc(t(key, data));
const REST_FLAG = "lastLongRestTime";
const cooldown = () => {
  try { return validateCooldown(game.settings.get(ID, "cooldownHours")); }
  catch { return 24; } // Keep the tracker accessible so the GM can repair the setting.
};
const timestamp = time => esc(formatTimestamp(time));
const tDuration = seconds => compactDuration(seconds, calendarUnits(), { day: t("DayShort"), hour: t("HourShort"), minute: t("MinuteShort") });
const duration = seconds => esc(tDuration(seconds));

function actorsOnScene() {
  const actors = (globalThis.canvas?.tokens?.placeables ?? []).map(token => token.actor)
    .filter(actor => actor?.type === "character" && actor.hasPlayerOwner && actor.testUserPermission(game.user, "OBSERVER"));
  return [...new Map(actors.map(actor => [actor.uuid, actor])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
}

function lastRest(actor) {
  // Keep legacy macro records readable; the first new record takes precedence.
  return actor.getFlag(ID, REST_FLAG) ?? actor.getFlag("world", REST_FLAG);
}

async function report(content) {
  return ChatMessage.create({ content: `<div class="long-rest-tracker">${content}</div>`, whisper: [game.user.id] });
}

const recordingQueues = new Map();
function saveRest(actor, time) {
  const key = actor.uuid;
  const previous = recordingQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (!actor.isOwner) throw new Error("Actor ownership was revoked.");
    await actor.setFlag(ID, REST_FLAG, time);
  });
  recordingQueues.set(key, next);
  return next.finally(() => { if (recordingQueues.get(key) === next) recordingQueues.delete(key); });
}

async function record(actors) {
  const now = game.time.worldTime;
  if (!Number.isFinite(now)) throw new Error("Invalid world time.");
  const recorded = [];
  const failed = [];
  for (const actor of actors) {
    if (!actor.isOwner) { failed.push(actor.name); continue; }
    try {
      await saveRest(actor, now);
      recorded.push(actor);
    } catch (error) {
      console.error(`${ID} | Failed to record ${actor.uuid}`, error);
      failed.push(actor.name);
    }
  }
  if (recorded.length) {
    try { await report(`<h2>${h("Recorded")}</h2><p>${timestamp(now)}</p><ul>${recorded.map(a => `<li>${esc(a.name)}</li>`).join("")}</ul>`); }
    catch (error) {
      console.error(`${ID} | Recording saved, but report failed`, error);
      ui.notifications.warn(t("ReportFailed"));
    }
  }
  if (failed.length) ui.notifications.warn(t("RecordFailed", { names: failed.join(", ") }));
  return recorded.length;
}

async function check(actors) {
  const now = game.time.worldTime;
  const seconds = hoursToSeconds(cooldown());
  const rows = actors.map(actor => {
    const last = lastRest(actor);
    const status = restStatus(now, last, seconds);
    let when = h("NotRecorded"), eligible = h("Unknown"), remaining = "—";
    if (status.state === "future") {
      when = h("Future");
      eligible = `<span title="${h("Rewound")}">${h("Unknown")}</span>`;
    } else if (status.state !== "unknown") {
      when = h("Ago", { duration: tDuration(status.elapsed) });
      eligible = status.state === "ready" ? `🟢 ${h("Yes")}` : status.remaining <= hoursToSeconds(4) ? `🟡 ${h("No")}` : `🔴 ${h("No")}`;
      if (status.state === "waiting") remaining = duration(status.remaining);
    }
    return `<tr><td class="lrt-name"><strong>${esc(actor.name)}</strong><span class="lrt-last-rest">${when}</span></td><td><span class="lrt-badge lrt-${status.state}">${eligible}</span></td><td class="lrt-remaining">${remaining}</td></tr>`;
  }).join("");
  await report(`<h2>${h("Status")}</h2><p class="lrt-summary">${h("CooldownSummary", { hours: cooldown() })}</p><table class="lrt-status-table"><thead><tr><th>${h("Character")}</th><th>${h("StatusShort")}</th><th>${h("ReadyIn")}</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function selectActors(action) {
  if (action === "record" && !game.user.isGM) return ui.notifications.warn(t("RecordGMOnly"));
  const actors = actorsOnScene().filter(actor => action !== "record" || actor.isOwner);
  if (!actors.length) return ui.notifications.warn(t("NoActors"));
  const label = action === "record" ? t("Record") : t("Check");
  return new foundry.applications.api.DialogV2({
    window: { title: label }, classes: ["long-rest-tracker"],
    content: `<p>${h("Select")}</p>${actors.map((actor, index) => `<label class="lrt-character"><input type="checkbox" name="actor" value="${index}" checked> ${esc(actor.name)}</label>`).join("")}`,
    buttons: [{ action, label, default: true, callback: async (_event, button) => {
      if (action === "record" && !game.user.isGM) return ui.notifications.warn(t("RecordGMOnly"));
      const selected = [...new Set([...button.form.querySelectorAll('input[name="actor"]:checked')]
        .map(input => actors[Number(input.value)]).filter(actor => actor && actor.testUserPermission(game.user, "OBSERVER")))];
      if (!selected.length) return ui.notifications.warn(t("NoSelection"));
      try { await (action === "record" ? record(selected) : check(selected)); }
      catch (error) { console.error(`${ID} |`, error); ui.notifications.error(t("Failed")); }
    } }, { action: "cancel", label: t("Cancel") }]
  }).render({ force: true });
}

function setCooldown() {
  if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
  return new foundry.applications.api.DialogV2({
    window: { title: t("CooldownTitle") },
    content: `<label>${h("HoursLabel")} <input type="number" name="cooldown" value="${cooldown()}" min="0" step="any" required></label>`,
    buttons: [{ action: "save", label: t("Save"), default: true, callback: async (_event, button) => {
      if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
      try {
        const raw = button.form.elements.cooldown.value.trim();
        const value = validateCooldown(raw === "" ? NaN : Number(raw));
        await game.settings.set(ID, "cooldownHours", value);
        ui.notifications.info(t("CooldownSaved", { hours: value }));
      } catch (error) { console.error(`${ID} |`, error); ui.notifications.error(t("InvalidCooldown")); }
    } }, { action: "cancel", label: t("Cancel") }]
  }).render({ force: true });
}

function openTracker() {
  return new foundry.applications.api.DialogV2({
    window: { title: t("Title") },
    content: `<p>${h("WorldTime", { time: formatTimestamp(game.time.worldTime) })}</p><p><strong>${h("CooldownSummary", { hours: cooldown() })}</strong></p><p>${h("Intro")}</p>`,
    buttons: [
      ...(game.user.isGM ? [{ action: "record", label: t("Record"), callback: () => selectActors("record") }] : []),
      { action: "check", label: t("Check"), default: true, callback: () => selectActors("check") },
      ...(game.settings.get(ID, "restCoordination") && game.settings.get(ID, "groupShortRest") ? [{ action: "shortRest", label: t("ShortRestTitle"), callback: () => shortRests.refresh() }] : []),
      ...(game.settings.get(ID, "restCoordination") && game.settings.get(ID, "groupLongRest") ? [{ action: "longRest", label: t("LongRestTitle"), callback: () => longRests.refresh() }] : []),
      ...(game.user.isGM ? [{ action: "cooldown", label: t("SetCooldown"), callback: setCooldown }] : []),
      { action: "close", label: t("Close") }
    ]
  }).render({ force: true });
}

// Use v14's native control group so the clock opens the secondary toolbar.
function toolClick(name, callback) {
  return event => {
    // Core can call onChange while activating a group. Only a click on this
    // submenu tool should open a dialog, including clicks on its child icon.
    if (event?.target?.closest?.(`[data-tool="${name}"]`)) return callback();
  };
}

Hooks.on("getSceneControlButtons", controls => {
  const order = Math.max(-1, ...Object.values(controls).filter(control => control.name !== ID)
    .map(control => Number.isFinite(control.order) ? control.order : 0)) + 1;
  controls[ID] = {
    name: ID, title: "LRT.Title", icon: "fa-solid fa-clock", order, visible: true,
    tools: {
      record: {
        name: "record", title: "LRT.Record", icon: "fa-solid fa-bed", order: 0,
        button: true, visible: game.user.isGM, onChange: toolClick("record", () => selectActors("record"))
      },
      cooldown: {
        name: "cooldown", title: "LRT.SetCooldown", icon: "fa-solid fa-hourglass-half", order: 1,
        button: true, visible: game.user.isGM, onChange: toolClick("cooldown", setCooldown)
      },
      check: {
        name: "check", title: "LRT.Check", icon: "fa-solid fa-list-check", order: 2,
        button: true, visible: true, onChange: toolClick("check", () => selectActors("check"))
      }
    }
  };
});

// D&D5e emits this locally after completing updates and time advancement.
const completedResults = new WeakMap();
Hooks.on("dnd5e.restCompleted", async (actor, result, config) => {
  if (game.system.id !== "dnd5e") return;
  const type = config?.type ?? result?.type;
  if (type ? type !== "long" : result?.longRest !== true) return;
  if (actor?.type !== "character" || !actor.hasPlayerOwner || !actor.isOwner) return;
  if (!game.settings.get(ID, "autoRecord")) { longRests.completed(actor, result, config); return; }
  // A module may forward the same completion result more than once. Share its
  // pending write and retain successful results without keeping actors alive.
  const trackable = result && typeof result === "object";
  let seen;
  if (trackable) {
    seen = completedResults.get(result);
    if (!seen) completedResults.set(result, seen = new Map());
    if (seen.has(actor.uuid)) return seen.get(actor.uuid);
  }
  const recording = record([actor]);
  if (seen) seen.set(actor.uuid, recording);
  try {
    if (!await recording) seen?.delete(actor.uuid);
    longRests.completed(actor, result, config);
  }
  catch (error) {
    seen?.delete(actor.uuid);
    console.error(`${ID} | Automatic rest recording failed`, error);
    ui.notifications.error(t("AutoFailed"));
  }
});

Hooks.once("init", () => {
  game.settings.register(ID, "restCoordination", {
    name: "LRT.RestCoordination", hint: "LRT.RestCoordinationHint", scope: "world", config: true,
    type: Boolean, default: true, onChange: () => { void shortRests.changed(); void longRests.changed(); }
  });
  game.settings.register(ID, "clockSource", {
    name: "LRT.ClockSource", hint: "LRT.ClockSourceHint", scope: "world", config: true, type: String, default: "auto",
    choices: {auto: "LRT.ClockAuto", native: "LRT.ClockNative", "foundryvtt-simple-calendar": "Simple Calendar", "foundryvtt-simple-calendar-reborn": "Simple Calendar Reborn"}
  });
  game.settings.register(ID, "groupLongRest", {
    name: "LRT.LongRestSetting", hint: "LRT.LongRestHint", scope: "world", config: true,
    type: Boolean, default: true, onChange: () => { void longRests.changed(); }
  });
  game.settings.register(ID, "longRestSession", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => { void longRests.changed(); }
  });
  game.settings.register(ID, "groupShortRest", {
    name: "LRT.ShortRestSetting", hint: "LRT.ShortRestHint", scope: "world", config: true,
    type: Boolean, default: true, onChange: () => { void shortRests.changed(); }
  });
  game.settings.register(ID, "shortRestSession", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => { void shortRests.changed(); }
  });
  game.settings.register(ID, "autoRecord", {
    name: "LRT.AutoName", hint: "LRT.AutoHint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(ID, "cooldownHours", {
    name: "LRT.SettingName", hint: "LRT.SettingHint",
    scope: "world", config: true, type: Number, default: 24,
    onChange: value => { if (!Number.isFinite(value) || value < 0) ui.notifications.error(t("InvalidCooldown")); }
  });
  class TrackerMenu extends foundry.applications.api.DialogV2 {
    constructor(options = {}) { super({ ...options, window: { title: t("Title") }, content: "", buttons: [{ action: "close", label: t("Close") }] }); }
    render() { return openTracker(); }
  }
  game.settings.registerMenu(ID, "tracker", { name: "LRT.Title", label: "LRT.Open", hint: "LRT.MenuHint", icon: "fas fa-bed", type: TrackerMenu, restricted: false });
  game.modules.get(ID).api = Object.freeze({ open: openTracker });
});
