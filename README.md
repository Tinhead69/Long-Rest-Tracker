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

### Debugging fixes (1.0.14)

Timeout transitions now save a copy of cached settings so other clients receive the update. Reconnecting GMs replay rest starts in chronological order. Clock updates with an uncertain outcome cannot be retried automatically, and invalid timestamps or overflowing durations are rejected before calling a clock API. Long-rest timestamps use one shared finishing time; if one actor update fails, the remaining actors are still saved and the GM is told which records need manual repair.

### Two-pane rest window (1.0.13)

The compact group window has two stacked panes with colored header bars and character counts. The upper green pane lists characters taking a rest; the lower amber pane lists characters who have not clicked or are not taking a rest. This layout applies to both short and long rests.

### Compact group window (1.0.12)

The group window shows only **Taking a short rest** (or long rest) and **Awaiting a response**. Clicking the matching rest button on a character sheet immediately moves that character to the taking-rest list, including the character who starts the countdown. There is no additional participation dialog. Cancelling the sheet dialog does not undo the click shown in this list; completing a sheet rest remains a separate requirement for the automatic collective long-rest advance.

The window uses a compact 360px width and scoped 12–13px text. Its visible timer updates every second. The short-rest countdown still runs for two minutes before the GM decision; long rests can finish early when everyone completes their sheet rest.

### Enable or disable shared rests (1.0.11)

The GM can toggle **Configure Settings → Long Rest Tracker → Enable shared rest coordination**. It is on by default. Turning it off stops group windows, countdowns, and shared clock advances, cancels pending group windows, and allows D&D5e to handle time normally. Long-rest recording and cooldown checks remain available. Re-enabling starts with new group windows rather than resuming a cancelled one. An advance already submitted to the clock cannot be undone by this toggle.

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

Opening the first D&D5e long-rest dialog starts a group window with the same two-minute countdown as a short rest. Clicking a sheet rest button marks that character as taking a rest; characters who have not clicked remain awaiting a response. The party roster is captured from player-owned world characters and the initiating token actor when the window begins.

**Once every character in that roster completes a long rest on their sheet, the active GM's client automatically advances the clock by eight calendar hours, once for the whole party.** There is no additional GM approval or need to wait out the countdown when everyone has finished. Opening and cancelling a dialog, does not complete a rest. Characters who need no recovery should still complete their sheet's long-rest dialog to join this advance.

If someone has not completed a long rest after two minutes, the GM sees the outstanding characters and time stays unchanged. Players can still complete their sheet rests after the countdown expires; the last required completion triggers the eight-hour advance. Alternatively the GM can end the group window without advancing time. This differs from short rests, whose one-hour advance always requires a GM decision.

The module suppresses D&D5e's individual long-rest time advancement while **Coordinate group long rests** is enabled. Automatic long-rest records are updated to the end of the shared eight-hour period, so the cooldown starts at the collective completion time. Disabling automatic long-rest recording leaves the group time coordination available. Other modules and manual time changes remain outside this coordination. An interrupted or failed clock update does not automatically retry; the GM must inspect the clock before dismissing the interrupted window or explicitly retrying a failed advance.

Run `node tests/long-rest.test.mjs` for regression coverage of waiting for the last character, cancellation, late completion, an eight-hour advance, rest timestamps, duplicate events, restoration, failed clock updates, and disabling coordination. Validate this behavior with separate clients in a spare Foundry v14/D&D5e world before campaign use.

### Group short rests (1.0.8)

With D&D5e, opening the first player-owned character's short-rest dialog starts a shared **two-minute real-time countdown**. The active GM sees a compact window with two lists: characters who clicked Short Rest (**Taking a short rest**) and characters who have not (**Awaiting a response**). The initiating character immediately appears in the taking-rest list. There are no extra participation prompts or completed-rest categories. Clicking counts as joining for display purposes even if the sheet dialog is later cancelled; resource recovery still belongs to the system's rest workflow.

At two minutes the GM can choose **Advance 1 Hour** or **Leave Clock Unchanged**. An hour uses the active calendar. Unanswered characters stay visible and the GM decides whether the party's hour passes. The countdown does not end early or extend when another character joins. The roster includes player-owned world characters and participating token actors, with linked actors deduplicated. Long rests are tracked in a separate group window.

The module disables D&D5e's automatic time advancement for these short rests so individual rests do not each advance the clock. Other modules or manual clock changes are outside this control. This feature is enabled by default; disable **Coordinate group short rests** in module settings to restore the system's usual behavior. It operates independently of automatic long-rest recording.

An active GM with the module enabled is required to collect events and show the prompt. Rest events are synchronized through owned Actor flags; the shared window is stored in world settings. An existing window resumes after a GM reload or handover. A GM who was offline before the window began can recover recent events when joining within two minutes. The GM can reopen the current countdown or decision from **Open Tracker → Group Short Rest**. If a reload interrupts a clock update, inspect the world clock and choose **Clock Checked — Dismiss This Window** before starting another group window; the module does not automatically retry that advance.

Run `node tests/short-rest.test.mjs` for regression checks, including an asynchronous render, visible countdown updates, and the initiator's immediate taking-rest status. These use mocked Foundry APIs; test with separate player clients and a GM in a spare Foundry v14/D&D5e world before campaign use. Confirm the small two-list window, watch the seconds decrease, click another character's Short Rest button and check that they move between lists, then confirm the GM alone decides whether the hour passes at timeout. Also test closing/reopening the window, disabling coordination, and a GM reload during the countdown.

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

No dependencies are needed for the Node.js checks. Use Node.js 22 or newer:

```sh
npm test
npm run check
```

The current suite runs 16 tests, including calendar integrations, invalid clock values, rest event collection, visible timer updates with an asynchronous dialog mock, duplicate completion events, permissions, cancelled windows, the master switch, late long rests, failed clock updates, and partial timestamp-saving failures. These use mocked Foundry APIs; they do not establish real database, multiplayer, or system/theme compatibility.

An additional browser check renders the actual module HTML and CSS in Chromium with simulated Foundry services. It verifies both panes, sizes and font rules, the live countdown, participant updates, cached-setting broadcasts, a single clock advance, reconnect ordering, dismissal, and the master switch. Run `npm run test:browser` when Playwright and Chromium are available. The browser executable defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` to use another location. Playwright is an optional test tool and is not needed by the module or the Node tests. For an isolated install, run `npm install --prefix /tmp/lrt-browser-tools --no-package-lock --no-save playwright`, then `NODE_PATH=/tmp/lrt-browser-tools/node_modules CHROMIUM_PATH=/path/to/chromium npm run test:browser`.

The module has not been run in an actual Foundry instance here. Before using it in a campaign, test in a spare v14 world:

1. Add two linked player character tokens and one unlinked character token; open the tracker and confirm the linked actor appears once.
2. Record a rest and check status. Advance world time by 24 calendar hours and check again; eligibility should change to Yes.
3. Reload the world and check that records and the cooldown persist.
4. Check as a player: manual recording and cooldown buttons should be hidden, status checks should work, and completed sheet long rests should still record automatically. Reports should remain private.
5. Rewind world time before a recorded rest; verify the future-record warning.
6. Check a character carrying only the old macro flag; verify its original rest is displayed.

API references: [GameTime](https://foundryvtt.com/api/v14/classes/foundry.helpers.GameTime.html), [CalendarData](https://foundryvtt.com/api/v14/classes/foundry.data.CalendarData.html), [DialogV2](https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html).
