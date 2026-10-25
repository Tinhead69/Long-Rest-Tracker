import { escapeHTML as esc, restStatus, validateCooldown } from "./time.js";

const ID = "long-rest-tracker";
const REST_FLAG = "lastLongRestTime";
const cooldown = () => validateCooldown(game.settings.get(ID, "cooldownHours"));
const calendar = () => game.time.calendar;
const timestamp = time => esc(calendar().format(time, "timestamp"));
const duration = seconds => esc(calendar().format(calendar().difference(Math.max(0, seconds), 0), "duration"));

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
  if (recorded.length) await report(`<h2>Long Rest Recorded</h2><p>${timestamp(now)}</p><ul>${recorded.map(a => `<li>${esc(a.name)}</li>`).join("")}</ul>`);
  if (failed.length) ui.notifications.warn(`Could not record a rest for: ${failed.join(", ")}. Actor ownership is required.`);
}

async function check(actors) {
  const now = game.time.worldTime;
  const seconds = calendar().componentsToTime({ hour: cooldown() });
  const rows = actors.map(actor => {
    const last = lastRest(actor);
    const status = restStatus(now, last, seconds);
    let when = "Not recorded", eligible = "Unknown", remaining = "—";
    if (status.state === "future") {
      when = `${timestamp(last)} (future record)`;
      eligible = "Unknown: world time was rewound";
    } else if (status.state !== "unknown") {
      when = `${timestamp(last)}<br>${duration(status.elapsed)} ago`;
      eligible = status.state === "ready" ? "🟢 Yes" : status.remaining <= calendar().componentsToTime({ hour: 4 }) ? "🟡 No" : "🔴 No";
      if (status.state === "waiting") remaining = duration(status.remaining);
    }
    return `<tr><td>${esc(actor.name)}</td><td>${when}</td><td>${eligible}</td><td>${remaining}</td></tr>`;
  }).join("");
  await report(`<h2>Long Rest Status</h2><p>As of ${timestamp(now)} · Cooldown: ${cooldown()} calendar hours</p><table><thead><tr><th>Character</th><th>Last Long Rest</th><th>Eligible?</th><th>Time Remaining</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function selectActors(action) {
  const actors = actorsOnScene().filter(actor => action !== "record" || actor.isOwner);
  if (!actors.length) return ui.notifications.warn("No accessible player-owned character tokens found on this scene.");
  const label = action === "record" ? "Record Long Rest" : "Check Rest Status";
  return new foundry.applications.api.DialogV2({
    window: { title: label }, classes: ["long-rest-tracker"],
    content: `<p>Select characters on the current scene.</p>${actors.map((actor, index) => `<label class="lrt-character"><input type="checkbox" name="actor" value="${index}" checked> ${esc(actor.name)}</label>`).join("")}`,
    buttons: [{ action, label, default: true, callback: async (_event, button) => {
      const selected = [...button.form.querySelectorAll('input[name="actor"]:checked')].map(input => actors[Number(input.value)]);
      if (!selected.length) return ui.notifications.warn("No characters selected.");
      try { await (action === "record" ? record(selected) : check(selected)); }
      catch (error) { console.error(`${ID} |`, error); ui.notifications.error("Long Rest Tracker failed. See the browser console for details."); }
    } }, { action: "cancel", label: "Cancel" }]
  }).render({ force: true });
}

function setCooldown() {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can change the cooldown.");
  return new foundry.applications.api.DialogV2({
    window: { title: "Long Rest Cooldown" },
    content: `<label>Calendar hours between rests <input type="number" name="cooldown" value="${cooldown()}" min="0" step="any" required></label>`,
    buttons: [{ action: "save", label: "Save", default: true, callback: async (_event, button) => {
      try {
        const raw = button.form.elements.cooldown.value.trim();
        const value = validateCooldown(raw === "" ? NaN : Number(raw));
        await game.settings.set(ID, "cooldownHours", value);
        ui.notifications.info(`Long rest cooldown set to ${value} calendar hours.`);
      } catch (error) { ui.notifications.error(error.message); }
    } }, { action: "cancel", label: "Cancel" }]
  }).render({ force: true });
}

function openTracker() {
  return new foundry.applications.api.DialogV2({
    window: { title: "Long Rest Tracker" },
    content: `<p>World time: ${timestamp(game.time.worldTime)}</p><p>Cooldown: <strong>${cooldown()} calendar hours</strong></p><p>Record completed rests or check player characters on the current scene.</p>`,
    buttons: [
      { action: "record", label: "Record Long Rest", callback: () => selectActors("record") },
      { action: "check", label: "Check Rest Status", default: true, callback: () => selectActors("check") },
      ...(game.user.isGM ? [{ action: "cooldown", label: "Set Cooldown", callback: setCooldown }] : []),
      { action: "close", label: "Close" }
    ]
  }).render({ force: true });
}

Hooks.once("init", () => {
  game.settings.register(ID, "cooldownHours", {
    name: "Long rest cooldown (calendar hours)", hint: "Minimum calendar hours between completed long rests. Only the GM can change this world setting.",
    scope: "world", config: true, type: Number, default: 24,
    onChange: value => { if (!Number.isFinite(value) || value < 0) ui.notifications.error("Long Rest Tracker: cooldown must be finite and non-negative."); }
  });
  class TrackerMenu extends foundry.applications.api.DialogV2 {
    constructor(options = {}) { super({ ...options, window: { title: "Long Rest Tracker" }, content: "", buttons: [{ action: "close", label: "Close" }] }); }
    render() { return openTracker(); }
  }
  game.settings.registerMenu(ID, "tracker", { name: "Long Rest Tracker", label: "Open Tracker", hint: "Record and check long rests on the current scene.", icon: "fas fa-bed", type: TrackerMenu, restricted: false });
  game.modules.get(ID).api = Object.freeze({ open: openTracker });
});
