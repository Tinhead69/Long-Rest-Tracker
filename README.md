# Long Rest Tracker — Foundry VTT v14

Converts the supplied long-rest macro into a standalone module. No Simple Calendar dependency. Uses `game.time.worldTime` for saved records and `game.time.calendar` for dates, durations, and converting cooldown hours to seconds.

## Install

1. Close Foundry, then copy the `long-rest-tracker` folder from the release ZIP into your Foundry user data directory's `Data/modules/` folder.
2. Start Foundry v14, open your world, and enable **Long Rest Tracker** in **Manage Modules**.
3. Click the **clock icon** at the bottom of Foundry's left scene-control toolbar. Its submenu contains **Record Long Rest**, **Set Cooldown** (GM only), and **Check Rest Status**.

Version **1.0.1** adds the clock toolbar and submenu. After updating, reload the world to register the new controls. **Configure Settings → Long Rest Tracker → Open Tracker** and existing hotbar macros still work.

Version **1.0.2** fixes the clock opening a character selector when activating the toolbar. Dialogs open only when their submenu buttons are clicked.

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

Version **1.0.4** makes manual **Record Long Rest** GM-only in both the clock submenu and tracker window. Players retain **Check Rest Status**, and their completed character-sheet long rests are still recorded automatically.

Version **1.0.3** automatically records completed D&D5e long rests using the system's `dnd5e.restCompleted` hook. Players can use **Long Rest** on their character sheet as usual; when the rest completes, the tracker saves the current world time and sends them a private recording report. No token on the current scene is required. Short rests and cancelled dialogs do not record anything. The GM can disable **Automatically record D&D5e long rests** in Configure Settings. Manual recording remains available.

Recording occurs after any time advancement performed by D&D5e. The tracker itself does not advance time or enforce the cooldown. Rest-modifying modules must emit the standard completion hook to be tracked automatically. Test a sheet long rest and a cancelled rest in your v14 world before campaign use.

- **Record Long Rest** (GM only) selects player-owned `character` actors on the current scene. It records the current world time as the completion time.
- **Check Rest Status** checks characters on the current scene for which you have Observer permission or higher. Results are whispered only to the user requesting them.
- **Set Cooldown** is available to the GM; the default is 24 calendar hours. You can also edit the world setting under Configure Settings. Use a finite number greater than or equal to zero.

The module tracks rests only. It does not execute D&D5e rest mechanics, restore resources, enforce rest restrictions, or advance world time. Advance time through Foundry's calendar/time controls; run a fresh status check to see updated results. A new record replaces the previous completion time even when the cooldown has not elapsed, matching the original macro.

The `character` actor type follows the original D&D5e script. Other systems must expose the same actor type to appear in the tracker. There is no dependency on a particular D&D5e rest API.

Linked tokens for the same actor appear once. Unlinked token actors are tracked individually by UUID. Completed sheet long rests are automatically recorded for owned characters; only the GM can record rests manually. No active scene or no matching actors produces a notification for scene-based controls.

## Existing macro data

The module reads the original `flags.world.lastLongRestTime` whenever a module record does not yet exist. New records use `flags.long-rest-tracker.lastLongRestTime`; legacy flags remain intact. A timestamp of zero is valid. Missing or invalid timestamps show Unknown. Records ahead of world time, such as after rewinding the calendar, show a future-record warning until world time catches up or you record another rest.

The old cooldown was stored on an individual macro. Set your desired cooldown once in the module; macro cooldowns are not imported automatically. The module uses the active calendar's definition of an hour. On a standard calendar this is 3,600 seconds. Custom calendar hours may differ from the original macro's fixed-length hours. Changing the calendar epoch or importing an unrelated world timeline does not remap saved timestamps.

## Validation

Version **1.0.5** adds stress-test fixes: per-actor write queues, duplicate completion-result protection, submission-time permission checks, safe handling of malformed selections and missing canvas, a 24-hour fallback for invalid cooldown settings, and separate reporting of chat failures after successful saves.

The automated suite includes 100,000 deterministic timing cases, 500 simulated concurrent character completions, 1,000 repeated deliveries of the same completion result, and 1,000 toolbar rebuilds. These use mocked Foundry APIs: they verify module logic, not real database throughput, DOM rendering, or multiplayer networking. Repeated events with different result objects are treated as separate completed rests. The write queue coordinates only this client; simultaneous rests on the same actor from separate clients still depend on Foundry's update ordering.

Five regression scenarios were reproduced against the original 1.0.4 scripts before verifying the fixes: reordered writes, misleading failure after a successful save with chat failure, stale Observer permission, stale GM cooldown dialog, and an invalid cooldown preventing the tracker from opening.

Run `npm test` and `npm run check` with Node.js. Tests cover eligibility boundaries, zero/negative timestamps, rewound time, invalid records, cooldown validation, HTML escaping, settings registration, actor selection, legacy records, ownership, and private chat reports.

The module has not been run in an actual Foundry instance here. Before using it in a campaign, test in a spare v14 world:

1. Add two linked player character tokens and one unlinked character token; open the tracker and confirm the linked actor appears once.
2. Record a rest and check status. Advance world time by 24 calendar hours and check again; eligibility should change to Yes.
3. Reload the world and check that records and the cooldown persist.
4. Check as a player: manual recording and cooldown buttons should be hidden, status checks should work, and completed sheet long rests should still record automatically. Reports should remain private.
5. Rewind world time before a recorded rest; verify the future-record warning.
6. Check a character carrying only the old macro flag; verify its original rest is displayed.

API references: [GameTime](https://foundryvtt.com/api/v14/classes/foundry.helpers.GameTime.html), [CalendarData](https://foundryvtt.com/api/v14/classes/foundry.data.CalendarData.html), [DialogV2](https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html).
