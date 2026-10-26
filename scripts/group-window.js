import {escapeHTML as esc} from "./time.js";

// Short and long rest trackers share one application on each client. Serialize
// rendering across both trackers, rather than maintaining two independent dialogs.
const clients = new WeakMap();
export function groupRestWindow() {
  if (clients.has(game)) return clients.get(game);
  let dialog, selected, rendering = Promise.resolve();
  const views = new Map();
  const text = key => game.i18n.localize(`LRT.${key}`);
  const render = () => {
    rendering = rendering.catch(() => {}).then(async () => {
      if (!views.size) {
        if (dialog) await dialog.close();
        dialog = null;
        return;
      }
      if (!views.has(selected)) selected = views.keys().next().value;
      if (!dialog) dialog = new foundry.applications.api.DialogV2({
        classes: ["long-rest-tracker", "lrt-group-rest"], position: {width: 360, height: "auto"},
        window: {title: text("GroupRestTitle")}, content: '<div class="lrt-group-window"></div>',
        buttons: [{action: "close", label: text("Close")}]
      });
      if (!dialog.element?.isConnected) await dialog.render({force: true});
      const root = dialog.element.querySelector(".lrt-group-window");
      const view = views.get(selected);
      const tabs = views.size > 1 ? `<nav class="lrt-group-tabs" aria-label="${esc(text("GroupRestTitle"))}">${[...views.keys()].map(type => `<button type="button" data-lrt-tab="${type}" aria-pressed="${type === selected}">${esc(text(type === "short" ? "GroupShortTab" : "GroupLongTab"))}</button>`).join("")}</nav>` : "";
      root.innerHTML = `${tabs}${view.content}<div class="lrt-group-actions">${view.buttons.map(button => `<button type="button" data-lrt-action="${button.action}">${esc(button.label)}</button>`).join("")}</div>`;
      if (view.timerText) root.querySelector(".lrt-group-timer").textContent = view.timerText;
      dialog.setPosition?.({height: "auto"});
      root.onclick = async event => {
        const tab = event.target.closest("[data-lrt-tab]");
        if (tab) { selected = tab.dataset.lrtTab; await render(); return; }
        const action = event.target.closest("[data-lrt-action]");
        if (!action) return;
        const button = views.get(selected)?.buttons.find(button => button.action === action.dataset.lrtAction);
        await button?.callback?.();
      };
    });
    return rendering;
  };
  const api = {
    show(type, view, activate = false) {
      views.set(type, view);
      if (activate || !selected) selected = type;
      return render();
    },
    hide(type) { views.delete(type); return render(); },
    tick(type, label) {
      const view = views.get(type);
      if (view) view.timerText = label;
      if (type === selected) {
        const timer = dialog?.element?.querySelector(".lrt-group-timer");
        if (timer) timer.textContent = label;
      }
    }
  };
  clients.set(game, api);
  return api;
}
