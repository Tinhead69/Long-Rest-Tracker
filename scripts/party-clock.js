const ID = "long-rest-tracker";
const queues = new WeakMap();

export function partyLastRest() {
  const value = game.settings.get(ID, "partyRestClock")?.lastRest;
  return Number.isFinite(value) ? value : undefined;
}

export function savePartyLastRest(time, onlyIfEmpty = false) {
  const client = game;
  const previous = queues.get(client) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (!client.user.isGM) throw new Error(client.i18n.localize("LRT.RemainingGMOnly"));
    if (!Number.isFinite(time)) throw new Error("Invalid party rest timestamp.");
    // Migration must not overwrite a correction or completed group rest that
    // arrived while initialization was queued.
    if (onlyIfEmpty && Number.isFinite(partyLastRest())) return;
    await client.settings.set(ID, "partyRestClock", {lastRest: time});
  });
  queues.set(client, next);
  return next.finally(() => {if (queues.get(client) === next) queues.delete(client);});
}

export async function initializePartyRestClock() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || Number.isFinite(partyLastRest())) return;
  const actors = [...game.actors, ...(globalThis.canvas?.tokens?.placeables ?? []).map(token => token.actor)];
  let latest;
  for (const actor of actors) {
    if (actor?.type !== "character" || !actor.hasPlayerOwner) continue;
    const value = actor.getFlag(ID, "lastLongRestTime") ?? actor.getFlag("world", "lastLongRestTime");
    if (Number.isFinite(value) && (latest === undefined || value > latest)) latest = value;
  }
  if (latest !== undefined) await savePartyLastRest(latest, true);
}
