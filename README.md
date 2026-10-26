# Long Rest Tracker — Foundry VTT v14

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

### Enable or disable shared rests (1.0.11)

The GM can toggle **Configure Settings → Long Rest Tracker → Enable shared rest coordination**. It is on by default. Turning it off stops party confirmation dialogs, countdowns, and shared clock advances, cancels pending group windows, and allows D&D5e to handle time normally. Long-rest recording and cooldown checks remain available. Re-enabling starts with new group windows rather than resuming a cancelled one. An advance already submitted to the clock cannot be undone by this toggle.

The separate **Coordinate group short rests** and **Coordinate group long rests** options remain available when shared coordination is enabled.

### Clock compatibility (1.0.10)

The rest coordinator supports the **Foundry world clock used by D&D5e 6.0.0**, **Simple Calendar**, and **Simple Calendar Reborn** through a shared clock adapter. In **Configure Settings → Long Rest Tracker → Clock and calendar**, **Automatic** selects an active Simple Calendar variant, otherwise the built-in clock. You can also explicitly select a clock. Enable only one Simple Calendar variant at a time.

No calendar module is required. With a native calendar configured, its hour, minute, and day lengths are used for rest advances, cooldowns, and duration displays. Without one, the standard 3,600-second hour is used. An active Simple Calendar variant supplies its own time units and formatted dates. Rest flags always store Foundry world-time seconds so the tracker and group rest coordination use the same timeline.

For Simple Calendar / Reborn, **Game World Time Integration** must permit synchronization:

- **Mixed** (recommended) or **Third Party Module**: advance Foundry world time once; the calendar follows its normal update hook.
- **Self**: advance through `SimpleCalendar.api.changeDate` once and wait for the calendar to synchronize Foundry world time. The calendars must already agree before the advance. An unconfirmed synchronization blocks automatic retries so an eight-hour rest cannot accidentally advance twice.
- **None**: the calendar is intentionally isolated. Change its integration mode before using shared rest advances; the module reports the required change rather than moving only one clock.

The original Simple Calendar 2.4.18 declares Foundry compatibility verified through **v12**. Its public API is supported by this adapter when running in a compatible installation, but that does not make the upstream module compatible with v14. **Simple Calendar Reborn 2.6.1 declares Foundry v14 support** and is the appropriate variant for a v14 world.

D&D5e 6.0.0 rest hooks and both calendars' public APIs/synchronization modes were checked against their upstream source. Run `node tests/clock.test.mjs`, `node tests/short-rest.test.mjs`, and `node tests/long-rest.test.mjs` for the mocked regression checks. Live Foundry testing remains required: repeat the short- and long-rest flows with the native clock, then Reborn in Mixed and Self modes, and confirm both displays change once by one or eight calendar hours and the saved long-rest timestamp matches the finishing world time.

### Group long rests (1.0.9)

Opening the first D&D5e long-rest dialog starts a group window with the same two-minute participation prompts as a short rest. Players can confirm that they intend to rest or that they are doing something else. The party roster is captured from player-owned world characters and the initiating token actor when the window begins.

**Once every character in that roster completes a long rest on their sheet, the active GM's client automatically advances the clock by eight calendar hours, once for the whole party.** There is no additional GM approval or need to wait out the countdown when everyone has finished. Opening and cancelling a dialog, or simply answering the planning prompt, does not complete a rest. Characters who need no recovery should still complete their sheet's long-rest dialog to join this advance.

If someone has not completed a long rest after two minutes, the GM sees the outstanding characters and time stays unchanged. A choice not to rest also leaves the automatic advance blocked. Players can still complete their sheet rests after the response countdown expires; the last required completion triggers the eight-hour advance. Alternatively the GM can end the group window without advancing time. This differs from short rests, whose one-hour advance always requires a GM decision.

The module suppresses D&D5e's individual long-rest time advancement while **Coordinate group long rests** is enabled. Automatic long-rest records are updated to the end of the shared eight-hour period, so the cooldown starts at the collective completion time. Disabling automatic long-rest recording leaves the group time coordination available. Other modules and manual time changes remain outside this coordination. An interrupted or failed clock update does not automatically retry; the GM must inspect the clock before dismissing the interrupted window or explicitly retrying a failed advance.

Run `node tests/long-rest.test.mjs` for regression coverage of waiting for the last character, cancellation, late completion, an eight-hour advance, rest timestamps, duplicate events, restoration, failed clock updates, and disabling coordination. Validate this behavior with separate clients in a spare Foundry v14/D&D5e world before campaign use.

### Group short rests (1.0.8)

With D&D5e, opening the first player-owned character's short-rest dialog starts a shared **two-minute real-time countdown**. Each player is asked what their owned characters will do:

- **Taking a short rest**, even if no resources need recovering.
- **Not resting / doing something else**, such as studying a spellbook.

Closing the choice dialog leaves the character unanswered. Choosing to rest confirms participation; it does not execute D&D5e rest mechanics or restore resources. Use the character sheet as needed. A completed sheet short rest also confirms participation, but merely opening or cancelling a sheet dialog does not. Long rests do not join this window.

The designated active GM sees four lists: **Taking a short rest**, **Not resting / doing something else**, **Awaiting a response**, and **Completed a short rest within the window**. The roster includes all player-owned world characters and participating token actors; linked characters appear once. Players with several owned characters receive one choice for each. GM users receive player choices only for their assigned character. A missing response is distinct from an explicit decision not to rest.

At two minutes the GM can choose **Advance 1 Hour** or **Leave Clock Unchanged**. An hour uses the active calendar. The choice remains available even if nobody needed to run recovery mechanics. Unanswered characters remain visible: they do not silently consent, and the GM decides whether to advance after reviewing the whole party. Receiving all replies does not end the countdown early. New replies and sheet rests do not extend the window. Late responses and completions are excluded from that window; take a new short rest after the GM dismisses the previous window to start another.

The module disables D&D5e's automatic time advancement for these short rests so individual rests do not each advance the clock. Other modules or manual clock changes are outside this control. This feature is enabled by default; disable **Coordinate group short rests** in module settings to restore the system's usual behavior. It operates independently of automatic long-rest recording.

An active GM with the module enabled is required to collect events and show the prompt. Rest events and participation choices are synchronized through owned Actor flags; the shared window is stored in world settings. An existing window resumes after a GM reload or handover. A GM who was offline before the window began can recover recent events when joining within two minutes. Players can reopen their choices and the GM can reopen the current countdown or decision from **Open Tracker → Group Short Rest**. If a reload interrupts a clock update, inspect the world clock and choose **Clock Checked — Dismiss This Window** before starting another group window; the module does not automatically retry that advance.

Run `node tests/short-rest.test.mjs` for the group-rest regression tests. These use mocked Foundry APIs; validate separate player clients and a GM in a spare Foundry v14/D&D5e world before campaign use. Open a sheet rest on one player; have another player confirm they are resting without recovering anything and another choose a different activity. Confirm that the GM sees those choices separately from unanswered characters and completed sheet rests. Let the countdown expire and verify that only GM approval advances exactly one hour. Also check cancellation, changing a choice before expiry, declining the advance, a GM reload during the countdown, and a second GM staying free of duplicate prompts.

### Long rests

Version **1.0.7** reformats chat status reports into three columns: Character, Eligible?, and Ready in. Elapsed time appears beneath each character name; durations use compact calendar-aware units such as `7h 50m`. The summary shows the cooldown without a full date/time line.

Version **1.0.6** simplifies status reports: Last Long Rest shows elapsed time only, without the exact completion date and time. Stored timestamps and cooldown calculations remain unchanged.

Version **1.0.4** makes manual **Record Long Rest** GM-only in both the clock submenu and tracker window. Players retain **Check Rest Status**, and their completed character-sheet long rests are still recorded automatically.

Version **1.0.3** automatically records completed D&D5e long rests using the system's `dnd5e.restCompleted` hook. Players can use **Long Rest** on their character sheet as usual; when the rest completes, the tracker saves the current world time and sends them a private recording report. No token on the current scene is required. Short rests and cancelled dialogs do not record anything. The GM can disable **Automatically record D&D5e long rests** in Configure Settings. Manual recording remains available.

Recording occurs after any time advancement performed by D&D5e. Recording a long rest does not itself enforce the cooldown. Group long-rest coordination advances the clock once all tracked characters complete their rests; group short rests advance time after GM approval. Rest-modifying modules must emit the standard completion hook to be tracked automatically. Test a sheet long rest and a cancelled rest in your v14 world before campaign use.

- **Record Long Rest** (GM only) selects player-owned `character` actors on the current scene. It records the current world time as the completion time.
- **Check Rest Status** checks characters on the current scene for which you have Observer permission or higher. Results are whispered only to the user requesting them.
- **Set Cooldown** is available to the GM; the default is 24 calendar hours. You can also edit the world setting under Configure Settings. Use a finite number greater than or equal to zero.

The module does not execute D&D5e rest mechanics, restore resources, or enforce rest restrictions. World time can be advanced through Foundry's calendar/time controls the GM-approved group short-rest prompt, or the collective eight-hour long-rest advance; run a fresh status check to see updated results. A new record replaces the previous completion time even when the cooldown has not elapsed, matching the original macro.

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
