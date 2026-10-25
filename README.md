# Long Rest Tracker — Foundry VTT v14

Converts the supplied long-rest macro into a standalone module. No Simple Calendar dependency. Uses `game.time.worldTime` for saved records and `game.time.calendar` for dates, durations, and converting cooldown hours to seconds.

## Install

1. Close Foundry, then copy the `long-rest-tracker` folder from the release ZIP into your Foundry user data directory's `Data/modules/` folder.
2. Start Foundry v14, open your world, and enable **Long Rest Tracker** in **Manage Modules**.
3. Open **Configure Settings → Long Rest Tracker → Open Tracker**.

You can also create a Script macro containing:

```js
game.modules.get("long-rest-tracker").api.open();
```

Repository: [Tinhead69/Long-Rest-Tracker](https://github.com/Tinhead69/Long-Rest-Tracker).

For development installation, upload `module.json`, `scripts/`, `styles/`, and `lang/` to the root of the public repository's `main` branch. No GitHub release is required. In Foundry's Install Module dialog, use this manifest URL:

```text
https://raw.githubusercontent.com/Tinhead69/Long-Rest-Tracker/main/module.json
```

The download URL points to GitHub's ZIP of the `main` branch, so installations use the current development code. If your branch has a different name, change `main` in both URLs in `module.json`. Increment the module's version when you want Foundry to detect an update; the required version field is package metadata and does not require publishing a GitHub release. Branch downloads change as commits are pushed and are not pinned to a particular version.

## Use

- **Record Long Rest** selects player-owned `character` actors on the current scene that you own. It records the current world time as the completion time.
- **Check Rest Status** checks characters on the current scene for which you have Observer permission or higher. Results are whispered only to the user requesting them.
- **Set Cooldown** is available to the GM; the default is 24 calendar hours. You can also edit the world setting under Configure Settings. Use a finite number greater than or equal to zero.

The module tracks rests only. It does not execute D&D5e rest mechanics, restore resources, enforce rest restrictions, or advance world time. Advance time through Foundry's calendar/time controls; run a fresh status check to see updated results. A new record replaces the previous completion time even when the cooldown has not elapsed, matching the original macro.

The `character` actor type follows the original D&D5e script. Other systems must expose the same actor type to appear in the tracker. There is no dependency on a particular D&D5e rest API.

Linked tokens for the same actor appear once. Unlinked token actors are tracked individually by UUID. Players can record only actors they own; the GM can record all qualifying actors. No active scene or no matching actors produces a notification.

## Existing macro data

The module reads the original `flags.world.lastLongRestTime` whenever a module record does not yet exist. New records use `flags.long-rest-tracker.lastLongRestTime`; legacy flags remain intact. A timestamp of zero is valid. Missing or invalid timestamps show Unknown. Records ahead of world time, such as after rewinding the calendar, show a future-record warning until world time catches up or you record another rest.

The old cooldown was stored on an individual macro. Set your desired cooldown once in the module; macro cooldowns are not imported automatically. The module uses the active calendar's definition of an hour. On a standard calendar this is 3,600 seconds. Custom calendar hours may differ from the original macro's fixed-length hours. Changing the calendar epoch or importing an unrelated world timeline does not remap saved timestamps.

## Validation

Run `npm test` and `npm run check` with Node.js. Tests cover eligibility boundaries, zero/negative timestamps, rewound time, invalid records, cooldown validation, HTML escaping, settings registration, actor selection, legacy records, ownership, and private chat reports.

The module has not been run in an actual Foundry instance here. Before using it in a campaign, test in a spare v14 world:

1. Add two linked player character tokens and one unlinked character token; open the tracker and confirm the linked actor appears once.
2. Record a rest and check status. Advance world time by 24 calendar hours and check again; eligibility should change to Yes.
3. Reload the world and check that records and the cooldown persist.
4. Check as a player: only accessible actors should be listed and only owned actors can be recorded; reports should remain private.
5. Rewind world time before a recorded rest; verify the future-record warning.
6. Check a character carrying only the old macro flag; verify its original rest is displayed.

API references: [GameTime](https://foundryvtt.com/api/v14/classes/foundry.helpers.GameTime.html), [CalendarData](https://foundryvtt.com/api/v14/classes/foundry.data.CalendarData.html), [DialogV2](https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html).
