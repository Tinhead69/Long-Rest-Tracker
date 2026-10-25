import { escapeHTML as esc, restStatus, validateCooldown } from "./time.js";

const ID = "long-rest-tracker";
const t = (key, data) => data ? game.i18n.format(`LRT.${key}`, data) : game.i18n.localize(`LRT.${key}`);
const h = (key, data) => esc(t(key, data));
const REST_FLAG = "lastLongRestTime";
const cooldown = () => validateCooldown(game.settings.get(ID, "cooldownHours"));
const calendar = () => game.time.calendar;
const timestamp = time => esc(calendar().format(time, "timestamp"));
const tDuration = seconds => calendar().format(calendar().difference(Math.max(0, seconds), 0), "duration");
const duration = seconds => esc(tDuration(seconds));

function actorsOnScene() {
  const actors = (canvas?.tokens?.placeables ?? []).map(token => token.actor)
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

async function record(actors) {
  const now = game.time.worldTime;
  const recorded = [];
  const failed = [];
  for (const actor of actors) {
    if (!actor.isOwner) { failed.push(actor.name); continue; }
    try {
      await actor.setFlag(ID, REST_FLAG, now);
      recorded.push(actor);
    } catch (error) {
      console.error(`${ID} | Failed to record ${actor.uuid}`, error);
      failed.push(actor.name);
    }
  }
  if (recorded.length) await report(`<h2>${h("Recorded")}</h2><p>${timestamp(now)}</p><ul>${recorded.map(a => `<li>${esc(a.name)}</li>`).join("")}</ul>`);
  if (failed.length) ui.notifications.warn(t("RecordFailed", { names: failed.join(", ") }));
}

async function check(actors) {
  const now = game.time.worldTime;
  const seconds = calendar().componentsToTime({ hour: cooldown() });
  const rows = actors.map(actor => {
    const last = lastRest(actor);
    const status = restStatus(now, last, seconds);
    let when = h("NotRecorded"), eligible = h("Unknown"), remaining = "—";
    if (status.state === "future") {
      when = `${timestamp(last)} (${h("Future")})`;
      eligible = h("Rewound");
    } else if (status.state !== "unknown") {
      when = `${timestamp(last)}<br>${h("Ago", { duration: tDuration(status.elapsed) })}`;
      eligible = status.state === "ready" ? `🟢 ${h("Yes")}` : status.remaining <= calendar().componentsToTime({ hour: 4 }) ? `🟡 ${h("No")}` : `🔴 ${h("No")}`;
      if (status.state === "waiting") remaining = duration(status.remaining);
    }
    return `<tr><td>${esc(actor.name)}</td><td>${when}</td><td>${eligible}</td><td>${remaining}</td></tr>`;
  }).join("");
  await report(`<h2>${h("Status")}</h2><p>${h("AsOf", { time: calendar().format(now, "timestamp"), hours: cooldown() })}</p><table><thead><tr><th>${h("Character")}</th><th>${h("LastRest")}</th><th>${h("Eligible")}</th><th>${h("Remaining")}</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function selectActors(action) {
  const actors = actorsOnScene().filter(actor => action !== "record" || actor.isOwner);
  if (!actors.length) return ui.notifications.warn(t("NoActors"));
  const label = action === "record" ? t("Record") : t("Check");
  return new foundry.applications.api.DialogV2({
    window: { title: label }, classes: ["long-rest-tracker"],
    content: `<p>${h("Select")}</p>${actors.map((actor, index) => `<label class="lrt-character"><input type="checkbox" name="actor" value="${index}" checked> ${esc(actor.name)}</label>`).join("")}`,
    buttons: [{ action, label, default: true, callback: async (_event, button) => {
      const selected = [...button.form.querySelectorAll('input[name="actor"]:checked')].map(input => actors[Number(input.value)]);
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
    content: `<p>${h("WorldTime", { time: calendar().format(game.time.worldTime, "timestamp") })}</p><p><strong>${h("CooldownSummary", { hours: cooldown() })}</strong></p><p>${h("Intro")}</p>`,
    buttons: [
      { action: "record", label: t("Record"), callback: () => selectActors("record") },
      { action: "check", label: t("Check"), default: true, callback: () => selectActors("check") },
      ...(game.user.isGM ? [{ action: "cooldown", label: t("SetCooldown"), callback: setCooldown }] : []),
      { action: "close", label: t("Close") }
    ]
  }).render({ force: true });
}

// Use v14's native control group so the clock opens the secondary toolbar.
Hooks.on("getSceneControlButtons", controls => {
  const order = Math.max(-1, ...Object.values(controls).filter(control => control.name !== ID)
    .map(control => Number.isFinite(control.order) ? control.order : 0)) + 1;
  controls[ID] = {
    name: ID, title: "LRT.Title", icon: "fa-solid fa-clock", order, visible: true,
    activeTool: "check",
    tools: {
      record: {
        name: "record", title: "LRT.Record", icon: "fa-solid fa-bed", order: 0,
        button: true, visible: true, onChange: () => selectActors("record")
      },
      cooldown: {
        name: "cooldown", title: "LRT.SetCooldown", icon: "fa-solid fa-hourglass-half", order: 1,
        button: true, visible: game.user.isGM, onChange: setCooldown
      },
      check: {
        name: "check", title: "LRT.Check", icon: "fa-solid fa-list-check", order: 2,
        button: true, visible: true, onChange: () => selectActors("check")
      }
    }
  };
});

Hooks.once("init", () => {
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
