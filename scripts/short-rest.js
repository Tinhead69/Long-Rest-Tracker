import { escapeHTML as esc } from "./time.js";
import { prepareClockAdvance } from "./clock.js";

const ID = "long-rest-tracker";
const WINDOW = 120_000;
const localize = (key, data) => data ? game.i18n.format(`LRT.${key}`, data) : game.i18n.localize(`LRT.${key}`);

/** One real-time window, regardless of how many characters join. */
export function collectShortRest(session, event, now = Date.now(), waitForAll = false) {
  if (session?.status === "done" && Object.values(session.events).some(previous => previous.id === event.id)) return session;
  if (!session || session.status === "done") {
    if (now - event.startedAt >= WINDOW) return session;
    session = { id: event.id, startedAt: event.startedAt, deadline: event.startedAt + WINDOW,
      status: "collecting", events: {} };
  }
  if (!["collecting", "awaiting"].includes(session.status) || event.startedAt < session.startedAt || (!waitForAll && event.startedAt >= session.deadline)) return session;
  const previous = session.events[event.uuid];
  if (previous?.completedAt != null || (previous && previous.startedAt > event.startedAt)) return session;
  session.events[event.uuid] = event;
  return session;
}

export function shortRestChoices(current, actors, includeLate = false) {
  const completed = Object.values(current.events).filter(event => event.completedAt != null && (includeLate || event.completedAt <= current.deadline));
  const completedIds = new Set(completed.map(event => event.uuid));
  const choices = {resting: [], notResting: [], unanswered: [], completed: completed.map(event => event.name)};
  for (const [uuid, name] of actors) {
    const response = current.responses?.[uuid];
    if (completedIds.has(uuid) || response?.resting === true) choices.resting.push(name);
    else if (response?.resting === false) choices.notResting.push(name);
    else choices.unanswered.push(name);
  }
  return choices;
}

export function installShortRestTracking({type = "short", hours = 1} = {}) {
  const isLong = type === "long";
  const FLAG = `${type}RestEvent`, RESPONSE = `${type}RestResponse`;
  const sessionKey = `${type}RestSession`, enabledKey = isLong ? "groupLongRest" : "groupShortRest";
  const t = (key, data) => localize(isLong ? key.replace(/^ShortRest/, "LongRest") : key, data);
  let timer, dialog, processing = Promise.resolve();
  const pending = new Map();
  const invitations = new Map();
  const localEvents = new Map();
  const completedResults = new WeakMap();
  const enabled = () => game.system.id === "dnd5e" && game.settings.get(ID, "restCoordination") && game.settings.get(ID, enabledKey);
  const isCoordinator = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
  const eligible = actor => actor?.type === "character" && actor.hasPlayerOwner;
  const session = () => {
    const value = game.settings.get(ID, sessionKey);
    return value?.id ? value : null;
  };
  const save = value => game.settings.set(ID, sessionKey, value);
  const enqueue = task => {
    processing = processing.then(task).catch(error => {
      console.error(`${ID} | Group short rest failed`, error);
      ui.notifications.error(error.userMessage ?? t("ShortRestFailed"));
    });
    return processing;
  };

  function publish(actor, event, flag = FLAG) {
    // Hooks are synchronous. Chain writes explicitly so a quick completion cannot
    // be overwritten by its earlier start notification.
    const previous = pending.get(actor.uuid) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => actor.setFlag(ID, flag, event));
    pending.set(actor.uuid, next);
    void next.catch(error => {
      console.error(`${ID} | Could not publish short rest`, error);
      ui.notifications.error(error.userMessage ?? t("ShortRestFailed"));
    }).finally(() => { if (pending.get(actor.uuid) === next) pending.delete(actor.uuid); });
    return next;
  }

  async function receive(actor) {
    if (!enabled() || !isCoordinator() || !eligible(actor)) return;
    const value = actor.getFlag(ID, FLAG);
    if (!value || typeof value.id !== "string" || !Number.isFinite(value.startedAt)
      || value.startedAt > Date.now() + 5000
      || (value.completedAt != null && (!Number.isFinite(value.completedAt) || value.completedAt < value.startedAt))) return;
    const event = {id: value.id, uuid: actor.uuid, name: actor.name, startedAt: value.startedAt,
      completedAt: value.completedAt ?? null};
    const current = foundry.utils.deepClone(session());
    const updated = collectShortRest(current, event, Date.now(), isLong);
    if (updated && isLong && !updated.roster) updated.roster = roster(updated);
    if (!updated) return;
    await save(updated);
    await refresh();
  }

  async function receiveResponse(actor) {
    if (!enabled() || !isCoordinator() || !eligible(actor)) return;
    const value = actor.getFlag(ID, RESPONSE), current = foundry.utils.deepClone(session());
    if (!current || !["collecting", "awaiting"].includes(current.status) || value?.sessionId !== current.id
      || typeof value.resting !== "boolean" || !Number.isFinite(value.at)
      || value.at < current.startedAt || value.at > current.deadline || value.at > Date.now() + 5000) return;
    current.responses ??= {};
    const previous = current.responses[actor.uuid];
    if (previous?.at > value.at) return;
    current.responses[actor.uuid] = {resting: value.resting, at: value.at, name: actor.name};
    await save(current);
    await refresh();
  }

  async function requestChoices(reopen = false) {
    const current = session();
    for (const [uuid, invitation] of invitations) {
      if (!enabled() || current?.id !== invitation.sessionId || current.status !== "collecting" || Date.now() >= current.deadline || current.responses?.[uuid]
        || current.events?.[uuid]?.completedAt != null) {
        await invitation.dialog.close();
        invitations.delete(uuid);
      }
    }
    if (!enabled() || current?.status !== "collecting" || Date.now() >= current.deadline) return;
    const actors = game.actors.filter(actor => eligible(actor) && actor.isOwner
      && (!game.user.isGM || game.user.character?.uuid === actor.uuid));
    for (const actor of actors) {
      if (current.events?.[actor.uuid]?.completedAt != null) continue;
      if (!reopen && (invitations.has(actor.uuid) || current.responses?.[actor.uuid])) continue;
      if (invitations.has(actor.uuid)) await invitations.get(actor.uuid).dialog.close();
      const respond = async resting => {
        const latest = session();
        if (!enabled() || !actor.isOwner || latest?.id !== current.id || latest.status !== "collecting" || Date.now() >= latest.deadline) {
          ui.notifications.warn(t("ShortRestResponseExpired"));
          return;
        }
        await publish(actor, {sessionId: current.id, resting, at: Date.now()}, RESPONSE);
      };
      const choiceDialog = new foundry.applications.api.DialogV2({
        window: {title: t("ShortRestTitle")},
        content: `<p>${esc(t("ShortRestInvitation", {name: actor.name}))}</p><p>${esc(t("ShortRestChoiceHint"))}</p>`,
        buttons: [
          {action: "resting", label: t("ShortRestYes"), callback: () => respond(true)},
          {action: "notResting", label: t("ShortRestNo"), callback: () => respond(false)}
        ]
      }).render({force: true});
      invitations.set(actor.uuid, {sessionId: current.id, dialog: choiceDialog});
    }
  }

  function roster(current) {
    if (current.roster) return current.roster;
    const actors = new Map(game.actors.filter(eligible).map(actor => [actor.uuid, actor.name]));
    for (const event of Object.values(current.events)) actors.set(event.uuid, event.name);
    for (const [uuid, response] of Object.entries(current.responses ?? {})) if (!actors.has(uuid)) actors.set(uuid, response.name);
    return [...actors].sort((a, b) => a[1].localeCompare(b[1]));
  }

  async function refresh() {
    clearTimeout(timer);
    if (!enabled() || !isCoordinator()) { if (dialog) await dialog.close(); dialog = null; return; }
    const current = session();
    if (!current || current.status === "done") return;
    if (current.status === "advancing") {
      if (dialog) await dialog.close();
      dialog = new foundry.applications.api.DialogV2({
        window: {title: t("ShortRestTitle")}, content: `<p>${esc(t("ShortRestUncertain"))}</p>`,
        buttons: [{action: "resolve", label: t("ShortRestResolve"), callback: () => enqueue(async () => {
          const latest = session();
          if (isCoordinator() && latest?.id === current.id && latest.status === "advancing") await save({...latest, status: "done"});
        })}]
      }).render({force: true});
      return;
    }
    if (isLong) {
      const participants = roster(current);
      if (!current.advanceFailed && participants.length && participants.every(([uuid]) => current.events[uuid]?.completedAt != null)) {
        await save({...current, status: "awaiting"});
        await finish(current.id, true);
        return;
      }
    }
    const remaining = current.advanceFailed ? 0 : Math.max(0, Math.ceil((current.deadline - Date.now()) / 1000));
    if (!remaining && current.status === "collecting") {
      current.status = "awaiting";
      await save(current);
    }
    const choices = shortRestChoices(current, roster(current), isLong);
    const list = items => `<ul>${items.map(name => `<li>${esc(name)}</li>`).join("") || `<li>${esc(t("ShortRestNone"))}</li>`}</ul>`;
    const content = `${remaining ? `<p data-lrt-countdown>${esc(t("ShortRestCountdown", {seconds: remaining}))}</p>` : `<p>${esc(t("ShortRestQuestion"))}</p>`}
      <h3>${esc(t("ShortRestYes"))}</h3>${list(choices.resting)}
      <h3>${esc(t("ShortRestNo"))}</h3>${list(choices.notResting)}
      <h3>${esc(t("ShortRestUnanswered"))}</h3>${list(choices.unanswered)}
      <h3>${esc(t("ShortRestCompleted"))}</h3>${list(choices.completed)}`;
    if (dialog) await dialog.close();
    dialog = new foundry.applications.api.DialogV2({
      window: {title: t("ShortRestTitle")}, content,
      buttons: remaining ? [{action: "close", label: t("Close")} ] : [
        ...(!isLong || roster(current).every(([uuid]) => current.events[uuid]?.completedAt != null) ? [{action: "advance", label: t("ShortRestAdvance"), callback: () => enqueue(() => finish(current.id, true))}] : []),
        {action: "skip", label: t("ShortRestSkip"), default: true, callback: () => enqueue(() => finish(current.id, false))}
      ]
    }).render({force: true});
    if (remaining) {
      const tick = () => {
        if (!enabled() || !isCoordinator()) { void enqueue(refresh); return; }
        const seconds = Math.max(0, Math.ceil((current.deadline - Date.now()) / 1000));
        const label = dialog?.element?.querySelector("[data-lrt-countdown]");
        if (label) label.textContent = t("ShortRestCountdown", {seconds});
        if (!seconds) void enqueue(refresh);
        else timer = setTimeout(tick, 1000);
      };
      timer = setTimeout(tick, 1000);
    }
  }

  async function finish(id, advance) {
    const current = session();
    if (!enabled() || !isCoordinator() || current?.id !== id || current.status !== "awaiting") return;
    if (!advance) { await save({...current, status: "done"}); return; }
    if (isLong && !roster(current).every(([uuid]) => current.events[uuid]?.completedAt != null)) return;
    const advanceClock = prepareClockAdvance(hours);
    // Persist the claim before advancing so another GM/reload cannot repeat it.
    await save({...current, status: "advancing"});
    try {
      if (!enabled() || !isCoordinator()) return;
      await advanceClock();
    } catch (error) {
      await save({...current, status: error.clockMayHaveAdvanced ? "advancing" : "awaiting", advanceFailed: true});
      await refresh();
      throw error;
    }
    await save({...current, status: "done"});
    if (isLong && game.settings.get(ID, "autoRecord")) {
      // Completion events are published after the existing recording write finishes.
      // Stamp the end of the shared eight-hour rest after advancing the clock.
      for (const [uuid] of roster(current)) {
        const actor = game.actors.find(actor => actor.uuid === uuid) ?? await fromUuid(uuid);
        if (actor) await actor.setFlag(ID, "lastLongRestTime", game.time.worldTime);
      }
    }
    ui.notifications.info(t("ShortRestAdvanced"));
  }

  Hooks.on(isLong ? "dnd5e.preLongRest" : "dnd5e.preShortRest", (actor, config) => {
    if (!enabled() || !eligible(actor) || !actor.isOwner) return;
    config.advanceTime = false;
    const event = {id: foundry.utils.randomID(), startedAt: Date.now(), completedAt: null};
    localEvents.set(actor.uuid, event);
    publish(actor, event);
  });
  Hooks.on("dnd5e.preRestCompleted", (actor, result, config) => {
    if (enabled() && eligible(actor) && (config?.type ?? result?.type) === type) config.advanceTime = false;
  });
  const completed = (actor, result, config) => {
    const restType = config?.type ?? result?.type ?? (typeof result?.longRest === "boolean" ? (result.longRest ? "long" : "short") : undefined);
    if (!enabled() || restType !== type || !eligible(actor) || !actor.isOwner) return;
    if (result && typeof result === "object") {
      let seen = completedResults.get(result);
      if (!seen) completedResults.set(result, seen = new Set());
      if (seen.has(actor.uuid)) return;
      seen.add(actor.uuid);
    }
    const now = Date.now();
    const event = localEvents.get(actor.uuid) ?? {id: foundry.utils.randomID(), startedAt: now};
    localEvents.delete(actor.uuid);
    publish(actor, {...event, completedAt: now});
  };
  // Long rests publish only after the legacy long-rest recording has finished.
  if (!isLong) Hooks.on("dnd5e.restCompleted", completed);
  Hooks.on("updateActor", (actor, changes) => {
    const changed = flag => foundry.utils.hasProperty(changes, `flags.${ID}.${flag}`) || Object.hasOwn(changes, `flags.${ID}.${flag}`);
    if (changed(FLAG)) void enqueue(() => receive(actor));
    if (changed(RESPONSE)) void enqueue(() => receiveResponse(actor));
  });
  // Take over a persisted window when the designated GM changes or reconnects.
  Hooks.on("updateUser", () => enqueue(refresh));
  const restore = () => enqueue(async () => {
    if (enabled() && isCoordinator()) {
      for (const actor of game.actors) {
        if (actor.getFlag(ID, FLAG)) await receive(actor);
        if (actor.getFlag(ID, RESPONSE)) await receiveResponse(actor);
      }
    }
    await requestChoices();
    await refresh();
  });
  Hooks.on("userConnected", restore);
  Hooks.once("ready", restore);
  return {
    completed,
    changed: () => enqueue(async () => {
      if (!enabled()) {
        localEvents.clear();
        const current = session();
        if (isCoordinator() && ["collecting", "awaiting"].includes(current?.status)) await save({...current, status: "done"});
      }
      await requestChoices();
      await refresh();
    }),
    refresh: () => enqueue(async () => { await requestChoices(true); await refresh(); })
  };
}
