import { moduleDefinition as executiveSummary } from "./modules/executive-summary/index.js";
import { moduleDefinition as cells } from "./modules/cells/index.js";
import { moduleDefinition as users } from "./modules/users/index.js";
import { moduleDefinition as quarters } from "./modules/quarters/index.js";
import { createReportContext } from "./services/reports-store.js";
import { renderModuleError } from "./components/error-card.js";

const modules = [executiveSummary, cells, users, quarters];

const state = {
  activeModuleId: "executive-summary",
  context: null,
};

function qs(selector) {
  return document.querySelector(selector);
}

function renderTabs(container) {
  if (!container) return;
  container.innerHTML = modules
    .map(
      (module) => `
        <button class="reports-module-tab${module.id === state.activeModuleId ? " is-active" : ""}" type="button" data-module-id="${module.id}">
          <i class="bi ${module.icon || "bi-circle"}"></i>
          <span>${module.title}</span>
        </button>
      `
    )
    .join("");
}

function mountActiveModule() {
  const host = qs("#reports-module-host");
  if (!host) return;
  const activeModule = modules.find((module) => module.id === state.activeModuleId) || modules[0];
  host.innerHTML = "";
  const container = document.createElement("div");
  container.className = "reports-module-container";
  container.dataset.moduleId = activeModule.id;
  host.appendChild(container);
  try {
    activeModule.mount(container, state.context);
    activeModule.update(state.context);
  } catch (error) {
    renderModuleError(container, error, activeModule.title);
  }
}

function bindTabs(container) {
  if (!container || container.dataset.bound) return;
  container.dataset.bound = "true";
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-module-id]");
    if (!button) return;
    state.activeModuleId = button.dataset.moduleId;
    renderTabs(container);
    mountActiveModule();
  });
}

async function initReports() {
  const tabs = qs("#reports-module-tabs");
  state.context = await createReportContext({
    filters: {
      celulaId: "",
      sprintId: "",
      quarter: "",
      userId: "",
    },
  });
  renderTabs(tabs);
  bindTabs(tabs);
  mountActiveModule();
}

document.addEventListener("DOMContentLoaded", () => {
  initReports().catch((error) => {
    renderModuleError(qs("#reports-module-host"), error, "Reportes");
  });
});
