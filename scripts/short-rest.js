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

export function shortRestChoices(current, actors) {
  const choices = {resting: [], unanswered: []};
  for (const [uuid, name] of actors) {
    if (current.events[uuid]) choices.resting.push(name);
    else choices.unanswered.push(name);
  }
  return choices;
}

export function installShortRestTracking({type = "short", hours = 1} = {}) {
  const isLong = type === "long";
  const FLAG = `${type}RestEvent`;
  const sessionKey = `${type}RestSession`, enabledKey = isLong ? "groupLongRest" : "groupShortRest";
  const t = (key, data) => localize(isLong ? key.replace(/^ShortRest/, "LongRest") : key, data);
  let timer, dialog, processing = Promise.resolve();
  const pending = new Map();
  const localEvents = new Map();
  const completedResults = new WeakMap();
  const enabled = () => game.system.id === "dnd5e" && game.settings.get(ID, "restCoordination") && game.settings.get(ID, enabledKey);
  const isCoordinator = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
  const eligible = actor => actor?.type === "character" && actor.hasPlayerOwner;
  const session = () => {
    const value = game.settings.get(ID, sessionKey);
    return value?.id ? foundry.utils.deepClone(value) : null;
  };
  const save = value => game.settings.set(ID, sessionKey, value);
  const enqueue = task => {
    processing = processing.then(task).catch(error => {
      console.error(`${ID} | Group ${type} rest failed`, error);
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
      console.error(`${ID} | Could not publish ${type} rest`, error);
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
    const current = session();
    const updated = collectShortRest(current, event, Date.now(), isLong);
    if (updated && isLong && !updated.roster) updated.roster = roster(updated);
    if (!updated) return;
    await save(updated);
    await refresh();
  }

  function roster(current) {
    if (current.roster) return current.roster;
    const actors = new Map(game.actors.filter(eligible).map(actor => [actor.uuid, actor.name]));
    for (const event of Object.values(current.events)) actors.set(event.uuid, event.name);
    return [...actors].sort((a, b) => a[1].localeCompare(b[1]));
  }

  async function refresh() {
    clearTimeout(timer);
    if (!enabled() || !isCoordinator()) { if (dialog) await dialog.close(); dialog = null; return; }
    const current = session();
    if (!current || current.status === "done") { if (dialog) await dialog.close(); dialog = null; return; }
    if (current.status === "advancing") {
      if (dialog) await dialog.close();
      dialog = new foundry.applications.api.DialogV2({
        classes: ["long-rest-tracker", "lrt-group-rest"], position: {width: 360, height: "auto"},
        window: {title: t("ShortRestTitle")}, content: `<p>${esc(t("ShortRestUncertain"))}</p>`,
        buttons: [{action: "resolve", label: t("ShortRestResolve"), callback: () => enqueue(async () => {
          const latest = session();
          if (isCoordinator() && latest?.id === current.id && latest.status === "advancing") await save({...latest, status: "done"});
        })}]
      });
      await dialog.render({force: true});
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
    const choices = shortRestChoices(current, roster(current));
    const list = items => `<ul>${items.map(name => `<li>${esc(name)}</li>`).join("") || `<li class="lrt-group-empty">${esc(t("ShortRestNone"))}</li>`}</ul>`;
    const content = `<div class="lrt-group-body">
      <p class="lrt-group-timer" role="timer">${remaining ? esc(t("ShortRestCountdown", {seconds: remaining})) : esc(t("ShortRestQuestion"))}</p>
      <section class="lrt-group-pane lrt-group-taking">
        <div class="lrt-group-pane-header"><div class="lrt-group-label" role="heading" aria-level="2">${esc(t("ShortRestYes"))}</div><span class="lrt-group-count">${choices.resting.length}</span></div>
        ${list(choices.resting)}
      </section>
      <section class="lrt-group-pane lrt-group-pending">
        <div class="lrt-group-pane-header"><div class="lrt-group-label" role="heading" aria-level="2">${esc(t("ShortRestUnanswered"))}</div><span class="lrt-group-count">${choices.unanswered.length}</span></div>
        ${list(choices.unanswered)}
      </section>
    </div>`;
    if (dialog) await dialog.close();
    dialog = new foundry.applications.api.DialogV2({
      classes: ["long-rest-tracker", "lrt-group-rest"], position: {width: 360, height: "auto"},
      window: {title: t("ShortRestTitle")}, content,
      buttons: remaining ? [{action: "close", label: t("Close")} ] : [
        ...(!isLong || roster(current).every(([uuid]) => current.events[uuid]?.completedAt != null) ? [{action: "advance", label: t("ShortRestAdvance"), callback: () => enqueue(() => finish(current.id, true))}] : []),
        {action: "skip", label: t("ShortRestSkip"), default: true, callback: () => enqueue(() => finish(current.id, false))}
      ]
    });
    // ApplicationV2.render is asynchronous. Retain the application, not its
    // rendering Promise, so updates can reach its element and close it correctly.
    await dialog.render({force: true});
    if (remaining) {
      const tick = () => {
        if (!enabled() || !isCoordinator()) { void enqueue(refresh); return; }
        const seconds = Math.max(0, Math.ceil((current.deadline - Date.now()) / 1000));
        const label = dialog?.element?.querySelector(".lrt-group-timer");
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
    let beforeAdvance;
    try {
      if (!enabled() || !isCoordinator()) return;
      beforeAdvance = game.time.worldTime;
      await advanceClock();
    } catch (error) {
      // A rejected request may already have changed the authoritative clock.
      // Never offer a second advance when that outcome is uncertain.
      const uncertain = error?.clockMayHaveAdvanced || game.time.worldTime !== beforeAdvance;
      await save({...current, status: uncertain ? "advancing" : "awaiting", advanceFailed: true});
      await refresh();
      if (uncertain) {
        const failure = new Error(t("ShortRestUncertain"));
        failure.userMessage = failure.message;
        throw failure;
      }
      throw error;
    }
    const finishedAt = game.time.worldTime;
    await save({...current, status: "done"});
    if (isLong && game.settings.get(ID, "autoRecord")) {
      // Completion events are published after the existing recording write finishes.
      // Stamp the end of the shared eight-hour rest after advancing the clock.
      const failed = [];
      for (const [uuid, name] of roster(current)) {
        try {
          const actor = game.actors.find(actor => actor.uuid === uuid) ?? await fromUuid(uuid);
          if (!actor) throw new Error(`Actor no longer exists: ${uuid}`);
          await actor.setFlag(ID, "lastLongRestTime", finishedAt);
        } catch (error) {
          console.error(`${ID} | Clock advanced but rest timestamp was not saved for ${uuid}`, error);
          failed.push(name);
        }
      }
      if (failed.length) ui.notifications.warn(t("ShortRestRecordsFailed", {names: failed.join(", ")}));
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
  });
  // Take over a persisted window when the designated GM changes or reconnects.
  Hooks.on("updateUser", () => enqueue(refresh));
  const restore = () => enqueue(async () => {
    if (enabled() && isCoordinator()) {
      // Replay in start order: world Actor collection order is unrelated to
      // which character opened the first rest dialog while this GM was offline.
      const actors = game.actors.filter(actor => eligible(actor) && Number.isFinite(actor.getFlag(ID, FLAG)?.startedAt))
        .sort((a, b) => a.getFlag(ID, FLAG).startedAt - b.getFlag(ID, FLAG).startedAt);
      for (const actor of actors) await receive(actor);
    }
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
      await refresh();
    }),
    refresh: () => enqueue(refresh)
  };
}
