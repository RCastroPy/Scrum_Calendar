(() => {
  const API_HOSTS = Array.from(
    new Set([window.location.hostname, "localhost", "127.0.0.1"].filter(Boolean))
  );
  let API_BASE = `http://${API_HOSTS[0]}:8000`;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const xhrRequest = (url, options = {}) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method || "GET", url, true);
      xhr.withCredentials = true;
      const headers = options.headers || {};
      Object.entries(headers).forEach(([key, value]) => {
        if (value !== undefined) {
          xhr.setRequestHeader(key, value);
        }
      });
      xhr.onload = () => {
        const response = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          text: async () => xhr.responseText,
          json: async () => JSON.parse(xhr.responseText || "null"),
        };
        resolve(response);
      };
      xhr.onerror = () => reject(new Error("XHR error"));
      xhr.send(options.body || null);
    });

  const fetchWithFallback = async (path, options) => {
    let lastError;
    for (const host of API_HOSTS) {
      const base = `http://${host}:8000`;
      try {
        const mergedOptions = { credentials: "include", ...options };
        const useFetch = !isSafari || (window.location.port === "8000" && host === window.location.hostname);
        const res = useFetch
          ? await fetch(`${base}${path}`, mergedOptions)
          : await xhrRequest(`${base}${path}`, mergedOptions);
        API_BASE = base;
        return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };
  const THEME_KEY = "scrum_calendar_theme";
  const resolveTheme = () => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) return saved;
    } catch (err) {
      // ignore storage errors
    }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  };

  const applyTheme = (theme) => {
    const mode = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-bs-theme", mode);
    if (document.body) {
      document.body.classList.toggle("theme-dark", mode === "dark");
    }
  };

  const themeState = { value: resolveTheme() };
  applyTheme(themeState.value);

  const state = {
    base: null,
    user: null,
    capacidadSeries: [],
    lastSprintCelulaId: "",
    selectedCelulaId: "",
    selectedSprintId: "",
    calendar: { offset: 0 },
    oneononeMonthOffset: 0,
    oneononePersonId: "",
    oneononeNotesCache: {},
    oneononeSaveTimer: null,
    oneononeSessionsCache: {},
    oneononeEditingSessionId: "",
    adminSearch: "",
    adminPage: {},
    adminSelections: {},
    dailyCapacityCache: {},
    dailySelectedPersonaId: "",
    dailySelectedAssignee: "",
    dailyStatusFilters: [],
    dailyStatusOpen: false,
    dailyStatusOutsideBound: false,
    dailyStatusTouched: false,
    dailySprintOpen: false,
    retroCommitmentFilter: "pendiente",
    retroPresence: { total: 0, personas: [] },
    retroActiveId: "",
    pokerSessionId: "",
    pokerPresence: { total: 0, personas: [] },
    pokerVotes: [],
    tableSort: {},
    tableFilters: {},
    tableDataPage: {},
    releaseStatusFilter: "",
    serverNow: null,
    serverToday: null,
    serverTimezone: "America/Asuncion",
  };

  const getAdminSelection = (tableKey) => {
    state.adminSelections = state.adminSelections || {};
    if (!state.adminSelections[tableKey]) {
      state.adminSelections[tableKey] = new Set();
    }
    return state.adminSelections[tableKey];
  };

  const buildAdminRowCheckbox = (row, tableKey, onUpdateHeader) => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "row-select";
    if (!row?.id) {
      checkbox.disabled = true;
      return checkbox;
    }
    const selection = getAdminSelection(tableKey);
    checkbox.checked = selection.has(row.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selection.add(row.id);
      } else {
        selection.delete(row.id);
      }
      if (typeof onUpdateHeader === "function") {
        onUpdateHeader();
      }
    });
    return checkbox;
  };

  const qs = (sel, scope = document) => scope.querySelector(sel);
  const pageName = document.body?.dataset?.page || "";
  const isLoginView = () => pageName === "login" || Boolean(qs("#login-form"));
  const isPublicRetroView = () =>
    pageName === "retro-public" ||
    /retro-public\.html$/i.test(window.location.pathname) ||
    Boolean(qs("#retro-public-form"));
  const isPublicPokerView = () =>
    pageName === "poker-public" ||
    /poker-public\.html$/i.test(window.location.pathname) ||
    Boolean(qs("#poker-public-form"));
  let authRedirecting = false;

  function buildNextPath() {
    const path = window.location.pathname;
    const file = path.split("/").pop();
    const page = file && file.includes(".html") ? file : "index.html";
    return `${page}${window.location.search}${window.location.hash}`;
  }

  function redirectToLogin() {
    if (authRedirecting || isLoginView() || isPublicRetroView() || isPublicPokerView()) return;
    authRedirecting = true;
    const next = encodeURIComponent(buildNextPath());
    window.location.href = `login.html?next=${next}`;
  }

  function applyRoleVisibility() {
    const isAdmin = state.user?.rol === "admin";
    document.querySelectorAll("[data-role='admin']").forEach((el) => {
      el.classList.toggle("hidden", !isAdmin);
    });
  }

  function enforcePageAccess() {
    if (!state.user) return;
    if (
      state.user.rol !== "admin" &&
      pageName &&
      pageName !== "dashboard" &&
      pageName !== "retro-public"
    ) {
      window.location.href = "index.html";
    }
  }
  const getToday = () => {
    if (state.serverToday instanceof Date && !Number.isNaN(state.serverToday.valueOf())) {
      const copy = new Date(state.serverToday.getTime());
      copy.setHours(0, 0, 0, 0);
      return copy;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const getNow = () => {
    if (state.serverNow instanceof Date && !Number.isNaN(state.serverNow.valueOf())) {
      return new Date(state.serverNow.getTime());
    }
    return new Date();
  };

  const toggle = qs("#menu-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      document.body.classList.toggle("menu-collapsed");
    });
  }

  const themeToggle = qs("#theme-toggle");
  if (themeToggle) {
    const icon = themeToggle.querySelector("i");
    const syncThemeIcon = () => {
      if (icon) {
        icon.className = themeState.value === "dark" ? "bi bi-sun" : "bi bi-moon-stars";
      }
      themeToggle.setAttribute("aria-pressed", themeState.value === "dark");
    };
    syncThemeIcon();
    themeToggle.addEventListener("click", () => {
      themeState.value = themeState.value === "dark" ? "light" : "dark";
      applyTheme(themeState.value);
      try {
        localStorage.setItem(THEME_KEY, themeState.value);
      } catch (err) {
        // ignore storage errors
      }
      syncThemeIcon();
    });
  }

  const savedCelulaId = localStorage.getItem("scrum_calendar_celula_id");
  if (savedCelulaId) {
    state.selectedCelulaId = savedCelulaId;
  }

  const toggleMenuGroup = (group) => {
    group.classList.toggle("open");
    group.classList.toggle("menu-open");
  };

  document.querySelectorAll(".submenu-toggle").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const group = button.closest(".menu-group");
      if (group) {
        toggleMenuGroup(group);
      }
    });
  });

  document.querySelectorAll(".menu-group > .nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      const group = link.closest(".menu-group");
      if (!group) return;
      event.preventDefault();
      toggleMenuGroup(group);
    });
  });

  async function fetchJson(path) {
    const res = await fetchWithFallback(path);
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        redirectToLogin();
      }
      throw new Error(text || `API error: ${path}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Respuesta invalida: ${path}`);
    }
  }

  async function postJson(path, payload) {
    const res = await fetchWithFallback(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      if (res.status === 401) {
        redirectToLogin();
      }
      const text = await res.text();
      throw new Error(text || `API error: ${path}`);
    }
    return res.json();
  }

  async function putJson(path, payload) {
    const res = await fetchWithFallback(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      if (res.status === 401) {
        redirectToLogin();
      }
      const text = await res.text();
      throw new Error(text || `API error: ${path}`);
    }
    return res.json();
  }

  const setButtonBusy = (button, busy, label) => {
    if (!button) return;
    if (busy) {
      if (!button.dataset.label) {
        button.dataset.label = button.textContent || "";
      }
      if (label) {
        button.textContent = label;
      }
      button.classList.add("is-busy");
      button.classList.remove("is-waiting");
      button.disabled = true;
    } else {
      if (button.dataset.label) {
        button.textContent = button.dataset.label;
      }
      button.classList.remove("is-busy");
      button.disabled = false;
    }
  };

  const withButtonBusy = async (button, action, label = "Procesando...") => {
    setButtonBusy(button, true, label);
    try {
      return await action();
    } finally {
      setButtonBusy(button, false);
    }
  };

  const setButtonWaiting = (button, waiting) => {
    if (!button) return;
    button.classList.toggle("is-waiting", waiting);
  };

  const ensureRetroSocket = (token, key, onMessage) => {
    if (!token) return;
    const socketKey = `__retroSocket_${key}`;
    const tokenKey = `__retroSocket_${key}_token`;
    const current = window[socketKey];
    const currentToken = window[tokenKey];
    if (current && current.readyState <= 1 && currentToken === token) return;
    if (current) {
      try {
        current.close();
      } catch (err) {
        // ignore
      }
    }
    const wsBase = API_BASE.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/ws/retros/${encodeURIComponent(token)}`;
    const socket = new WebSocket(wsUrl);
    socket.addEventListener("open", () => {
      const pending = window[`__retroPresencePending_${key}`];
      if (pending) {
        try {
          socket.send(JSON.stringify(pending));
        } catch (err) {
          // ignore
        }
      }
    });
    const pingTimer = window.setInterval(() => {
      if (socket.readyState === 1) {
        socket.send("ping");
      }
    }, 15000);
    socket.addEventListener("message", (event) => {
      if (typeof onMessage === "function") {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch (err) {
          payload = null;
        }
        onMessage(payload || {});
      }
    });
    socket.addEventListener("close", () => {
      window.clearInterval(pingTimer);
    });
    socket.addEventListener("error", () => {
      // keep fallback polling
    });
    window[socketKey] = socket;
    window[tokenKey] = token;
    return socket;
  };

  const sendRetroPresence = (key, payload) => {
    if (!payload) return;
    window[`__retroPresencePending_${key}`] = payload;
    const socket = window[`__retroSocket_${key}`];
    if (socket && socket.readyState === 1) {
      try {
        socket.send(JSON.stringify(payload));
      } catch (err) {
        // ignore
      }
    }
  };

  const ensurePokerSocket = (token, key, onMessage) => {
    if (!token) return null;
    const socketKey = `__pokerSocket_${key}`;
    const tokenKey = `__pokerSocket_${key}_token`;
    const current = window[socketKey];
    const currentToken = window[tokenKey];
    if (current && current.readyState <= 1 && currentToken === token) return current;
    if (current) {
      try {
        current.close();
      } catch (err) {
        // ignore
      }
    }
    const wsBase = API_BASE.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/ws/poker/${encodeURIComponent(token)}`;
    const socket = new WebSocket(wsUrl);
    const pingTimer = window.setInterval(() => {
      if (socket.readyState === 1) {
        socket.send("ping");
      }
    }, 15000);
    socket.addEventListener("open", () => {
      const pending = window[`__pokerPresencePending_${key}`];
      if (pending) {
        try {
          socket.send(JSON.stringify(pending));
        } catch (err) {
          // ignore
        }
      }
    });
    socket.addEventListener("message", (event) => {
      if (typeof onMessage === "function") {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch (err) {
          payload = null;
        }
        onMessage(payload || {});
      }
    });
    socket.addEventListener("close", () => {
      window.clearInterval(pingTimer);
    });
    socket.addEventListener("error", () => {
      // keep fallback polling
    });
    window[socketKey] = socket;
    window[tokenKey] = token;
    return socket;
  };

  const sendPokerPresence = (key, payload) => {
    if (!payload) return;
    window[`__pokerPresencePending_${key}`] = payload;
    const socket = window[`__pokerSocket_${key}`];
    if (socket && socket.readyState === 1) {
      try {
        socket.send(JSON.stringify(payload));
      } catch (err) {
        // ignore
      }
    }
  };

  async function initLogin() {
    const form = qs("#login-form");
    if (!form) return null;
    const error = qs("#login-error");
    const bootstrapBtn = qs("#bootstrap-btn");
    const nextParam = new URLSearchParams(window.location.search).get("next") || "";
    const safeNext = nextParam && !nextParam.includes("/") ? nextParam : "index.html";

    const setError = (message) => {
      if (error) {
        error.textContent = message || "";
      }
    };

    try {
      const me = await fetchJson("/auth/me");
      if (me) {
        window.location.href = safeNext;
        return me;
      }
    } catch {
      // ignore
    }

    const submitAuth = async (endpoint) => {
      const username = (form.username?.value || "").trim();
      const password = form.password?.value || "";
      if (!username || !password) {
        setError("Completa usuario y password.");
        return;
      }
      setError("");
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      if (bootstrapBtn) bootstrapBtn.disabled = true;
      try {
        await postJson(endpoint, { username, password });
        window.location.href = safeNext;
      } catch (err) {
        let message = err?.message || "No se pudo iniciar sesion.";
        try {
          const parsed = JSON.parse(message);
          if (parsed?.detail) {
            message = parsed.detail;
          }
        } catch {
          // ignore
        }
        setError(message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (bootstrapBtn) bootstrapBtn.disabled = false;
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitAuth("/auth/login");
    });

    if (bootstrapBtn) {
      bootstrapBtn.addEventListener("click", () => {
        submitAuth("/auth/bootstrap");
      });
    }

    return null;
  }

  async function initAuth() {
    if (isLoginView()) {
      await initLogin();
      return null;
    }
    if (isPublicRetroView() || isPublicPokerView()) {
      return null;
    }
    try {
      const user = await fetchJson("/auth/me");
      state.user = user;
      applyRoleVisibility();
      initLogout();
      enforcePageAccess();
      return user;
    } catch {
      redirectToLogin();
      return null;
    }
  }

  async function copyToClipboard(text, inputEl) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback below
    }
    try {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
        inputEl.setSelectionRange(0, text.length);
        const ok = document.execCommand("copy");
        inputEl.blur();
        return ok;
      }
    } catch {
      // ignore
    }
    return false;
  }

  function initLogout() {
    const logoutBtn = qs("#logout-btn");
    if (!logoutBtn || logoutBtn.dataset.bound === "true") return;
    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetchWithFallback("/auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      redirectToLogin();
    });
  }

  function fillSelect(select, items, opts = {}) {
    const { valueKey = "id", labelKey = "nombre", includeEmpty = false } = opts;
    if (!select) return;
    select.innerHTML = includeEmpty ? '<option value="">Sin sprint</option>' : "";
    items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item[valueKey];
      opt.textContent = item[labelKey];
      select.appendChild(opt);
    });
  }

  function setStatus(id, text, type = "info") {
    const el = qs(id);
    if (!el) return;
    el.textContent = text;
    el.dataset.type = type;
  }

  function setFormMode(form, mode, id, buttonText) {
    if (!form) return;
    form.dataset.mode = mode;
    form.dataset.editId = id ? String(id) : "";
    const button = form.querySelector("button[type='submit']");
    if (buttonText) {
      button.textContent = buttonText;
    }
  }

  function resetFormMode(form, defaultText) {
    if (!form) return;
    form.dataset.mode = "create";
    form.dataset.editId = "";
    const button = form.querySelector("button[type='submit']");
    if (button) button.textContent = defaultText;
    if (defaultText) {
      form.dataset.defaultText = defaultText;
    }
  }

  function ensureAdminModal() {
    let modal = qs("#admin-edit-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "admin-edit-modal";
      modal.className = "admin-modal";
      modal.innerHTML = `
        <div class="admin-modal-backdrop"></div>
        <div class="admin-modal-card" role="dialog" aria-modal="true">
          <div class="admin-modal-header">
            <h3 class="admin-modal-title" id="admin-modal-title">Editar</h3>
            <button type="button" class="admin-modal-close" aria-label="Cerrar">×</button>
          </div>
          <div class="admin-modal-body" id="admin-modal-body"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    if (!qs("#admin-modal-styles")) {
      const style = document.createElement("style");
      style.id = "admin-modal-styles";
      style.textContent = `
        .admin-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:2000}
        .admin-modal.open{display:flex}
        .admin-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45)}
        .admin-modal-card{position:relative;background:#fff;max-width:720px;width:90%;max-height:90vh;overflow:auto;border-radius:12px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.2)}
        .admin-modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .admin-modal-title{margin:0;font-size:1.1rem}
        .admin-modal-close{border:none;background:transparent;font-size:1.5rem;line-height:1;cursor:pointer}
        body.theme-dark .admin-modal-card{background:#1e293b;color:#e2e8f0}
      `;
      document.head.appendChild(style);
    }
    return modal;
  }

  const modalState = { form: null, placeholder: null };

  function openAdminModal(form, title) {
    if (!form) return;
    const modal = ensureAdminModal();
    const body = modal.querySelector("#admin-modal-body");
    const titleEl = modal.querySelector("#admin-modal-title");
    const closeBtn = modal.querySelector(".admin-modal-close");
    const backdrop = modal.querySelector(".admin-modal-backdrop");
    if (titleEl) titleEl.textContent = title || "Editar";
    if (modalState.form && modalState.form !== form) {
      closeAdminModal();
    }
    if (!modalState.placeholder) {
      const placeholder = document.createElement("div");
      placeholder.className = "admin-modal-placeholder";
      form.parentNode?.insertBefore(placeholder, form);
      modalState.placeholder = placeholder;
    }
    modalState.form = form;
    if (body && form.parentNode !== body) {
      body.appendChild(form);
    }
    const closeHandler = () => closeAdminModal(true);
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", closeHandler);
    }
    if (backdrop && !backdrop.dataset.bound) {
      backdrop.dataset.bound = "true";
      backdrop.addEventListener("click", closeHandler);
    }
    if (!modal.dataset.bound) {
      modal.dataset.bound = "true";
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAdminModal(true);
      });
    }
    modal.classList.add("open");
  }

  function closeAdminModal(resetForm = false) {
    const modal = qs("#admin-edit-modal");
    if (!modal || !modalState.form) return;
    if (modalState.placeholder && modalState.placeholder.parentNode) {
      modalState.placeholder.parentNode.insertBefore(modalState.form, modalState.placeholder);
      modalState.placeholder.remove();
    }
    if (resetForm) {
      modalState.form.reset();
      const defaultText = modalState.form.dataset.defaultText || "Guardar";
      resetFormMode(modalState.form, defaultText);
    }
    modalState.form = null;
    modalState.placeholder = null;
    modal.classList.remove("open");
  }

  function formatDate(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  const isPersonaActiva = (persona) => persona?.activo !== false;
  const filterActivePersonas = (personas = []) => personas.filter(isPersonaActiva);

  function getStatusLabel(status) {
    const normalized = normalizeText(status);
    if (!normalized) return "";
    if (normalized.includes("finalizada") || normalized.includes("finalizado")) {
      return "Finalizada";
    }
    if (normalized.includes("in progress") || normalized.includes("progress")) {
      return "In Progress";
    }
    if (normalized.includes("to do")) {
      return "To Do";
    }
    if (normalized.includes("cancelada") || normalized.includes("cancelado")) {
      return "Cancelada";
    }
    if (normalized.includes("backlog")) {
      return "Backlog";
    }
    return String(status ?? "").trim();
  }

  function isDoneStatus(value) {
    const normalized = normalizeText(value);
    return [
      "finalizada",
      "finalizado",
      "done",
      "cerrada",
      "cerrado",
      "closed",
      "resuelto",
      "resuelta",
    ].some((label) => normalized.includes(label));
  }

  function formatDaysValue(value) {
    if (value === null || value === undefined) return "-";
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function countWeekdays(start, end, feriadosSet) {
    if (!start || !end) return 0;
    const startDate = parseDateOnly(start);
    const endDate = parseDateOnly(end);
    if (!startDate || !endDate) return 0;
    let count = 0;
    const cursor = new Date(startDate);
    const step = endDate >= startDate ? 1 : -1;
    while ((step > 0 && cursor <= endDate) || (step < 0 && cursor >= endDate)) {
      const day = cursor.getDay();
      const key = formatISO(cursor);
      const isHoliday = feriadosSet?.has(key);
      if (day !== 0 && day !== 6 && !isHoliday) {
        count += 1;
      }
      cursor.setDate(cursor.getDate() + step);
    }
    return step < 0 ? -count : count;
  }

  function countSprintBusinessDays(start, end, feriadosSet, rangeEnd) {
    if (!start || !end) return 0;
    const limit = rangeEnd && rangeEnd < end ? rangeEnd : end;
    if (!limit || limit < start) return 0;
    const sprintStartKey = formatISO(start);
    const sprintEndKey = formatISO(end);
    const sameDay = sprintStartKey === sprintEndKey;
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= limit) {
      const key = formatISO(cursor);
      const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
      if (!isWeekend && !feriadosSet.has(key)) {
        let factor = 1;
        if (!sameDay) {
          if (key === sprintStartKey || key === sprintEndKey) {
            factor = 0.5;
          }
        }
        count += factor;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function getSprintRemainingDays(sprint, feriados) {
    if (!sprint) return { remaining: 0, total: 0, ratio: 0 };
    const start = parseDateOnly(sprint.fecha_inicio);
    const end = parseDateOnly(sprint.fecha_fin);
    if (!start || !end) return { remaining: 0, total: 0, ratio: 0 };
    const feriadosSet = new Set((feriados || []).map((feriado) => feriado.fecha));
    const totalDays = countSprintBusinessDays(start, end, feriadosSet);
    let remainingDays = 0;
    const today = getToday();
    if (today < start) {
      remainingDays = totalDays;
    } else if (today > end) {
      remainingDays = 0;
    } else {
      const elapsed = countSprintBusinessDays(start, end, feriadosSet, today);
      remainingDays = Math.max(0, totalDays - elapsed);
    }
    const ratio = totalDays > 0 ? Math.max(0, Math.min(1, remainingDays / totalDays)) : 0;
    return { remaining: remainingDays, total: totalDays, ratio };
  }

  function resolveCelulaId(value, cells) {
    if (!value) return "";
    const list = Array.isArray(cells) ? cells : [];
    const exact = list.find((celula) => String(celula.id) === String(value));
    if (exact) return String(exact.id);
    const normalized = normalizeText(value);
    const match = list.find((celula) => {
      const name = normalizeText(celula.nombre);
      return name === normalized || name.includes(normalized) || normalized.includes(name);
    });
    return match ? String(match.id) : "";
  }

  function normalizeSprintKey(value) {
    return normalizeText(value).replace(/[^a-z0-9]/g, "");
  }

  function parseDateOnly(value) {
    if (!value) return null;
    const [y, m, d] = value.split("T")[0].split("-");
    if (!y || !m || !d) return null;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function getSprintRank(name) {
    const digits = String(name || "").replace(/\D/g, "");
    if (digits.length < 6) return null;
    const first4 = Number(digits.slice(0, 4));
    const last2 = Number(digits.slice(4, 6));
    const first2 = Number(digits.slice(0, 2));
    const last4 = Number(digits.slice(2, 6));
    const yearFirst = first4 >= 2000 && first4 <= 2100 && last2 >= 1 && last2 <= 53;
    const yearLast = last4 >= 2000 && last4 <= 2100 && first2 >= 1 && first2 <= 53;
    if (yearFirst) return first4 * 100 + last2;
    if (yearLast) return last4 * 100 + first2;
    return null;
  }

  function formatISO(date) {
    return date.toISOString().slice(0, 10);
  }

  function formatRangeLabel(dates) {
    if (!dates.length) return "";
    const sorted = [...dates].sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const startDay = start.getDate();
    const endDay = end.getDate();
    const month = String(end.getMonth() + 1).padStart(2, "0");
    const startLabel = sameMonth
      ? `${startDay}`
      : `${String(startDay).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}`;
    const endLabel = `${endDay}/${month}`;
    return `${startLabel} al ${endLabel}`;
  }

  function initMultiDatePickers() {
    document.querySelectorAll("[data-multi-date]").forEach((wrapper) => {
      if (wrapper.dataset.bound) return;
      wrapper.dataset.bound = "true";
      const input = wrapper.querySelector('input[name="fecha_rango"]');
      const startInput = wrapper.querySelector('input[name="fecha_inicio"]');
      const endInput = wrapper.querySelector('input[name="fecha_fin"]');
      const panel = wrapper.querySelector(".date-panel");
      const monthLabel = wrapper.querySelector(".date-month");
      const grid = wrapper.querySelector(".date-grid");
      const prevBtn = wrapper.querySelector(".date-prev");
      const nextBtn = wrapper.querySelector(".date-next");
      const clearBtn = wrapper.querySelector(".date-clear");
      if (!input || !startInput || !endInput || !panel || !monthLabel || !grid) return;

      const monthNames = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ];
      const weekdays = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
      const selected = new Map();
      let anchor = null;
      let current = new Date();
      current.setDate(1);

      const syncInputs = () => {
        const values = Array.from(selected.keys()).sort();
        if (!values.length) {
          startInput.value = "";
          endInput.value = "";
          input.value = "";
          return;
        }
        const dates = values.map((value) => parseDateOnly(value)).filter(Boolean);
        const sorted = dates.sort((a, b) => a - b);
        startInput.value = formatISO(sorted[0]);
        endInput.value = formatISO(sorted[sorted.length - 1]);
        input.value = formatRangeLabel(sorted);
      };

      const render = () => {
        const year = current.getFullYear();
        const month = current.getMonth();
        monthLabel.textContent = `${monthNames[month]} ${year}`;
        grid.innerHTML = "";
        weekdays.forEach((day) => {
          const head = document.createElement("div");
          head.className = "date-head";
          head.textContent = day;
          grid.appendChild(head);
        });
        const first = new Date(year, month, 1);
        const startOffset = first.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < startOffset; i += 1) {
          const empty = document.createElement("div");
          empty.className = "date-day empty";
          grid.appendChild(empty);
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
          const date = new Date(year, month, day);
          const key = formatISO(date);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "date-day";
          btn.textContent = String(day);
          if (selected.has(key)) btn.classList.add("selected");
          btn.addEventListener("click", () => {
            const target = parseDateOnly(key);
            if (!target) return;
            if (!anchor) {
              anchor = target;
              selected.clear();
              selected.set(key, true);
            } else {
              const start = anchor < target ? anchor : target;
              const end = anchor < target ? target : anchor;
              selected.clear();
              const cursor = new Date(start);
              while (cursor <= end) {
                selected.set(formatISO(cursor), true);
                cursor.setDate(cursor.getDate() + 1);
              }
              anchor = null;
            }
            syncInputs();
            render();
          });
          grid.appendChild(btn);
        }
      };

      const setRange = (startValue, endValue) => {
        selected.clear();
        const start = parseDateOnly(startValue);
        const end = parseDateOnly(endValue);
        if (start && end) {
          const cursor = new Date(start);
          while (cursor <= end) {
            selected.set(formatISO(cursor), true);
            cursor.setDate(cursor.getDate() + 1);
          }
          current = new Date(start.getFullYear(), start.getMonth(), 1);
        }
        syncInputs();
        render();
      };

      input.addEventListener("click", () => {
        panel.classList.toggle("open");
      });
      document.addEventListener("click", (event) => {
        if (!wrapper.contains(event.target)) {
          panel.classList.remove("open");
        }
      });
      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
          render();
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
          render();
        });
      }
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          selected.clear();
          anchor = null;
          syncInputs();
          render();
        });
      }

      if (startInput.value || endInput.value) {
        setRange(startInput.value, endInput.value);
      } else {
        render();
      }
      wrapper._setRange = setRange;
    });
  }

  function setMultiDateRange(form, startValue, endValue) {
    const wrapper = form?.querySelector("[data-multi-date]");
    if (!wrapper) return;
    if (typeof wrapper._setRange === "function") {
      wrapper._setRange(startValue, endValue);
    }
  }

  function getActiveSprint(sprints, today = getToday()) {
    const now = getNow();
    const day = new Date(today);
    day.setHours(0, 0, 0, 0);
    const candidates = sprints
      .map((sprint) => {
        const start = parseDateOnly(sprint.fecha_inicio);
        const end = parseDateOnly(sprint.fecha_fin);
        if (!start || !end) return null;
        if (start <= day && end >= day) {
          return { sprint, start };
        }
        return null;
      })
      .filter(Boolean);
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0].sprint;
    const noonCutoff = new Date(day.getTime());
    noonCutoff.setHours(12, 0, 0, 0);
    const isBeforeNoon = now < noonCutoff;
    const isSameDate = (date) =>
      date &&
      date.getFullYear() === day.getFullYear() &&
      date.getMonth() === day.getMonth() &&
      date.getDate() === day.getDate();
    const morningCandidates = candidates.filter(({ sprint }) =>
      isSameDate(parseDateOnly(sprint.fecha_fin))
    );
    const afternoonCandidates = candidates.filter(({ sprint }) =>
      isSameDate(parseDateOnly(sprint.fecha_inicio))
    );
    const pickLatest = (list) => {
      if (!list.length) return null;
      list.sort((a, b) => b.start - a.start);
      return list[0].sprint;
    };
    if (isBeforeNoon) {
      return pickLatest(morningCandidates) || pickLatest(candidates);
    }
    return pickLatest(afternoonCandidates) || pickLatest(candidates);
  }

  function withinSprint(evento, sprint) {
    const start = new Date(evento.fecha_inicio);
    const end = new Date(evento.fecha_fin);
    const sprintStart = new Date(sprint.fecha_inicio);
    const sprintEnd = new Date(sprint.fecha_fin);
    return end >= sprintStart && start <= sprintEnd;
  }

  function eventBelongsToSprint(evento, sprint) {
    if (!evento || !sprint) return false;
    const start = parseDateOnly(evento.fecha_inicio);
    const end = parseDateOnly(evento.fecha_fin);
    const sprintStart = parseDateOnly(sprint.fecha_inicio);
    const sprintEnd = parseDateOnly(sprint.fecha_fin);
    if (start && end && sprintStart && sprintEnd) {
      return end >= sprintStart && start <= sprintEnd;
    }
    if (evento.sprint_id !== null && evento.sprint_id !== undefined && evento.sprint_id !== "") {
      return String(evento.sprint_id) === String(sprint.id);
    }
    return false;
  }

  function getUpcomingBirthdays(personas, windowDays = 15) {
    const today = getToday();
    const currentMonth = today.getMonth() + 1;
    const currentMonthItems = [];
    const upcomingItems = [];
    (personas || []).forEach((persona) => {
      if (!persona.fecha_cumple) return;
      const [, m, d] = persona.fecha_cumple.split("-");
      const month = Number(m);
      const day = Number(d);
      if (!month || !day) return;
      const label = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
      const item = {
        id: persona.id,
        nombre: `${persona.nombre} ${persona.apellido}`,
        fecha: label,
        celulas: (persona.celulas || []).map((c) => c.nombre).join(", "),
      };
      if (month === currentMonth) {
        currentMonthItems.push({ ...item, sort: day });
        return;
      }
      const thisYear = new Date(today.getFullYear(), month - 1, day);
      const nextDate = thisYear < today ? new Date(today.getFullYear() + 1, month - 1, day) : thisYear;
      const diffDays = Math.round((nextDate - today) / 86400000);
      if (diffDays <= windowDays) {
        upcomingItems.push({ ...item, sort: diffDays });
      }
    });
    const used = new Set();
    const merged = [];
    currentMonthItems
      .sort((a, b) => a.sort - b.sort)
      .forEach((item) => {
        used.add(item.id);
        merged.push(item);
      });
    upcomingItems
      .sort((a, b) => a.sort - b.sort)
      .forEach((item) => {
        if (used.has(item.id)) return;
        used.add(item.id);
        merged.push(item);
      });
    return merged;
  }

  function addDays(dateString, days) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function nextSprintName(name) {
    if (!name) return name;
    const match = name.match(/(.*?)(\d+)\s*$/);
    if (!match) return name;
    const prefix = match[1].trimEnd();
    const next = Number(match[2]) + 1;
    return `${prefix} ${next}`.trim();
  }

  function colorByCapacityPercent(value) {
    if (value >= 90) return "#39ff14";
    if (value >= 80) return "#ffc857";
    if (value >= 70) return "#ff8e3c";
    return "#ff4b4b";
  }

  async function loadBase() {
    const usuariosPromise =
      state.user?.rol === "admin" ? fetchJson("/usuarios").catch(() => []) : Promise.resolve([]);
    const [sprints, cells, personas, eventos, tipos, feriados, sprintItems, releaseItems, timeInfo, usuarios] = await Promise.all([
      fetchJson("/sprints"),
      fetchJson("/celulas"),
      fetchJson("/personas"),
      fetchJson("/eventos"),
      fetchJson("/eventos-tipo"),
      fetchJson("/feriados"),
      fetchJson("/sprint-items").catch(() => []),
      fetchJson("/release-items").catch(() => []),
      fetchJson("/time").catch(() => null),
      usuariosPromise,
    ]);
    if (timeInfo?.today) {
      const parsed = parseDateOnly(timeInfo.today);
      if (parsed) {
        state.serverToday = parsed;
      }
      if (timeInfo.timezone) {
        state.serverTimezone = timeInfo.timezone;
      }
    }
    if (timeInfo?.now) {
      const parsedNow = new Date(timeInfo.now);
      if (!Number.isNaN(parsedNow.getTime())) {
        state.serverNow = parsedNow;
      }
    }
    const sprintsSorted = [...sprints].sort(
      (a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio)
    );
    const tiposSorted = [...tipos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return {
      sprints: sprintsSorted,
      cells,
      personas,
      eventos,
      tipos: tiposSorted,
      feriados,
      sprintItems: sprintItems || [],
      releaseItems: releaseItems || [],
      usuarios: usuarios || [],
    };
  }

  function buildDashboard({
    sprint,
    base,
    capacidad,
    capacidadSeries,
    sprints,
    events,
    eventsAll,
    feriados,
    personas,
    birthdaysPersonas,
  }) {
    const sourceEventos = Array.isArray(events) ? events : base.eventos;
    const calendarEventos = Array.isArray(eventsAll) ? eventsAll : sourceEventos;
    const eventosSprint = sourceEventos.filter((evento) => eventBelongsToSprint(evento, sprint));
    const personasActivas = filterActivePersonas(personas || base.personas || []);

    const personaMap = Object.fromEntries(
      personasActivas.map((persona) => [String(persona.id), `${persona.nombre} ${persona.apellido}`])
    );
    const tipoMap = Object.fromEntries(base.tipos.map((t) => [t.id, t.nombre]));
    const eventosDetallePorPersona = {};
    eventosSprint.forEach((evento) => {
      const tipoName = tipoMap[evento.tipo_evento_id] || "Evento";
      const startLabel = formatDate(evento.fecha_inicio);
      const endLabel = formatDate(evento.fecha_fin);
      const jornada = evento.jornada ? evento.jornada.toUpperCase() : "";
      const jornadaText = jornada && jornada !== "COMPLETO" ? ` (${jornada})` : "";
      const rangeLabel = startLabel === endLabel
        ? startLabel
        : `${startLabel} - ${endLabel}`;
      const detail = `${tipoName} ${rangeLabel}${jornadaText}`;
      if (!eventosDetallePorPersona[evento.persona_id]) {
        eventosDetallePorPersona[evento.persona_id] = [];
      }
      eventosDetallePorPersona[evento.persona_id].push(detail);
    });

    const today = getToday();
    const sprintStart = parseDateOnly(sprint.fecha_inicio);
    const sprintEnd = parseDateOnly(sprint.fecha_fin);
    const holidaySet = new Set((feriados || []).map((feriado) => feriado.fecha));
    const businessDaySet = new Set();
    if (sprintStart && sprintEnd) {
      const cursor = new Date(sprintStart);
      while (cursor <= sprintEnd) {
        const day = cursor.getDay();
        const key = formatISO(cursor);
        const isWeekend = day === 0 || day === 6;
        if (!isWeekend && !holidaySet.has(key)) {
          businessDaySet.add(key);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    const getEventDays = (evento) => {
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end || !sprintStart || !sprintEnd) return 0;
      const rangeStart = start > sprintStart ? start : sprintStart;
      const rangeEnd = end < sprintEnd ? end : sprintEnd;
      if (rangeEnd < rangeStart) return 0;
      const jornadaFactor = evento.jornada === "completo" ? 1 : 0.5;
      let total = 0;
      const cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        const key = formatISO(cursor);
        if (businessDaySet.has(key)) {
          total += jornadaFactor;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return Math.round(total);
    };
    const roundValue = (value) => Math.round(value);

    const eventosPorTipo = {};
    const eventosPorPersona = {};
    const eventosStatus = { planificado: 0, noPlanificado: 0 };
    eventosSprint.forEach((evento) => {
      const eventDays = getEventDays(evento);
      if (eventDays <= 0) return;
      const nombre = tipoMap[evento.tipo_evento_id] || "Otro";
      eventosPorTipo[nombre] = (eventosPorTipo[nombre] || 0) + eventDays;
      eventosPorPersona[evento.persona_id] =
        (eventosPorPersona[evento.persona_id] || 0) + eventDays;
      if (evento.planificado) {
        eventosStatus.planificado += eventDays;
      } else {
        eventosStatus.noPlanificado += eventDays;
      }
    });

    const typeLabels = Object.keys(eventosPorTipo).sort((a, b) => a.localeCompare(b, "es"));
    const typePalette = ["#4ba3ff", "#49d1cc", "#ff6b6b", "#a7f36a", "#ffc857", "#8b5cf6"];
    const typeColorMap = Object.fromEntries(
      typeLabels.map((label, idx) => [label, typePalette[idx % typePalette.length]])
    );
    const getTypeColor = (label) => typeColorMap[label] || "#4ba3ff";
    const countSprintDays = (start, end, rangeEnd) => {
      if (!start || !end) return 0;
      const limit = rangeEnd && rangeEnd < end ? rangeEnd : end;
      if (!limit || limit < start) return 0;
      const sprintStartKey = formatISO(start);
      const sprintEndKey = formatISO(end);
      const sameDay = sprintStartKey === sprintEndKey;
      let count = 0;
      const cursor = new Date(start);
      while (cursor <= limit) {
        const key = formatISO(cursor);
        if (businessDaySet.has(key)) {
          let factor = 1;
          if (!sameDay) {
            if (key === sprintStartKey) factor = 0.5;
            else if (key === sprintEndKey) factor = 0.5;
          }
          count += factor;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return count;
    };
    const totalDays = sprintStart && sprintEnd ? countSprintDays(sprintStart, sprintEnd) : 0;
    let remainingDays = 0;
    if (sprintStart && sprintEnd) {
      if (today < sprintStart) {
        remainingDays = totalDays;
      } else if (today > sprintEnd) {
        remainingDays = 0;
      } else {
        const elapsedDays = countSprintDays(sprintStart, sprintEnd, today);
        remainingDays = Math.max(0, totalDays - elapsedDays);
      }
    }
    const totalDaysForRatio = totalDays > 0 ? totalDays : 1;
    const remainingRatio = Math.max(0, Math.min(1, remainingDays / totalDaysForRatio));
    const formatDays = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

    const ausenciasPorPersona = new Map();
    eventosSprint.forEach((evento) => {
      if (evento.impacto_capacidad <= 0) return;
      const eventDays = getEventDays(evento);
      if (eventDays <= 0) return;
      const impacto = Math.min(Math.max(evento.impacto_capacidad, 0), 100) / 100;
      const current = ausenciasPorPersona.get(evento.persona_id) || 0;
      ausenciasPorPersona.set(evento.persona_id, current + eventDays * impacto);
    });
    const ausenciaEntries = Array.from(ausenciasPorPersona.entries())
      .map(([id, value]) => ({
        id,
        value: Number(value.toFixed(1)),
        nombre: personaMap[String(id)] || `Persona ${id}`,
      }))
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.nombre.localeCompare(b.nombre, "es");
      });
    const ausenciaLabels = ausenciaEntries.length
      ? ausenciaEntries.map((item) => item.nombre)
      : ["Sin ausencias"];
    const ausenciaValues = ausenciaEntries.length
      ? ausenciaEntries.map((item) => item.value)
      : [0];

    const typeLabelMap = {
      Vacaciones: "Vac",
      FLEX: "FLEX",
      Reposo: "Reposo",
      "Dia libre": "Dia libre",
      "Dia libre por cumple": "Cumple",
      "Ventana nocturna": "Ventana",
      "Soporte a otras celulas": "Soporte",
    };
    const typeIds = Object.fromEntries(base.tipos.map((tipo) => [tipo.id, tipo.nombre]));
    const typeUsed = new Set(
      eventosSprint.map((evento) => typeIds[evento.tipo_evento_id] || "Otro")
    );
    const typeOrder = Array.from(typeUsed).sort((a, b) => a.localeCompare(b, "es"));
    const columns = [
      { key: "persona", label: "Persona" },
      ...typeOrder.filter((name) => typeUsed.has(name)).map((name) => ({
        key: name,
        label: typeLabelMap[name] || name,
      })),
    ];
    const summaryMap = new Map();
    eventosSprint.forEach((evento) => {
      const eventDays = getEventDays(evento);
      if (eventDays <= 0) return;
      const typeName = typeIds[evento.tipo_evento_id] || "Otro";
      const row = summaryMap.get(evento.persona_id) || {};
      row[typeName] = (row[typeName] || 0) + eventDays;
      summaryMap.set(evento.persona_id, row);
    });
    const personSummary = Array.from(summaryMap.entries()).map(([personaId, counts]) => ({
      persona:
        personaMap[String(personaId)] || `Persona ${personaId}`,
      counts,
    }));
    return {
      sprintNombre: sprint.nombre || "",
      sprintFechaInicio: sprint.fecha_inicio || "",
      sprintFechaFin: sprint.fecha_fin || "",
      kpis: {
        sprintDias: formatDays(totalDays),
        riesgo: `${(100 - capacidad.porcentaje).toFixed(2)}%`,
        eventos: `${eventosSprint.length}`,
        capacidad: `${capacidad.porcentaje.toFixed(2)}%`,
        capacidadDetalle: `${capacidad.capacidad_real_dias.toFixed(1)}/${capacidad.capacidad_teorica_dias.toFixed(1)} d`,
        estado: capacidad.estado,
      },
      remainingDays,
      totalDays,
      remainingRatio,
      capacityByPerson: {
        labels: capacidad.detalle_por_persona.map((p) => p.nombre),
        series: [
          { name: "Teorica", values: capacidad.detalle_por_persona.map((p) => p.capacidad_teorica) },
          { name: "Real", values: capacidad.detalle_por_persona.map((p) => p.capacidad_real) },
        ],
      },
      capacityOverSprints: {
        labels: [sprint.nombre || ""],
        series: [
          {
            name: "Capacidad %",
            values: [Number(capacidad.porcentaje.toFixed(2))],
          },
        ],
      },
      eventsByType: {
        labels: typeLabels,
        values: typeLabels.map((label) => roundValue(eventosPorTipo[label] || 0)),
        colors: typeLabels.map((label) => getTypeColor(label)),
        suffix: " d",
      },
      eventsStatus: {
        labels: ["Planificado", "No planificado"],
        values: [
          roundValue(eventosStatus.planificado),
          roundValue(eventosStatus.noPlanificado),
        ],
        colors: ["#4ba3ff", "#ffc857"],
        suffix: " d",
      },
      birthdays: getUpcomingBirthdays(birthdaysPersonas || personasActivas),
      sprints,
      activeSprintId: sprint.id,
      calendarEvents: calendarEventos,
      tipos: base.tipos || [],
      feriados: feriados || base.feriados || [],
      personas: personasActivas,
      eventsByPerson: (() => {
        const ids = Object.keys(eventosPorPersona);
        return {
          labels: ids.map((id) => personaMap[id] || `Persona ${id}`),
          values: ids.map((id) => roundValue(eventosPorPersona[id] || 0)),
          details: ids.map((id) => eventosDetallePorPersona[id] || []),
          suffix: " d",
        };
      })(),
      absenceByPerson: {
        labels: ausenciaLabels,
        values: ausenciaValues,
        colors: ausenciaLabels.map(() => "#ff6b6b"),
        suffix: " d",
      },
      capacityBySprint: (() => {
        const series = Array.isArray(capacidadSeries) ? capacidadSeries : [];
        const labels = series.length ? series.map((item) => item.nombre) : [sprint.nombre || ""];
        const values = series.length
          ? series.map((item) => Number(item.porcentaje.toFixed(2)))
          : [Number(capacidad.porcentaje.toFixed(2))];
        return {
          labels,
          values,
          colors: values.map((value) => colorByCapacityPercent(value)),
          suffix: "%",
        };
      })(),
      personSummary: {
        columns,
        rows: personSummary,
      },
      eventsByJornada: {
        labels: capacidadSeries.map((item) => item.nombre),
        series: [
          { name: "Completo", values: capacidadSeries.map((item) => item.jornada.completo), color: "#4ba3ff" },
          { name: "AM", values: capacidadSeries.map((item) => item.jornada.am), color: "#49d1cc" },
          { name: "PM", values: capacidadSeries.map((item) => item.jornada.pm), color: "#ff6b6b" },
        ],
      },
    };
  }

  async function loadDashboardData(base, celulaId) {
    const sprints = celulaId
      ? base.sprints.filter((sprint) => String(sprint.celula_id) === String(celulaId))
      : base.sprints;
    if (!sprints.length) {
      return null;
    }
    const personasActivas = filterActivePersonas(base.personas || []);
    const activePersonaIds = new Set(personasActivas.map((persona) => persona.id));
    const personasAll = base.personas || [];
    const personasAllFiltradas = celulaId
      ? personasAll.filter((persona) =>
          (persona.celulas || []).some((celula) => String(celula.id) === String(celulaId))
        )
      : personasAll;
    const activeSprint = getActiveSprint(sprints) || sprints[0];
    let selectedSprint = state.selectedSprintId
      ? sprints.find((sprint) => String(sprint.id) === state.selectedSprintId)
      : null;
    if (!selectedSprint) {
      selectedSprint = activeSprint;
      state.selectedSprintId = String(activeSprint.id);
    }
    const today = getToday();
    today.setHours(0, 0, 0, 0);
    const upcomingSprints = sprints.filter((sprint) => {
      if (!sprint?.fecha_fin) return true;
      const end = parseDateOnly(sprint.fecha_fin);
      if (!end) return true;
      return end >= today;
    });
    const upcomingSorted = [...upcomingSprints].sort((a, b) => {
      const aStart = parseDateOnly(a.fecha_inicio) || new Date(a.fecha_inicio || 0);
      const bStart = parseDateOnly(b.fecha_inicio) || new Date(b.fecha_inicio || 0);
      return aStart - bStart;
    });
    const capacidadSeries = [];
    for (const sprint of upcomingSorted) {
      const cap = await fetchJson(`/sprints/${sprint.id}/capacidad`);
      const eventosSprint = base.eventos.filter((evento) =>
        eventBelongsToSprint(evento, sprint)
      );
      const jornada = { completo: 0, am: 0, pm: 0 };
      eventosSprint.forEach((evento) => {
        if (evento.jornada === "am") jornada.am += 1;
        else if (evento.jornada === "pm") jornada.pm += 1;
        else jornada.completo += 1;
      });
      capacidadSeries.push({
        nombre: sprint.nombre,
        porcentaje: cap.porcentaje,
        jornada,
        realDias: cap.capacidad_real_dias,
        teoricaDias: cap.capacidad_teorica_dias,
      });
    }
    const capacidad = await fetchJson(`/sprints/${selectedSprint.id}/capacidad`);
    const personaIds = celulaId
      ? new Set(
          personasActivas
            .filter((persona) =>
              (persona.celulas || []).some((celula) => String(celula.id) === String(celulaId))
            )
            .map((persona) => persona.id)
        )
      : null;
    const eventosFiltrados = personaIds
      ? base.eventos.filter((evento) => personaIds.has(evento.persona_id))
      : base.eventos.filter((evento) => activePersonaIds.has(evento.persona_id));
    const personasFiltradas = personaIds
      ? personasActivas.filter((persona) => personaIds.has(persona.id))
      : personasActivas;
    const eventosSprint = eventosFiltrados.filter((evento) =>
      eventBelongsToSprint(evento, selectedSprint)
    );
    const feriadosFiltrados = celulaId
      ? (base.feriados || []).filter(
          (feriado) => !feriado.celula_id || String(feriado.celula_id) === String(celulaId)
        )
      : base.feriados;
    state.capacidadSeries = capacidadSeries;
    const personasCalendario =
      state.user?.rol === "admin" ? personasActivas : personasFiltradas;
    const personasBirthdays =
      state.user?.rol === "admin" ? personasAll : personasAllFiltradas;
    return buildDashboard({
      sprint: selectedSprint,
      base,
      capacidad,
      capacidadSeries,
      sprints,
      events: eventosSprint,
      eventsAll: eventosFiltrados,
      feriados: feriadosFiltrados,
      personas: personasCalendario,
      birthdaysPersonas: personasBirthdays,
    });
  }

  function renderCalendar(
    date = new Date(),
    sprints = [],
    events = [],
    feriados = [],
    personas = [],
    tipos = []
  ) {
    const grid = qs("#calendar-grid");
    const monthLabel = qs("#calendar-month");
    if (!grid || !monthLabel) return;
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthNames = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    monthLabel.textContent = `${monthNames[month]} ${year}`;
    grid.innerHTML = "";
    const weekdays = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    weekdays.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = "calendar-cell head";
      cell.textContent = day;
      grid.appendChild(cell);
    });
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth);
    const tipoMap = Object.fromEntries((tipos || []).map((tipo) => [tipo.id, tipo.nombre]));
    const personaMap = Object.fromEntries(
      (personas || []).map((persona) => [persona.id, `${persona.nombre} ${persona.apellido}`])
    );
    const eventsByDate = new Map();
    const holidayByDate = new Map();
    const birthdayByDate = new Map();
    const holidaySet = new Set(
      (feriados || [])
        .map((feriado) => feriado.fecha)
        .filter(Boolean)
    );
    const iconByType = {
      Vacaciones: "umbrella",
      Enfermedad: "cross",
      Reposo: "cross",
      FLEX: "bolt",
      "Dia libre": "coffee",
      "Soporte a otras celulas": "handshake",
      "Dia libre por cumple": "gift",
      "Ventana nocturna": "moon",
    };
    const iconPaths = {
      cake: "M4 12h16v8H4z M6 8h12v4H6z M9 4h2v3H9z M13 4h2v3h-2z",
      flag: "M5 4h2v16H5z M7 4h10l-2 4 2 4H7z",
      umbrella: "M12 3a7 7 0 017 7H5a7 7 0 017-7zm-1 7h2v6a2 2 0 01-4 0h2a0 0 0 002 0z",
      cross: "M11 4h2v6h6v2h-6v6h-2v-6H5v-2h6z",
      bolt: "M13 2L4 14h6l-1 8 9-12h-6z",
      coffee: "M4 7h12v7a4 4 0 01-4 4H8a4 4 0 01-4-4V7zm12 1h2a3 3 0 010 6h-2",
      handshake: "M4 12l3-3 3 3 4-4 6 6-3 3-3-3-4 4-6-6z",
      gift: "M4 10h16v10H4z M4 7h16v3H4z M11 7h2v13h-2z M8 4a2 2 0 013 0v2H8a2 2 0 010-2zm8 0a2 2 0 00-3 0v2h3a2 2 0 000-2z",
      moon: "M14 2a8 8 0 100 16 7 7 0 01-7-7 7 7 0 017-7z",
      event: "M4 6h16v14H4z M6 3h2v4H6z M16 3h2v4h-2z",
    };
    const createIcon = (key) => {
      const path = iconPaths[key] || iconPaths.event;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
      shape.setAttribute("d", path);
      svg.appendChild(shape);
      return svg;
    };
    const formatEventLabel = (evento) => {
      const tipo = tipoMap[evento.tipo_evento_id] || "Evento";
      const persona = personaMap[evento.persona_id] || `Persona ${evento.persona_id}`;
      const jornada = evento.jornada ? evento.jornada.toUpperCase() : "";
      const jornadaText = jornada && jornada !== "COMPLETO" ? ` (${jornada})` : "";
      return `${tipo} - ${persona}${jornadaText}`;
    };
    (events || []).forEach((evento) => {
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end) return;
      const tipoName = tipoMap[evento.tipo_evento_id] || "Evento";
      const rangeStart = start > monthStart ? start : monthStart;
      const rangeEnd = end < monthEnd ? end : monthEnd;
      if (rangeEnd < rangeStart) return;
      const cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        const key = cursor.toISOString().slice(0, 10);
        const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
        if (isWeekend) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        if (tipoName === "Vacaciones" && holidaySet.has(key)) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        const list = eventsByDate.get(key) || [];
        list.push({
          kind: "evento",
          label: formatEventLabel(evento),
          iconKey: iconByType[tipoName] || "event",
        });
        eventsByDate.set(key, list);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    (feriados || []).forEach((feriado) => {
      if (!feriado?.fecha) return;
      const key = feriado.fecha;
      const list = eventsByDate.get(key) || [];
      list.push({
        kind: "feriado",
        label: `Feriado: ${feriado.nombre}`,
        iconKey: "flag",
      });
      eventsByDate.set(key, list);
      holidayByDate.set(key, true);
    });
    (personas || []).forEach((persona) => {
      if (!persona.fecha_cumple) return;
      const [, m, d] = persona.fecha_cumple.split("-");
      if (!m || !d) return;
      const key = `${year}-${m}-${d}`;
      const list = eventsByDate.get(key) || [];
      list.push({
        kind: "cumple",
        label: `Cumple: ${persona.nombre} ${persona.apellido}`,
        iconKey: "cake",
      });
      eventsByDate.set(key, list);
      birthdayByDate.set(key, true);
    });
    for (let i = 0; i < startOffset; i += 1) {
      const empty = document.createElement("div");
      empty.className = "calendar-cell empty";
      grid.appendChild(empty);
    }
    const sprintRanges = (sprints || [])
      .map((sprint, idx) => {
        if (!sprint?.fecha_inicio || !sprint?.fecha_fin) return null;
        const start = parseDateOnly(sprint.fecha_inicio);
        const end = parseDateOnly(sprint.fecha_fin);
        if (!start || !end) return null;
        return {
          name: sprint.nombre,
          start,
          end,
          color: (idx % 5) + 1,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
    const sprintColors = [
      "rgba(75, 163, 255, 0.28)",
      "rgba(73, 209, 204, 0.28)",
      "rgba(255, 107, 107, 0.22)",
      "rgba(167, 243, 106, 0.26)",
      "rgba(255, 200, 87, 0.26)",
    ];
    const today = getToday();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const formatShort = (value) => {
      const dd = String(value.getDate()).padStart(2, "0");
      const mm = String(value.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}`;
    };
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      const topRow = document.createElement("div");
      topRow.className = "calendar-top";
      const dayLabel = document.createElement("span");
      dayLabel.className = "calendar-day";
      dayLabel.textContent = String(day);
      topRow.appendChild(dayLabel);
      cell.appendChild(topRow);
      const currentDate = new Date(year, month, day);
      const dateKey = currentDate.toISOString().slice(0, 10);
      const sprintMatches = sprintRanges.filter(
        (range) => currentDate >= range.start && currentDate <= range.end
      );
      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
      const showSprintLabel =
        sprintMatches.length && !isWeekend && !holidayByDate.has(dateKey);
      if (sprintMatches.length && !isWeekend && !holidayByDate.has(dateKey)) {
        if (sprintMatches.length > 1) {
          const first = sprintMatches[0];
          const second = sprintMatches[1];
          const colorA = sprintColors[(first.color - 1) % sprintColors.length];
          const colorB = sprintColors[(second.color - 1) % sprintColors.length];
          cell.classList.add("sprint-split");
          cell.style.background = `linear-gradient(90deg, ${colorA} 0% 50%, ${colorB} 50% 100%)`;
          cell.title = `${first.name} | ${second.name}`;
        } else {
          const sprintMatch = sprintMatches[0];
          cell.classList.add(`sprint-${sprintMatch.color}`);
          cell.title = `${sprintMatch.name} (${formatShort(sprintMatch.start)} - ${formatShort(
            sprintMatch.end
          )})`;
        }
      }
      if (showSprintLabel) {
        const sprintShortName = (name) => {
          const raw = String(name || "").trim();
          const match = raw.match(/sprint\s*([0-9]+)/i);
          if (match) return `S${match[1]}`;
          return raw.replace(/^Sprint\s*/i, "S");
        };
        const label = document.createElement("span");
        label.className = "calendar-sprint";
        label.textContent = sprintMatches
          .map((sprint) => sprintShortName(sprint.name))
          .join(" / ");
        topRow.appendChild(label);
      }
      const dayEvents = eventsByDate.get(dateKey) || [];
      if (holidayByDate.has(dateKey)) {
        cell.classList.add("holiday");
      }
      if (birthdayByDate.has(dateKey)) {
        cell.classList.add("birthday");
      }
      if (dayEvents.length) {
        const grouped = new Map();
        dayEvents.forEach((item) => {
          const entry = grouped.get(item.iconKey) || { count: 0, labels: [] };
          entry.count += 1;
          entry.labels.push(item.label);
          grouped.set(item.iconKey, entry);
        });
        const icons = document.createElement("div");
        icons.className = "calendar-events";
        const entries = Array.from(grouped.entries());
        entries.slice(0, 4).forEach(([key, entry]) => {
          const icon = document.createElement("span");
          icon.className = `event-icon icon-${key}`;
          icon.appendChild(createIcon(key));
          const count = document.createElement("span");
          count.className = "event-count";
          count.textContent = String(entry.count);
          icon.appendChild(count);
          icons.appendChild(icon);
        });
        if (entries.length > 4) {
          const more = document.createElement("span");
          more.className = "event-icon more";
          more.textContent = `+${entries.length - 4}`;
          icons.appendChild(more);
        }
        topRow.appendChild(icons);
        const labels = dayEvents.map((item) => item.label);
        const text = document.createElement("div");
        text.className = "calendar-text";
        labels.slice(0, 2).forEach((label) => {
          const line = document.createElement("span");
          line.textContent = label;
          text.appendChild(line);
        });
        if (labels.length > 2) {
          const more = document.createElement("span");
          more.textContent = `+${labels.length - 2} mas`;
          more.title = labels.slice(2).join("\n");
          more.className = "calendar-more";
          text.appendChild(more);
        }
        cell.appendChild(text);
      }
      cell.addEventListener("click", () => {
        openDayModal(dateKey, dayEvents);
      });
      if (isCurrentMonth && today.getDate() === day) {
        cell.classList.add("today");
      }
      grid.appendChild(cell);
    }
  }

  function collectDayEventsForDate(dateKey) {
    if (!state.base) return [];
    const target = parseDateOnly(dateKey);
    if (!target) return [];
    const base = state.base;
    const tipoMap = Object.fromEntries((base.tipos || []).map((tipo) => [tipo.id, tipo.nombre]));
    const personasActivas = filterActivePersonas(base.personas || []);
    const activePersonaIds = new Set(personasActivas.map((persona) => persona.id));
    const personaMap = Object.fromEntries(
      personasActivas.map((persona) => [persona.id, `${persona.nombre} ${persona.apellido}`])
    );
    const personaIds = state.selectedCelulaId
      ? new Set(
          personasActivas
            .filter((persona) =>
              (persona.celulas || []).some(
                (celula) => String(celula.id) === String(state.selectedCelulaId)
              )
            )
            .map((persona) => persona.id)
        )
      : null;
    const eventos = (base.eventos || []).filter(
      (evento) =>
        activePersonaIds.has(evento.persona_id) && (!personaIds || personaIds.has(evento.persona_id))
    );
    const feriados = state.selectedCelulaId
      ? (base.feriados || []).filter(
          (feriado) =>
            !feriado.celula_id || String(feriado.celula_id) === String(state.selectedCelulaId)
        )
      : base.feriados || [];
    const holidaySet = new Set(feriados.map((feriado) => feriado.fecha).filter(Boolean));
    const isWeekend = target.getDay() === 0 || target.getDay() === 6;
    const dayEvents = [];
    eventos.forEach((evento) => {
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end) return;
      if (target < start || target > end) return;
      const tipoName = tipoMap[evento.tipo_evento_id] || "Evento";
      if (tipoName === "Vacaciones" && (isWeekend || holidaySet.has(dateKey))) return;
      const persona = personaMap[evento.persona_id] || `Persona ${evento.persona_id}`;
      const jornada = evento.jornada ? evento.jornada.toUpperCase() : "";
      const jornadaText = jornada && jornada !== "COMPLETO" ? ` (${jornada})` : "";
      dayEvents.push({ label: `${tipoName} - ${persona}${jornadaText}` });
    });
    feriados.forEach((feriado) => {
      if (feriado.fecha === dateKey) {
        dayEvents.push({ label: `Feriado: ${feriado.nombre}` });
      }
    });
    const personasCumple =
      state.user?.rol === "admin"
        ? base.personas || []
        : state.selectedCelulaId
          ? (base.personas || []).filter((persona) =>
              (persona.celulas || []).some(
                (celula) => String(celula.id) === String(state.selectedCelulaId)
              )
            )
          : base.personas || [];
    personasCumple.forEach((persona) => {
      if (!persona.fecha_cumple) return;
      const [, m, d] = persona.fecha_cumple.split("-");
      if (!m || !d) return;
      const key = `${target.getFullYear()}-${m}-${d}`;
      if (key === dateKey) {
        dayEvents.push({ label: `Cumple: ${persona.nombre} ${persona.apellido}` });
      }
    });
    return dayEvents;
  }

  function setupDayEventForm(dateKey) {
    const form = qs("#day-event-form");
    const toggleBtn = qs("#day-event-toggle");
    if (!form || !toggleBtn || !state.base) return;
    const base = state.base;
    const typeSelect = form.querySelector('select[name="tipo"]');
    const personaSelect = form.querySelector('select[name="persona"]');
    const sprintSelect = form.querySelector('select[name="sprint"]');
    const jornadaSelect = form.querySelector('select[name="jornada"]');
    const descInput = form.querySelector('input[name="descripcion"]');
    const startInput = form.querySelector('input[name="fecha_inicio"]');
    const endInput = form.querySelector('input[name="fecha_fin"]');
    const dateLabel = qs("#day-event-date");
    const details = form.querySelector(".modal-fields");
    const statusEl = qs("#day-event-status");

    form.dataset.date = dateKey;
    if (startInput) startInput.value = dateKey;
    if (endInput) endInput.value = dateKey;
    if (dateLabel) dateLabel.textContent = formatDate(dateKey);
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.dataset.type = "";
    }

    const personasActivas = filterActivePersonas(base.personas || []);
    const personasFiltradas = state.selectedCelulaId
      ? personasActivas.filter((persona) =>
          (persona.celulas || []).some(
            (celula) => String(celula.id) === String(state.selectedCelulaId)
          )
        )
      : personasActivas;
    const personaOptions = personasFiltradas.map((p) => ({
      id: p.id,
      nombre: `${p.nombre} ${p.apellido}`,
    }));
    if (personaSelect) {
      personaSelect.innerHTML = '<option value="">Seleccionar</option>';
      personaOptions.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.nombre;
        personaSelect.appendChild(opt);
      });
      personaSelect.disabled = !personaOptions.length;
    }

    if (typeSelect) {
      typeSelect.innerHTML = '<option value="">Seleccionar</option>';
      base.tipos.forEach((tipo) => {
        const opt = document.createElement("option");
        opt.value = tipo.id;
        opt.textContent = tipo.nombre;
        typeSelect.appendChild(opt);
      });
    }

    const sprintsFiltrados = state.selectedCelulaId
      ? base.sprints.filter((sprint) => String(sprint.celula_id) === state.selectedCelulaId)
      : base.sprints;
    if (sprintSelect) {
      fillSelect(sprintSelect, sprintsFiltrados, { includeEmpty: true });
      if (
        state.selectedSprintId &&
        sprintsFiltrados.some((sprint) => String(sprint.id) === state.selectedSprintId)
      ) {
        sprintSelect.value = state.selectedSprintId;
      }
    }

    form.classList.add("is-hidden");
    if (details) details.classList.add("is-hidden");
    if (typeSelect) typeSelect.value = "";
    if (personaSelect) personaSelect.value = "";
    if (sprintSelect && !state.selectedSprintId) sprintSelect.value = "";
    if (jornadaSelect) jornadaSelect.value = "completo";
    if (descInput) descInput.value = "";

    if (!toggleBtn.dataset.bound) {
      toggleBtn.dataset.bound = "true";
      toggleBtn.addEventListener("click", () => {
        form.classList.toggle("is-hidden");
        if (!form.classList.contains("is-hidden") && typeSelect) {
          typeSelect.focus();
        }
      });
    }

    if (typeSelect && !typeSelect.dataset.bound) {
      typeSelect.dataset.bound = "true";
      typeSelect.addEventListener("change", () => {
        if (!details) return;
        if (typeSelect.value) {
          details.classList.remove("is-hidden");
        } else {
          details.classList.add("is-hidden");
        }
      });
    }

    if (!form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!typeSelect?.value) {
          setStatus("#day-event-status", "Selecciona el tipo de evento.", "error");
          return;
        }
        if (!personaSelect?.value) {
          setStatus("#day-event-status", "Selecciona una persona.", "error");
          return;
        }
        try {
          setStatus("#day-event-status", "Guardando...", "info");
          const currentDateKey = form.dataset.date || dateKey;
          const payload = {
            persona_id: Number(personaSelect.value),
            tipo_evento_id: Number(typeSelect.value),
            sprint_id: sprintSelect?.value ? Number(sprintSelect.value) : null,
            fecha_inicio: startInput?.value || currentDateKey,
            fecha_fin: endInput?.value || currentDateKey,
            jornada: jornadaSelect?.value || "completo",
            descripcion: descInput?.value.trim() || null,
          };
          await postJson("/eventos", payload);
          setStatus("#day-event-status", "Evento creado.", "ok");
          await reloadAll();
          const updated = collectDayEventsForDate(currentDateKey);
          openDayModal(currentDateKey, updated);
        } catch (err) {
          setStatus("#day-event-status", err.message || "Error al crear evento.", "error");
        }
      });
    }
  }

  function openDayModal(dateKey, dayEvents) {
    initDayModal();
    const modal = qs("#day-modal");
    if (!modal) return;
    const title = qs("#day-modal-title");
    const list = qs("#day-modal-list");
    if (title) {
      title.textContent = `Detalle del dia ${formatDate(dateKey)}`;
    }
    if (list) {
      list.innerHTML = "";
      if (!dayEvents.length) {
        const li = document.createElement("li");
        li.textContent = "Sin eventos registrados.";
        list.appendChild(li);
      } else {
        const ordered = [...dayEvents].sort((a, b) =>
          a.label.localeCompare(b.label, "es")
        );
        ordered.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item.label;
          list.appendChild(li);
        });
      }
    }
    setupDayEventForm(dateKey);
    modal.classList.add("open");
  }

  function initDayModal() {
    const modal = qs("#day-modal");
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = "true";
    const closeBtn = modal.querySelector(".modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.classList.remove("open");
      });
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        modal.classList.remove("open");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        modal.classList.remove("open");
      }
    });
  }

  function renderDashboard(data) {
    if (!qs("#dashboard")) return;
    if (!state.calendar) {
      state.calendar = { offset: 0 };
    }
    const calendarState = {
      offset: state.calendar.offset,
      sprints: data?.sprints || [],
    };
    const prevBtn = qs("#calendar-prev");
    const nextBtn = qs("#calendar-next");
    const updateCalendar = () => {
      const today = getToday();
      const visibleSprints = calendarState.sprints.filter((sprint) => {
        if (!sprint?.fecha_fin) return true;
        const end = parseDateOnly(sprint.fecha_fin);
        if (!end) return true;
        return end >= today;
      });
      const selectedSprint =
        state.selectedSprintId &&
        calendarState.sprints.find((item) => String(item.id) === state.selectedSprintId);
      const todayDate = getToday();
      let baseDate = todayDate;
      if (selectedSprint?.fecha_inicio) {
        const sprintStart =
          parseDateOnly(selectedSprint.fecha_inicio) || new Date(selectedSprint.fecha_inicio);
        const sprintEnd = selectedSprint.fecha_fin
          ? parseDateOnly(selectedSprint.fecha_fin) || new Date(selectedSprint.fecha_fin)
          : null;
        if (!(sprintStart && sprintEnd && sprintStart <= todayDate && sprintEnd >= todayDate)) {
          baseDate = sprintStart || todayDate;
        }
      }
      baseDate.setMonth(baseDate.getMonth() + calendarState.offset);
      if (visibleSprints.length) {
        renderCalendar(
          baseDate,
          visibleSprints,
          data?.calendarEvents || [],
          data?.feriados || [],
          data?.personas || [],
          data?.tipos || []
        );
      } else {
        renderCalendar(
          baseDate,
          calendarState.sprints,
          data?.calendarEvents || [],
          data?.feriados || [],
          data?.personas || [],
          data?.tipos || []
        );
      }
    };
    if (prevBtn && nextBtn && !prevBtn.dataset.bound) {
      prevBtn.dataset.bound = "true";
      nextBtn.dataset.bound = "true";
      prevBtn.addEventListener("click", () => {
        state.calendar.offset -= 1;
        calendarState.offset = state.calendar.offset;
        updateCalendar();
      });
      nextBtn.addEventListener("click", () => {
        state.calendar.offset += 1;
        calendarState.offset = state.calendar.offset;
        updateCalendar();
      });
    }
    updateCalendar();
    if (!data) return;
    const kpiTheoretical = qs("#kpi-theoretical");
    if (!kpiTheoretical) return;

    const birthdayList = qs("#birthday-list");
    if (birthdayList) {
      birthdayList.innerHTML = "";
      if (!data.birthdays.length) {
        birthdayList.innerHTML = "<li>Sin cumpleaños cargados.</li>";
      } else {
        data.birthdays.forEach((item) => {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${item.nombre}</strong><span>${item.fecha}</span><span>${item.celulas}</span>`;
          birthdayList.appendChild(li);
        });
      }
    }
    qs("#kpi-theoretical").textContent = data.kpis.sprintDias;
    qs("#kpi-risk").textContent = data.kpis.riesgo;
    const kpiEvents = qs("#kpi-events");
    if (kpiEvents) {
      kpiEvents.textContent = data.kpis.eventos;
      const labels = data.eventsByType?.labels || [];
      kpiEvents.dataset.tooltip = labels.length
        ? `Tipos: ${labels.join(", ")}`
        : "Sin eventos";
    }
    qs("#kpi-capacity").textContent = data.kpis.capacidad;
    qs("#kpi-capacity-detail").textContent = data.kpis.capacidadDetalle;
    const kpiStatus = qs("#kpi-status");
    if (kpiStatus) {
      kpiStatus.textContent = data.kpis.estado;
      kpiStatus.classList.remove(
        "health-healthy",
        "health-attention",
        "health-risk",
        "health-critical"
      );
      const statusKey = (data.kpis.estado || "").toLowerCase();
      if (statusKey === "healthy") kpiStatus.classList.add("health-healthy");
      else if (statusKey === "attention") kpiStatus.classList.add("health-attention");
      else if (statusKey === "risk") kpiStatus.classList.add("health-risk");
      else if (statusKey === "critical") kpiStatus.classList.add("health-critical");
    }
    const remainingDays = qs("#remaining-days");
    const remainingLabel = qs(".remaining-label");
    if (remainingDays) {
      const remainingValue = Number.isInteger(data.remainingDays)
        ? String(data.remainingDays)
        : data.remainingDays.toFixed(1);
      remainingDays.textContent = remainingValue;
      let hue = Math.round(data.remainingRatio * 120);
      if (data.remainingRatio <= 0.25) {
        hue = 0;
      } else if (data.remainingRatio <= 0.55) {
        hue = 55;
      }
      const color = `hsl(${hue}, 90%, 45%)`;
      remainingDays.style.color = color;
      if (remainingLabel) remainingLabel.style.color = color;
    }
    const advanceEl = qs("#dashboard-kpi-advance");
    const advanceExpectedEl = qs("#dashboard-kpi-advance-expected");
    if (advanceEl) {
      const sprintId = state.selectedSprintId || String(data.activeSprintId || "");
      const items = state.base?.sprintItems
        ? state.base.sprintItems.filter((item) => {
            if (state.selectedCelulaId && String(item.celula_id) !== state.selectedCelulaId) {
              return false;
            }
            if (sprintId && String(item.sprint_id) !== String(sprintId)) {
              return false;
            }
            return true;
          })
        : [];
      const pointsTotal = items.reduce((sum, item) => {
        const value = Number(item.story_points);
        return Number.isFinite(value) && value > 0 ? sum + value : sum;
      }, 0);
      const pointsDone = items.reduce((sum, item) => {
        if (!isDoneStatus(item.status)) return sum;
        const value = Number(item.story_points);
        return Number.isFinite(value) && value > 0 ? sum + value : sum;
      }, 0);
      const advancePct = pointsTotal ? (pointsDone / pointsTotal) * 100 : 0;
      const advanceDisplay = Number(advancePct.toFixed(0));
      let expectedDisplay = 0;
      if (Number.isFinite(data.remainingDays) && Number.isFinite(data.remainingRatio) && data.remainingRatio > 0) {
        const totalDays = data.remainingDays / data.remainingRatio;
        expectedDisplay = totalDays ? ((totalDays - data.remainingDays) / totalDays) * 100 : 0;
      }
      const expectedRounded = Number(expectedDisplay.toFixed(0));
      advanceEl.textContent = `${advanceDisplay}%`;
      advanceEl.classList.remove("kpi-ok", "kpi-warn", "kpi-bad");
      if (advanceDisplay < expectedRounded) {
        advanceEl.classList.add("kpi-bad");
      } else if (advanceDisplay === expectedRounded) {
        advanceEl.classList.add("kpi-warn");
      } else {
        advanceEl.classList.add("kpi-ok");
      }
      if (advanceExpectedEl) advanceExpectedEl.textContent = `${expectedRounded}%`;
    }
    renderLineChart(qs('[data-chart="capacityOverSprints"]'), data.capacityOverSprints);
    renderPie(qs('[data-chart="eventsByType"]'), data.eventsByType, "pie");
    renderPie(qs('[data-chart="eventsStatus"]'), data.eventsStatus, "donut");
    renderHBar(qs('[data-chart="eventsByPerson"]'), data.eventsByPerson);
    renderHBar(qs('[data-chart="capacityBySprint"]'), data.capacityBySprint);
    renderPersonSummary(qs("#person-summary"), data.personSummary);
    const dashSprint = qs("#dashboard-sprint");
    if (dashSprint) {
      const start = data?.sprintFechaInicio ? formatDate(data.sprintFechaInicio) : "";
      const end = data?.sprintFechaFin ? formatDate(data.sprintFechaFin) : "";
      dashSprint.textContent =
        data.sprintNombre && start && end
          ? `${data.sprintNombre} (${start} - ${end})`
          : "";
    }
    const personSummarySprint = qs("#person-summary-sprint");
    if (personSummarySprint) {
      personSummarySprint.textContent = data.sprintNombre ? `(${data.sprintNombre})` : "";
    }
    const eventsTypeSprint = qs("#events-type-sprint");
    if (eventsTypeSprint) {
      eventsTypeSprint.textContent = data.sprintNombre ? `(${data.sprintNombre})` : "";
    }
    const eventsStatusSprint = qs("#events-status-sprint");
    if (eventsStatusSprint) {
      eventsStatusSprint.textContent = data.sprintNombre ? `(${data.sprintNombre})` : "";
    }
    const eventsPersonSprint = qs("#events-person-sprint");
    if (eventsPersonSprint) {
      eventsPersonSprint.textContent = data.sprintNombre ? `(${data.sprintNombre})` : "";
    }
    const dashboardStorypoints = qs("#dashboard-kpi-storypoints");
    if (dashboardStorypoints && state.base?.sprintItems) {
      const sprintId = state.selectedSprintId || String(data.activeSprintId || "");
      const items = state.base.sprintItems.filter((item) => {
        if (state.selectedCelulaId && String(item.celula_id) !== state.selectedCelulaId) {
          return false;
        }
        if (sprintId && String(item.sprint_id) !== String(sprintId)) {
          return false;
        }
        return true;
      });
      const feriadosSet = new Set(
        (data.feriados || []).map((feriado) => feriado.fecha).filter(Boolean)
      );
      renderStorypointsKpi(items, dashboardStorypoints, feriadosSet);
    }
  }

  function renderPersonSummary(container, data) {
    if (!container) return;
    if (!data || !data.rows.length) {
      container.innerHTML = '<p class="empty">Sin eventos</p>';
      return;
    }
    const baseColumns = data.columns || [];
    const columns = [...baseColumns, { key: "_total", label: "Total" }];
    const roundEventValue = (value) => Math.round(value || 0);
    const rowTotal = (row) =>
      baseColumns.reduce((sum, col) => sum + roundEventValue(row.counts[col.key]), 0);
    const table = document.createElement("table");
    if (container.id === "daily-items-table") {
      table.className = "table table-bordered table-striped";
    }
    table.className = "summary-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    data.rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((col) => {
        const td = document.createElement("td");
        if (col.key === "persona") {
          td.textContent = row.persona;
        } else if (col.key === "_total") {
          const total = rowTotal(row);
          td.textContent = String(total);
        } else {
          const value = roundEventValue(row.counts[col.key]);
          td.textContent = String(value);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const totals = {};
    data.rows.forEach((row) => {
      baseColumns.forEach((col) => {
        if (col.key === "persona") return;
        totals[col.key] = (totals[col.key] || 0) + roundEventValue(row.counts[col.key]);
      });
      totals._total = (totals._total || 0) + rowTotal(row);
    });
    const tfoot = document.createElement("tfoot");
    const totalRow = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      if (col.key === "persona") {
        td.textContent = "Total";
      } else {
        const value = totals[col.key] || 0;
        td.textContent = String(value);
      }
      totalRow.appendChild(td);
    });
    tfoot.appendChild(totalRow);
    table.appendChild(tfoot);
    container.innerHTML = "";
    container.appendChild(table);
    enhanceStaticTable(table, "person-summary");
  }

  function renderBarChart(el, data) {
    if (!el) return;
    const max = Math.max(...data.series.flatMap((s) => s.values), 1);
    el.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "bar-wrapper";
    data.labels.forEach((label, idx) => {
      const group = document.createElement("div");
      group.className = "bar-group";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      labelEl.className = "bar-label";
      const bars = document.createElement("div");
      bars.className = "bars";
      data.series.forEach((series, sidx) => {
        const bar = document.createElement("div");
        bar.className = `bar color-${sidx + 1}`;
        bar.style.height = `${(series.values[idx] / max) * 100}%`;
        bar.title = `${series.name}: ${series.values[idx]}`;
        bars.appendChild(bar);
      });
      group.appendChild(bars);
      group.appendChild(labelEl);
      wrapper.appendChild(group);
    });
    el.appendChild(wrapper);
  }

  function renderLineChart(el, data) {
    if (!el) return;
    const svg = el.querySelector("svg");
    if (!svg) return;
    const max = Math.max(...data.series.flatMap((s) => s.values), 1);
    const min = Math.min(...data.series.flatMap((s) => s.values), 0);
    const width = 320;
    const height = 160;
    svg.innerHTML = "";
    data.series.forEach((series, idx) => {
      const points = series.values.map((val, i) => {
        const x = (i / Math.max(series.values.length - 1, 1)) * width;
        const y = height - ((val - min) / (max - min || 1)) * height;
        return `${x},${y}`;
      });
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", idx === 0 ? "#4ba3ff" : "#ffb347");
      path.setAttribute("stroke-width", "3");
      path.setAttribute("points", points.join(" "));
      svg.appendChild(path);
    });
  }

  function renderPie(el, data, className) {
    if (!el) return;
    const legend = el.querySelector(".legend");
    if (!data.values.length) {
      el.querySelector(`.${className}`).style.background = "conic-gradient(#2a2f32 0% 100%)";
      legend.innerHTML = "<li>Sin datos</li>";
      return;
    }
    const total = data.values.reduce((acc, val) => acc + val, 0) || 1;
    let acc = 0;
    const stops = data.values
      .map((val, idx) => {
        const start = (acc / total) * 100;
        acc += val;
        const end = (acc / total) * 100;
        return `${data.colors[idx]} ${start}% ${end}%`;
      })
      .join(", ");
    el.querySelector(`.${className}`).style.background = `conic-gradient(${stops})`;
    legend.innerHTML = "";
    data.labels.forEach((label, idx) => {
      const li = document.createElement("li");
      const suffix = data.suffix || "";
      li.innerHTML = `<span style="background:${data.colors[idx]}"></span>${label}<strong class="legend-value">${data.values[idx]}${suffix}</strong>`;
      legend.appendChild(li);
    });
  }

  function renderHBar(el, data) {
    if (!el) return;
    const max = Math.max(...data.values, 1);
    el.innerHTML = "";
    data.labels.forEach((label, idx) => {
      const wrapper = document.createElement("div");
      wrapper.className = "hbar-item";
      const row = document.createElement("div");
      row.className = "hbar-row";
      const suffix = data.suffix ? ` ${data.suffix}` : "";
      const color = data.colors ? data.colors[idx] : "";
      const barStyle = `${(data.values[idx] / max) * 100}%`;
      const valueLabel = data.valueLabels?.[idx];
      const valueText = valueLabel ?? `${data.values[idx]}${suffix}`;
      row.innerHTML = `<span>${label}</span><div class="hbar"><span style="width:${barStyle};${color ? `background:${color};` : ""}"></span></div><strong style="${color ? `color:${color};` : ""}">${valueText}</strong>`;
      wrapper.appendChild(row);
      const details = Array.isArray(data.details?.[idx]) ? data.details[idx] : [];
      if (details.length) {
        row.classList.add("expandable");
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("aria-expanded", "false");
        const detailBox = document.createElement("div");
        detailBox.className = "hbar-details is-hidden";
        details.forEach((text) => {
          const line = document.createElement("span");
          line.className = "hbar-detail";
          line.textContent = text;
          detailBox.appendChild(line);
        });
        const toggle = () => {
          const isOpen = !detailBox.classList.contains("is-hidden");
          detailBox.classList.toggle("is-hidden", isOpen);
          row.setAttribute("aria-expanded", String(!isOpen));
        };
        row.addEventListener("click", toggle);
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        });
        wrapper.appendChild(detailBox);
      }
      el.appendChild(wrapper);
    });
  }

  function renderStacked(el, data) {
    if (!el) return;
    const max = Math.max(
      ...data.labels.map((_, i) => data.series.reduce((sum, s) => sum + s.values[i], 0)),
      1
    );
    el.innerHTML = "";
    data.labels.forEach((label, idx) => {
      const row = document.createElement("div");
      row.className = "stacked-row";
      const bar = document.createElement("div");
      bar.className = "stacked-bar";
      data.series.forEach((series) => {
        const seg = document.createElement("span");
        seg.style.width = `${(series.values[idx] / max) * 100}%`;
        seg.style.background = series.color;
        seg.title = `${series.name}: ${series.values[idx]}`;
        bar.appendChild(seg);
      });
      row.innerHTML = `<span>${label}</span>`;
      row.appendChild(bar);
      el.appendChild(row);
    });
  }

  function initSprintFilter(base) {
    const sprintSelect = qs("#filter-sprint");
    if (!sprintSelect) return;
    const sprintsBase = state.selectedCelulaId
      ? base.sprints.filter((sprint) => String(sprint.celula_id) === state.selectedCelulaId)
      : base.sprints;
    const today = getToday();
    const sprints = sprintsBase.filter((sprint) => {
      if (!sprint?.fecha_fin) return true;
      const end = parseDateOnly(sprint.fecha_fin);
      if (!end) return true;
      return end >= today;
    });
    const activeSprint = getActiveSprint(sprintsBase, today);
    fillSelect(sprintSelect, sprints, { includeEmpty: true });
    if (sprintSelect.options.length) {
      sprintSelect.options[0].textContent = "Seleccionar";
    }
    if (state.selectedSprintId && sprints.some((s) => String(s.id) === state.selectedSprintId)) {
      sprintSelect.value = state.selectedSprintId;
    } else if (activeSprint && sprints.some((s) => s.id === activeSprint.id)) {
      sprintSelect.value = String(activeSprint.id);
      state.selectedSprintId = String(activeSprint.id);
    } else {
      sprintSelect.value = sprints[0]?.id || "";
      state.selectedSprintId = sprintSelect.value ? String(sprintSelect.value) : "";
    }
    if (sprintSelect.dataset.bound) return;
    sprintSelect.dataset.bound = "true";
    sprintSelect.addEventListener("change", async (event) => {
      const sprintId = Number(event.target.value);
      if (!sprintId) return;
      state.selectedSprintId = String(sprintId);
      state.calendar.offset = 0;
      const sprint = base.sprints.find((item) => item.id === sprintId);
      if (!sprint) return;
      const capacidad = await fetchJson(`/sprints/${sprint.id}/capacidad`);
      const personaIds = state.selectedCelulaId
        ? new Set(
            base.personas
              .filter((persona) =>
                (persona.celulas || []).some(
                  (celula) => String(celula.id) === String(state.selectedCelulaId)
                )
              )
              .map((persona) => persona.id)
          )
        : null;
      const eventosFiltrados = personaIds
        ? base.eventos.filter((evento) => personaIds.has(evento.persona_id))
        : base.eventos;
      const eventosSprint = eventosFiltrados.filter((evento) =>
        eventBelongsToSprint(evento, sprint)
      );
      const feriadosFiltrados = state.selectedCelulaId
        ? (base.feriados || []).filter(
            (feriado) =>
              !feriado.celula_id || String(feriado.celula_id) === String(state.selectedCelulaId)
          )
        : base.feriados;
      const personasAll = base.personas || [];
      const personasBirthdays =
        state.user?.rol === "admin"
          ? personasAll
          : state.selectedCelulaId
            ? personasAll.filter((persona) =>
                (persona.celulas || []).some(
                  (celula) => String(celula.id) === String(state.selectedCelulaId)
                )
              )
            : personasAll;
      const dashboard = buildDashboard({
        sprint,
        base,
        capacidad,
        capacidadSeries: state.capacidadSeries,
        sprints: sprintsBase,
        events: eventosSprint,
        eventsAll: eventosFiltrados,
        feriados: feriadosFiltrados,
        personas: base.personas,
        birthdaysPersonas: personasBirthdays,
      });
      renderDashboard(dashboard);
    });
  }

  function initDashboardCellFilter(base) {
    const cellSelect = qs("#filter-cell");
    if (!cellSelect) return;
    if (state.selectedCelulaId) {
      const cells = base.cells.filter((celula) => String(celula.id) === state.selectedCelulaId);
      fillSelect(cellSelect, cells);
      cellSelect.value = state.selectedCelulaId;
      cellSelect.disabled = true;
    } else {
      fillSelect(cellSelect, base.cells, { includeEmpty: true });
      if (cellSelect.options.length) {
        cellSelect.options[0].textContent = "Todas";
      }
      cellSelect.disabled = false;
    }
  }

  function initCelulaSelector(base) {
    const select = qs("#cell-filter");
    if (!select) return;
    const applyCells = (cells) => {
      const list = Array.isArray(cells) ? cells : [];
      fillSelect(select, list, { includeEmpty: true });
      if (select.options.length) {
        select.options[0].textContent = "Todas";
      }
      if (state.selectedCelulaId) {
        const exists = Array.from(select.options).some(
          (opt) => opt.value === state.selectedCelulaId
        );
        if (exists) {
          select.value = state.selectedCelulaId;
          return;
        }
        const normalized = normalizeText(state.selectedCelulaId);
        const match = list.find((celula) => {
          const name = normalizeText(celula.nombre);
          return name === normalized || name.includes(normalized) || normalized.includes(name);
        });
        if (match) {
          state.selectedCelulaId = String(match.id);
          select.value = state.selectedCelulaId;
          localStorage.setItem("scrum_calendar_celula_id", state.selectedCelulaId);
          return;
        }
        if (list.length === 1) {
          state.selectedCelulaId = String(list[0].id);
          select.value = state.selectedCelulaId;
          localStorage.setItem("scrum_calendar_celula_id", state.selectedCelulaId);
          return;
        }
        state.selectedCelulaId = "";
        localStorage.removeItem("scrum_calendar_celula_id");
      }
    };
    applyCells(base.cells);
    toggleMenuVisibility();
    initDashboardCellFilter(base);

    if (!select.dataset.bound) {
      select.dataset.bound = "true";
      select.addEventListener("change", async () => {
        state.selectedCelulaId = select.value;
        if (state.selectedCelulaId) {
          localStorage.setItem("scrum_calendar_celula_id", state.selectedCelulaId);
        } else {
          localStorage.removeItem("scrum_calendar_celula_id");
        }
        state.dailySelectedPersonaId = "";
        state.dailySelectedAssignee = "";
        state.dailyStoryPointsFilter = null;
        state.dailyCapacityCache = {};
        toggleMenuVisibility();
        if (qs("#dashboard")) {
          const dashboard = await loadDashboardData(base, state.selectedCelulaId);
          renderDashboard(dashboard);
          initSprintFilter(base);
          initDashboardCellFilter(base);
        }
        initForms(base);
        renderAdmin(base);
        initDaily();
        initReleaseTable();
        initOneToOne();
        initRetrospective();
      });
    }

    fetchJson("/celulas")
      .then((cells) => {
        if (!Array.isArray(cells)) return;
        base.cells = cells;
        applyCells(cells);
        state.dailySelectedPersonaId = "";
        state.dailySelectedAssignee = "";
        state.dailyCapacityCache = {};
        initDashboardCellFilter(base);
        initForms(base);
        renderAdmin(base);
        initDaily();
        initReleaseTable();
        initOneToOne();
        initRetrospective();
      })
      .catch(() => {});
  }

  function toggleMenuVisibility() {
    const menu = qs(".menu");
    if (!menu) return;
    menu.classList.toggle("menu-hidden", !state.selectedCelulaId);
    applyRoleVisibility();
  }

  function initForms(base) {
    const celulaForm = qs("#form-celula");
    const personaForm = qs("#form-persona");
    const sprintForm = qs("#form-sprint");
    const feriadoForm = qs("#form-feriado");
    const eventoForm = qs("#form-evento");
    const tipoForm = qs("#form-evento-tipo");
    const releaseImportForm = qs("#form-release-import");
    const importClearBtn = qs("#import-clear");
    const importForm = qs("#form-import");

    if (!celulaForm || !personaForm || !sprintForm || !feriadoForm || !eventoForm) return;
    initMultiDatePickers();

    const personaCelulasSelect =
      personaForm.celulas || personaForm.querySelector('select[name="celulas"]');
    const sinCelulaToggle =
      personaForm.sin_celula || personaForm.querySelector('input[name="sin_celula"]');
    fillSelect(personaCelulasSelect, base.cells);
    if (state.selectedCelulaId) {
      Array.from(personaCelulasSelect.options).forEach((opt) => {
        opt.selected = String(opt.value) === state.selectedCelulaId;
      });
    }
    const syncPersonaCelulas = (forceNone = false) => {
      if (!personaCelulasSelect || !sinCelulaToggle) return;
      if (forceNone || sinCelulaToggle.checked) {
        Array.from(personaCelulasSelect.options).forEach((opt) => {
          opt.selected = false;
        });
        personaCelulasSelect.disabled = true;
        return;
      }
      personaCelulasSelect.disabled = false;
      if (!personaCelulasSelect.selectedOptions.length && state.selectedCelulaId) {
        Array.from(personaCelulasSelect.options).forEach((opt) => {
          opt.selected = String(opt.value) === state.selectedCelulaId;
        });
      }
    };
    if (sinCelulaToggle) {
      sinCelulaToggle.addEventListener("change", () => syncPersonaCelulas());
    }
    if (personaCelulasSelect && sinCelulaToggle) {
      personaCelulasSelect.addEventListener("change", () => {
        if (personaCelulasSelect.selectedOptions.length) {
          sinCelulaToggle.checked = false;
          personaCelulasSelect.disabled = false;
        }
      });
    }
    syncPersonaCelulas();
    fillSelect(sprintForm.celula, base.cells);
    if (state.selectedCelulaId) {
      sprintForm.celula.value = state.selectedCelulaId;
    }
    if (state.lastSprintCelulaId) {
      sprintForm.celula.value = state.lastSprintCelulaId;
    }

    const personasActivas = filterActivePersonas(base.personas || []);
    const personasFiltradas = state.selectedCelulaId
      ? personasActivas.filter((persona) =>
          (persona.celulas || []).some(
            (celula) => String(celula.id) === state.selectedCelulaId
          )
        )
      : personasActivas;
    const personaOptions = personasFiltradas.map((p) => ({
      id: p.id,
      nombre: `${p.nombre} ${p.apellido}`,
    }));
    fillSelect(eventoForm.persona, personaOptions);
    fillSelect(eventoForm.tipo, base.tipos);
    const sprintsFiltrados = state.selectedCelulaId
      ? base.sprints.filter((sprint) => String(sprint.celula_id) === state.selectedCelulaId)
      : base.sprints;
    fillSelect(eventoForm.sprint, sprintsFiltrados, { includeEmpty: true });

    if (!celulaForm.dataset.mode) resetFormMode(celulaForm, "Crear celula");
    if (!personaForm.dataset.mode) resetFormMode(personaForm, "Crear persona");
    if (!sprintForm.dataset.mode) resetFormMode(sprintForm, "Crear sprint");
    if (!feriadoForm.dataset.mode) resetFormMode(feriadoForm, "Crear feriado");
    if (!eventoForm.dataset.mode) resetFormMode(eventoForm, "Crear evento");
    if (tipoForm && !tipoForm.dataset.mode) resetFormMode(tipoForm, "Crear tipo");
    if (importForm && !importForm.dataset.mode) resetFormMode(importForm, "Importar");

    const cumpleDia = personaForm.cumple_dia;
    const cumpleMes = personaForm.cumple_mes;
    if (cumpleDia && cumpleMes && !cumpleDia.dataset.filled) {
      for (let d = 1; d <= 31; d += 1) {
        const opt = document.createElement("option");
        opt.value = String(d).padStart(2, "0");
        opt.textContent = String(d).padStart(2, "0");
        cumpleDia.appendChild(opt);
      }
      const meses = [
        { value: "01", label: "Enero" },
        { value: "02", label: "Febrero" },
        { value: "03", label: "Marzo" },
        { value: "04", label: "Abril" },
        { value: "05", label: "Mayo" },
        { value: "06", label: "Junio" },
        { value: "07", label: "Julio" },
        { value: "08", label: "Agosto" },
        { value: "09", label: "Septiembre" },
        { value: "10", label: "Octubre" },
        { value: "11", label: "Noviembre" },
        { value: "12", label: "Diciembre" },
      ];
      meses.forEach((mes) => {
        const opt = document.createElement("option");
        opt.value = mes.value;
        opt.textContent = mes.label;
        cumpleMes.appendChild(opt);
      });
      cumpleDia.dataset.filled = "true";
    }

    if (!base.cells.length) {
      setStatus(
        "#status-persona",
        "No hay celulas. Crea una celula primero.",
        "error"
      );
      setStatus("#status-sprint", "No hay celulas disponibles.", "error");
      if (personaCelulasSelect) personaCelulasSelect.disabled = true;
      sprintForm.celula.disabled = true;
    } else {
      if (personaCelulasSelect) personaCelulasSelect.disabled = false;
      sprintForm.celula.disabled = false;
    }

    if (celulaForm.dataset.bound) return;
    celulaForm.dataset.bound = "true";

    sprintForm.celula.addEventListener("change", () => {
      state.lastSprintCelulaId = sprintForm.celula.value;
    });

    celulaForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const wasEditing = celulaForm.dataset.mode === "edit";
      try {
        setStatus("#status-celula", "Guardando...", "info");
        const payload = {
          nombre: celulaForm.nombre.value.trim(),
          jira_codigo: celulaForm.jira_codigo.value.trim(),
          activa: true,
        };
        if (celulaForm.dataset.mode === "edit") {
          await putJson(`/celulas/${celulaForm.dataset.editId}`, payload);
          setStatus("#status-celula", "Celula actualizada.", "ok");
        } else {
          await postJson("/celulas", payload);
          setStatus("#status-celula", "Celula creada.", "ok");
        }
        celulaForm.reset();
        resetFormMode(celulaForm, "Crear celula");
        if (wasEditing) closeAdminModal(false);
        await reloadAll();
      } catch (err) {
        setStatus("#status-celula", err.message || "Error al crear celula.", "error");
      }
    });

    personaForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const wasEditing = personaForm.dataset.mode === "edit";
      try {
        setStatus("#status-persona", "Guardando...", "info");
        if (!personaCelulasSelect) {
          setStatus("#status-persona", "No se encontro el selector de celulas.", "error");
          return;
        }
        const selectedCelulas = Array.from(personaCelulasSelect.selectedOptions).map((opt) =>
          Number(opt.value)
        );
        const sinCelula = sinCelulaToggle?.checked;
        if (!selectedCelulas.length && !sinCelula) {
          setStatus("#status-persona", "Selecciona al menos una celula.", "error");
          return;
        }
        const payload = {
          nombre: personaForm.nombre.value.trim(),
          apellido: personaForm.apellido.value.trim(),
          jira_usuario: personaForm.jira_usuario?.value.trim() || null,
          rol: personaForm.rol.value.trim(),
          capacidad_diaria_horas: Number(personaForm.capacidad.value),
          celulas_ids: sinCelula ? [] : selectedCelulas,
          fecha_cumple:
            cumpleDia?.value && cumpleMes?.value
              ? `2000-${cumpleMes.value}-${cumpleDia.value}`
              : null,
          activo: personaForm.activo ? personaForm.activo.value === "true" : true,
        };
        if (personaForm.dataset.mode === "edit") {
          await putJson(`/personas/${personaForm.dataset.editId}`, payload);
          setStatus("#status-persona", "Persona actualizada.", "ok");
        } else {
          await postJson("/personas", payload);
          setStatus("#status-persona", "Persona creada.", "ok");
        }
        personaForm.reset();
        resetFormMode(personaForm, "Crear persona");
        if (cumpleDia && cumpleMes) {
          cumpleDia.value = "";
          cumpleMes.value = "";
        }
        if (sinCelulaToggle) {
          sinCelulaToggle.checked = false;
          syncPersonaCelulas();
        }
        if (wasEditing) closeAdminModal(false);
        await reloadAll();
      } catch (err) {
        setStatus("#status-persona", err.message || "Error al crear persona.", "error");
      }
    });

    sprintForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const wasEditing = sprintForm.dataset.mode === "edit";
      try {
        setStatus("#status-sprint", "Guardando...", "info");
        state.lastSprintCelulaId = sprintForm.celula.value;
        state.selectedCelulaId = sprintForm.celula.value;
        const payload = {
          nombre: sprintForm.nombre.value.trim(),
          celula_id: Number(sprintForm.celula.value),
          fecha_inicio: sprintForm.fecha_inicio.value,
          fecha_fin: sprintForm.fecha_fin.value,
        };
        if (!payload.fecha_inicio || !payload.fecha_fin) {
          setStatus("#status-sprint", "Selecciona el rango de fechas.", "error");
          return;
        }
        if (sprintForm.dataset.mode === "edit") {
          await putJson(`/sprints/${sprintForm.dataset.editId}`, payload);
          setStatus("#status-sprint", "Sprint actualizado.", "ok");
        } else {
          const created = await postJson("/sprints", payload);
          setStatus("#status-sprint", "Sprint creado.", "ok");
          const nextStart = created?.fecha_fin || payload.fecha_fin;
          sprintForm.fecha_inicio.value = nextStart;
          sprintForm.fecha_fin.value = addDays(nextStart, 14);
          setMultiDateRange(sprintForm, nextStart, addDays(nextStart, 14));
          sprintForm.nombre.value = nextSprintName(created?.nombre || payload.nombre);
        }
        if (sprintForm.dataset.mode === "edit") {
          sprintForm.reset();
          setMultiDateRange(sprintForm, "", "");
        }
        resetFormMode(sprintForm, "Crear sprint");
        if (wasEditing) closeAdminModal(false);
        await reloadAll();
      } catch (err) {
        setStatus("#status-sprint", err.message || "Error al crear sprint.", "error");
      }
    });

    feriadoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const wasEditing = feriadoForm.dataset.mode === "edit";
      try {
        setStatus("#status-feriado", "Guardando...", "info");
        const tipo = feriadoForm.tipo.value;
        if (tipo === "interno" && !state.selectedCelulaId) {
          setStatus("#status-feriado", "Selecciona una celula para feriado interno.", "error");
          return;
        }
        const payload = {
          fecha: feriadoForm.fecha.value,
          nombre: feriadoForm.nombre.value.trim(),
          tipo,
          celula_id: tipo === "interno" ? Number(state.selectedCelulaId) : null,
          activo: true,
        };
        if (feriadoForm.dataset.mode === "edit") {
          await putJson(`/feriados/${feriadoForm.dataset.editId}`, payload);
          setStatus("#status-feriado", "Feriado actualizado.", "ok");
        } else {
          await postJson("/feriados", payload);
          setStatus("#status-feriado", "Feriado creado.", "ok");
        }
        feriadoForm.reset();
        resetFormMode(feriadoForm, "Crear feriado");
        if (wasEditing) closeAdminModal(false);
        await reloadAll();
      } catch (err) {
        setStatus("#status-feriado", err.message || "Error al crear feriado.", "error");
      }
    });

    if (tipoForm && !tipoForm.dataset.bound) {
      tipoForm.dataset.bound = "true";
      tipoForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const wasEditing = tipoForm.dataset.mode === "edit";
        try {
          setStatus("#status-evento-tipo", "Guardando...", "info");
          const impacto = Number(tipoForm.impacto.value);
          if (!Number.isFinite(impacto) || impacto < 0 || impacto > 100) {
            setStatus("#status-evento-tipo", "Impacto debe estar entre 0 y 100.", "error");
            return;
          }
          const payload = {
            nombre: tipoForm.nombre.value.trim(),
            impacto_capacidad: impacto,
            planificado: String(tipoForm.planificado.value) === "true",
            activo: String(tipoForm.activo.value) === "true",
            prioridad: "normal",
          };
          if (tipoForm.dataset.mode === "edit") {
            await putJson(`/eventos-tipo/${tipoForm.dataset.editId}`, payload);
            setStatus("#status-evento-tipo", "Tipo actualizado.", "ok");
          } else {
            await postJson("/eventos-tipo", payload);
            setStatus("#status-evento-tipo", "Tipo creado.", "ok");
          }
          tipoForm.reset();
          resetFormMode(tipoForm, "Crear tipo");
          if (wasEditing) closeAdminModal(false);
          await reloadAll();
        } catch (err) {
          setStatus("#status-evento-tipo", err.message || "Error al crear tipo.", "error");
        }
      });
    }

    eventoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const wasEditing = eventoForm.dataset.mode === "edit";
      try {
        setStatus("#status-evento", "Guardando...", "info");
        const sprintValue = eventoForm.sprint.value;
        const payload = {
          persona_id: Number(eventoForm.persona.value),
          tipo_evento_id: Number(eventoForm.tipo.value),
          sprint_id: sprintValue ? Number(sprintValue) : null,
          fecha_inicio: eventoForm.fecha_inicio.value,
          fecha_fin: eventoForm.fecha_fin.value,
          jornada: eventoForm.jornada.value,
          descripcion: eventoForm.descripcion.value.trim() || null,
        };
        if (!payload.fecha_inicio || !payload.fecha_fin) {
          setStatus("#status-evento", "Selecciona el rango de fechas.", "error");
          return;
        }
        if (eventoForm.dataset.mode === "edit") {
          await putJson(`/eventos/${eventoForm.dataset.editId}`, payload);
          setStatus("#status-evento", "Evento actualizado.", "ok");
        } else {
          await postJson("/eventos", payload);
          setStatus("#status-evento", "Evento creado.", "ok");
        }
        eventoForm.reset();
        setMultiDateRange(eventoForm, "", "");
        resetFormMode(eventoForm, "Crear evento");
        if (wasEditing) closeAdminModal(false);
        await reloadAll();
      } catch (err) {
        setStatus("#status-evento", err.message || "Error al crear evento.", "error");
      }
    });

    if (importForm && !importForm.dataset.bound) {
      importForm.dataset.bound = "true";
      importForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const fileInput = importForm.querySelector('input[type="file"]');
        const file = fileInput?.files?.[0];
        if (!file) {
          setStatus("#status-import", "Selecciona un archivo CSV o XLSX.", "error");
          return;
        }
        try {
          setStatus("#status-import", "Importando...", "info");
          const formData = new FormData();
          if (state.selectedCelulaId) {
            formData.append("celula_id", state.selectedCelulaId);
          }
          formData.append("file", file);
          const res = await fetchWithFallback("/imports/sprint-items", {
            method: "POST",
            body: formData,
          });
          const text = await res.text();
          if (!res.ok) throw new Error(text || "Error al importar CSV/XLSX.");
          const data = text ? JSON.parse(text) : null;
          const parts = [];
          if (data) {
            parts.push(`Importados: ${data.created}`);
            parts.push(`Actualizados: ${data.updated}`);
            parts.push(`Omitidos: ${data.skipped}`);
            if (data.sprints_detected?.length) {
              parts.push(`Sprints cargados: ${data.sprints_detected.join(", ")}`);
            }
            if (data.missing_personas?.length) {
              parts.push(`Sin match: ${data.missing_personas.join(", ")}`);
            }
            if (data.missing_sprints?.length) {
              parts.push(`Sprints no encontrados: ${data.missing_sprints.join(", ")}`);
            }
            if (data.missing_celulas?.length) {
              parts.push(`Celulas no encontradas: ${data.missing_celulas.join(", ")}`);
            }
          }
          setStatus("#status-import", parts.join(" · ") || "Importado.", "ok");
          importForm.reset();
          await reloadAll();
        } catch (err) {
          setStatus("#status-import", err.message || "Error al importar CSV.", "error");
        }
      });
    }

    if (releaseImportForm && !releaseImportForm.dataset.bound) {
      releaseImportForm.dataset.bound = "true";
      releaseImportForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const fileInput = releaseImportForm.querySelector('input[type="file"]');
        const file = fileInput?.files?.[0];
        if (!file) {
          setStatus("#status-release-import", "Selecciona un archivo CSV o XLSX.", "error");
          return;
        }
        const tipoSelect = releaseImportForm.querySelector('select[name="tipo_release"]');
        const tipoRelease = tipoSelect?.value || "comprometido";
        try {
          setStatus("#status-release-import", "Importando...", "info");
          const formData = new FormData();
          if (state.selectedCelulaId) {
            formData.append("celula_id", state.selectedCelulaId);
          }
          formData.append("tipo_release", tipoRelease);
          formData.append("file", file);
          const res = await fetchWithFallback("/imports/release-items", {
            method: "POST",
            body: formData,
          });
          const text = await res.text();
          if (!res.ok) throw new Error(text || "Error al importar releases.");
          const data = text ? JSON.parse(text) : null;
          const parts = [];
          if (data) {
            parts.push(`Importados: ${data.created}`);
            parts.push(`Actualizados: ${data.updated}`);
            parts.push(`Omitidos: ${data.skipped}`);
            if (data.sprints_detected?.length) {
              parts.push(`Sprints cargados: ${data.sprints_detected.join(", ")}`);
            }
            if (data.missing_personas?.length) {
              parts.push(`Sin match: ${data.missing_personas.join(", ")}`);
            }
            if (data.missing_sprints?.length) {
              parts.push(`Sprints no encontrados: ${data.missing_sprints.join(", ")}`);
            }
            if (data.missing_celulas?.length) {
              parts.push(`Celulas no encontradas: ${data.missing_celulas.join(", ")}`);
            }
          }
          setStatus("#status-release-import", parts.join(" · ") || "Importado.", "ok");
          releaseImportForm.reset();
          await reloadAll();
        } catch (err) {
          setStatus(
            "#status-release-import",
            err.message || "Error al importar releases.",
            "error"
          );
        }
      });
    }

    if (importClearBtn && !importClearBtn.dataset.bound) {
      importClearBtn.dataset.bound = "true";
      importClearBtn.addEventListener("click", async () => {
        if (!state.selectedCelulaId) {
          setStatus("#status-import", "Selecciona una celula activa.", "error");
          return;
        }
        const confirmed = window.confirm("Eliminar todos los datos importados de esta celula?");
        if (!confirmed) return;
        try {
          setStatus("#status-import", "Eliminando datos...", "info");
          const res = await fetchWithFallback(
            `/sprint-items?celula_id=${encodeURIComponent(state.selectedCelulaId)}`,
            { method: "DELETE" }
          );
          const text = await res.text();
          if (!res.ok) throw new Error(text || "Error al eliminar.");
          const data = text ? JSON.parse(text) : null;
          const total = data?.deleted ?? 0;
          setStatus("#status-import", `Eliminados: ${total}`, "ok");
          await reloadAll();
        } catch (err) {
          setStatus("#status-import", err.message || "Error al eliminar.", "error");
        }
      });
    }
  }

  async function initOneToOne() {
    const container = qs("#oneonone-page");
    if (!container || !state.base) return;
    const membersList = qs("#oneonone-members");
    const searchInput = qs("#oneonone-search");
    const cellHint = qs("#oneonone-cell-hint");
    const nameEl = qs("#oneonone-name");
    const roleEl = qs("#oneonone-role");
    const monthLabel = qs("#oneonone-month");
    const calendarGrid = qs("#oneonone-calendar");
    const eventsList = qs("#oneonone-events");
    const eventsAnnualList = qs("#oneonone-events-annual");
    const emptyEl = qs("#oneonone-empty");
    const prevBtn = qs("#oneonone-prev");
    const nextBtn = qs("#oneonone-next");
    const kpiWrap = qs("#oneonone-kpis");
    const checklistEl = qs("#oneonone-checklist");
    const checklistAddBtn = qs("#oneonone-checklist-add");
    const agreementsEl = qs("#oneonone-agreements");
    const agreementsAddBtn = qs("#oneonone-agreements-add");
    const moodSelect = qs("#oneonone-mood");
    const moodLabel = qs("#oneonone-mood-label");
    const feedbackPos = qs("#oneonone-feedback-pos");
    const feedbackNeg = qs("#oneonone-feedback-neg");
    const growthEl = qs("#oneonone-growth");
    const sessionSaveBtn = qs("#oneonone-session-save");
    const sessionCancelBtn = qs("#oneonone-session-cancel");
    const historyTable = qs("#oneonone-history-table");
    const commitmentsTable = qs("#oneonone-commitments-table");
    const commitmentsSummary = qs("#oneonone-commitments-summary");
    if (!membersList || !calendarGrid || !eventsList || !kpiWrap) return;

    const normalizeLabel = (value) => String(value ?? "").trim().toLowerCase();
    const today = getToday();
    const monthNames = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    const weekdays = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

    const personasActivas = filterActivePersonas(state.base.personas || []);
    const personas = state.selectedCelulaId
      ? personasActivas.filter((persona) =>
          (persona.celulas || []).some(
            (celula) => String(celula.id) === state.selectedCelulaId
          )
        )
      : [];
    const sortedPersonas = [...personas].sort((a, b) => {
      const nameA = `${a.nombre} ${a.apellido}`.trim();
      const nameB = `${b.nombre} ${b.apellido}`.trim();
      return nameA.localeCompare(nameB, "es");
    });

    if (!state.selectedCelulaId) {
      if (cellHint) cellHint.textContent = "Selecciona una celula para ver los integrantes.";
      membersList.innerHTML = "";
      if (nameEl) nameEl.textContent = "Selecciona una persona";
      if (roleEl) roleEl.textContent = "";
      eventsList.innerHTML = "";
      if (emptyEl) emptyEl.textContent = "";
      kpiWrap.innerHTML = "";
      if (historyTable) historyTable.innerHTML = "";
      calendarGrid.innerHTML = "";
      return;
    }

    if (cellHint) {
      cellHint.textContent = sortedPersonas.length ? "" : "No hay personas activas en la celula.";
    }
    if (!sortedPersonas.length) {
      membersList.innerHTML = "";
      if (nameEl) nameEl.textContent = "Selecciona una persona";
      if (roleEl) roleEl.textContent = "";
      eventsList.innerHTML = "";
      if (emptyEl) emptyEl.textContent = "";
      kpiWrap.innerHTML = "";
      if (checklistEl) checklistEl.innerHTML = "";
      if (agreementsEl) agreementsEl.innerHTML = "";
      if (moodSelect) moodSelect.value = "";
      if (moodLabel) moodLabel.textContent = "";
      if (feedbackPos) feedbackPos.value = "";
      if (feedbackNeg) feedbackNeg.value = "";
      if (growthEl) growthEl.value = "";
      if (historyTable) historyTable.innerHTML = "";
      calendarGrid.innerHTML = "";
      return;
    }

    const filterText = normalizeLabel(searchInput?.value);
    const filtered = sortedPersonas.filter((persona) => {
      if (!filterText) return true;
      const name = `${persona.nombre} ${persona.apellido}`.trim();
      return normalizeLabel(name).includes(filterText);
    });

    const hasSelected = filtered.some(
      (persona) => String(persona.id) === String(state.oneononePersonId)
    );
    if ((!state.oneononePersonId || !hasSelected) && filtered.length) {
      state.oneononePersonId = String(filtered[0].id);
    }

    membersList.innerHTML = "";
    filtered.forEach((persona) => {
      const li = document.createElement("li");
      li.className = "member-item";
      const btn = document.createElement("button");
      const name = `${persona.nombre} ${persona.apellido}`.trim();
      btn.textContent = name;
      const isActive = String(persona.id) === String(state.oneononePersonId);
      if (isActive) btn.classList.add("active");
      btn.addEventListener("click", () => {
        state.oneononePersonId = String(persona.id);
        initOneToOne();
      });
      li.appendChild(btn);
      membersList.appendChild(li);
    });

    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = "true";
      searchInput.addEventListener("input", () => initOneToOne());
    }

    if (prevBtn && !prevBtn.dataset.bound) {
      prevBtn.dataset.bound = "true";
      prevBtn.addEventListener("click", () => {
        state.oneononeMonthOffset -= 1;
        initOneToOne();
      });
    }
    if (nextBtn && !nextBtn.dataset.bound) {
      nextBtn.dataset.bound = "true";
      nextBtn.addEventListener("click", () => {
        state.oneononeMonthOffset += 1;
        initOneToOne();
      });
    }

    const selected = sortedPersonas.find(
      (persona) => String(persona.id) === String(state.oneononePersonId)
    );
    if (!selected) {
      if (nameEl) nameEl.textContent = "Selecciona una persona";
      if (roleEl) roleEl.textContent = "";
      return;
    }
    state.oneononeEditingSessionId = "";
    if (sessionSaveBtn) sessionSaveBtn.textContent = "Registrar 1:1";
    const fullName = `${selected.nombre} ${selected.apellido}`.trim();
    if (nameEl) nameEl.textContent = fullName;
    if (roleEl) roleEl.textContent = selected.rol || "";

    const baseDate = new Date(today.getFullYear(), today.getMonth() + state.oneononeMonthOffset, 1);
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    if (monthLabel) monthLabel.textContent = `${monthNames[month]} ${year}`;

    const tipoMap = Object.fromEntries(state.base.tipos.map((t) => [t.id, t.nombre]));
    const feriadosSet = new Set(
      (state.base.feriados || [])
        .filter(
          (feriado) =>
            !feriado.celula_id || String(feriado.celula_id) === String(state.selectedCelulaId)
        )
        .map((feriado) => feriado.fecha)
        .filter(Boolean)
    );
    const eventosPersona = (state.base.eventos || []).filter((evento) => {
      if (evento.persona_id !== selected.id) return false;
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end) return false;
      return start <= monthEnd && end >= monthStart;
    });

    const eventDays = new Set();
    const dayEventsMap = {};
    eventosPersona.forEach((evento) => {
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end) return;
      const rangeStart = start > monthStart ? start : monthStart;
      const rangeEnd = end < monthEnd ? end : monthEnd;
      const cursor = new Date(rangeStart);
      const tipo = tipoMap[evento.tipo_evento_id] || "Evento";
      const jornadaText =
        evento.jornada && evento.jornada !== "completo"
          ? ` (${evento.jornada.toUpperCase()})`
          : "";
      const startLabel = formatDate(evento.fecha_inicio);
      const endLabel = formatDate(evento.fecha_fin);
      const rangeLabel = startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
      const label = `${tipo}${jornadaText} · ${rangeLabel}`;
      while (cursor <= rangeEnd) {
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) {
          const key = formatISO(cursor);
          if (!feriadosSet.has(key)) {
            eventDays.add(key);
            if (!dayEventsMap[key]) {
              dayEventsMap[key] = [];
            }
            dayEventsMap[key].push({ label });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    calendarGrid.innerHTML = "";
    weekdays.forEach((label) => {
      const head = document.createElement("div");
      head.className = "oneonone-weekday";
      head.textContent = label;
      calendarGrid.appendChild(head);
    });
    const startDay = monthStart.getDay();
    for (let i = 0; i < startDay; i += 1) {
      const pad = document.createElement("div");
      pad.className = "oneonone-day is-muted";
      calendarGrid.appendChild(pad);
    }
    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const cellDate = new Date(year, month, day);
      const key = formatISO(cellDate);
      const cell = document.createElement("div");
      cell.className = "oneonone-day";
      if (feriadosSet.has(key)) {
        cell.classList.add("is-holiday");
      }
      if (eventDays.has(key)) {
        cell.classList.add("has-event");
      }
      if (formatISO(cellDate) === formatISO(today)) {
        cell.classList.add("is-today");
      }
      const number = document.createElement("span");
      number.textContent = String(day);
      cell.appendChild(number);
      if (eventDays.has(key)) {
        const dot = document.createElement("span");
        dot.className = "oneonone-dot";
        cell.appendChild(dot);
      }
      cell.addEventListener("click", () => {
        openOneOnOneDayModal(key, dayEventsMap[key] || []);
      });
      calendarGrid.appendChild(cell);
    }

    const countEventDaysInRange = (evento, rangeStart, rangeEnd) => {
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end) return 0;
      const actualStart = start > rangeStart ? start : rangeStart;
      const actualEnd = end < rangeEnd ? end : rangeEnd;
      if (actualStart > actualEnd) return 0;
      const factor = evento.jornada === "completo" ? 1 : 0.5;
      let count = 0;
      const cursor = new Date(actualStart);
      while (cursor <= actualEnd) {
        const day = cursor.getDay();
        const key = formatISO(cursor);
        if (day !== 0 && day !== 6 && !feriadosSet.has(key)) {
          count += factor;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return count;
    };

    const countEventDays = (evento) =>
      countEventDaysInRange(evento, monthStart, monthEnd);

    const eventsListItems = eventosPersona
      .sort((a, b) => (a.fecha_inicio || "").localeCompare(b.fecha_inicio || ""))
      .map((evento) => {
        const startLabel = formatDate(evento.fecha_inicio);
        const endLabel = formatDate(evento.fecha_fin);
        const range = startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
        const tipo = tipoMap[evento.tipo_evento_id] || "Evento";
        const jornada =
          evento.jornada && evento.jornada !== "completo"
            ? ` (${evento.jornada.toUpperCase()})`
            : "";
        const totalDays = countEventDays(evento);
        const totalLabel = Number.isInteger(totalDays) ? totalDays : totalDays.toFixed(1);
        const dayLabel = ` · ${totalLabel} dias`;
        return `${range} · ${tipo}${jornada}${dayLabel}`;
      });
    const annualTotals = new Map();
    const eventsYear = (state.base.eventos || []).filter((evento) => {
      if (evento.persona_id !== selected.id) return false;
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end) return false;
      return true;
    });
    eventsYear.forEach((evento) => {
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end) return;
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      const tipo = tipoMap[evento.tipo_evento_id] || "Evento";
      const tipoKey = normalizeText(tipo) || "evento";
      for (let y = startYear; y <= endYear; y += 1) {
        const rangeStart = new Date(y, 0, 1);
        const rangeEnd = new Date(y, 11, 31);
        const days = countEventDaysInRange(evento, rangeStart, rangeEnd);
        if (!days) continue;
        const entry = annualTotals.get(y) || { total: 0, tipos: {} };
        entry.total += days;
        entry.tipos[tipoKey] = (entry.tipos[tipoKey] || 0) + days;
        annualTotals.set(y, entry);
      }
    });

    eventsList.innerHTML = "";
    if (!eventsListItems.length) {
      if (emptyEl) emptyEl.textContent = "Sin eventos en el mes seleccionado.";
    } else {
      if (emptyEl) emptyEl.textContent = "";
      eventsListItems.forEach((label) => {
        const li = document.createElement("li");
        li.textContent = label;
        eventsList.appendChild(li);
      });
    }
    if (eventsAnnualList) {
      eventsAnnualList.innerHTML = "";
      if (!annualTotals.size) {
        const li = document.createElement("li");
        li.textContent = "Sin eventos anuales.";
        eventsAnnualList.appendChild(li);
      } else {
        Array.from(annualTotals.entries())
          .sort((a, b) => b[0] - a[0])
          .forEach(([yearKey, totals]) => {
            const totalLabel = Number.isInteger(totals.total)
              ? totals.total
              : totals.total.toFixed(1);
            const types = Object.entries(totals.tipos || {}).sort((a, b) =>
              a[0].localeCompare(b[0], "es", { sensitivity: "base" })
            );
            const li = document.createElement("li");
            li.textContent = `${yearKey} · Total ${totalLabel} dias`;
            li.className = "oneonone-annual";
            eventsAnnualList.appendChild(li);

            if (types.length) {
              types.forEach(([key, value]) => {
                const label =
                  key === "eventos" || key === "evento"
                    ? "Evento"
                    : key.charAt(0).toUpperCase() + key.slice(1);
                const formatted = Number.isInteger(value) ? value : value.toFixed(1);
                const detail = document.createElement("li");
                detail.textContent = `- ${label}: ${formatted} dias`;
                detail.className = "oneonone-annual-detail";
                eventsAnnualList.appendChild(detail);
              });
            }
          });
      }
    }

    const personaMap = new Map(
      (state.base.personas || []).map((persona) => [
        persona.id,
        `${persona.nombre} ${persona.apellido}`.trim(),
      ])
    );
    const apiItems = (state.base.sprintItems || []).map((item) => ({
      issue_key: item.issue_key || "",
      status: item.status || "",
      story_points: item.story_points ?? "",
      assignee: personaMap.get(item.persona_id) || item.assignee_nombre || "",
      persona_id: item.persona_id || null,
      celula_id: item.celula_id || "",
    }));
    const combined = apiItems.filter(
      (item) => String(item.celula_id) === String(state.selectedCelulaId)
    );
    const assigneeKey = normalizeLabel(fullName);
    const itemsPersona = combined.filter((item) => {
      if (item.persona_id && item.persona_id === selected.id) return true;
      return normalizeLabel(item.assignee) === assigneeKey;
    });

    const normalizeStatus = (status) => {
      const value = String(status || "").toLowerCase();
      if (value.includes("to do") || value === "todo") return "todo";
      if (value.includes("in progress")) return "inprogress";
      if (value.includes("final")) return "done";
      if (value.includes("cancel")) return "cancel";
      if (value.includes("done")) return "done";
      return "";
    };
    const totals = { total: itemsPersona.length, done: 0, inprogress: 0, todo: 0, cancel: 0 };
    let pointsTotal = 0;
    let pointsDone = 0;
    itemsPersona.forEach((item) => {
      const status = normalizeStatus(item.status);
      if (status === "done") totals.done += 1;
      else if (status === "inprogress") totals.inprogress += 1;
      else if (status === "todo") totals.todo += 1;
      else if (status === "cancel") totals.cancel += 1;
      const points = Number(item.story_points);
      if (!Number.isNaN(points)) {
        pointsTotal += points;
        if (status === "done") pointsDone += points;
      }
    });
    const velocityPct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;
    const performancePct = pointsTotal ? Math.round((pointsDone / pointsTotal) * 100) : 0;
    kpiWrap.innerHTML = `
      <div class="kpi-card">
        <p>Items totales</p>
        <strong>${totals.total}</strong>
        <span class="sub">${totals.done} finalizadas</span>
      </div>
      <div class="kpi-card">
        <p>Velocidad cierre</p>
        <strong>${velocityPct}%</strong>
        <span class="sub">${totals.done}/${totals.total} items</span>
      </div>
      <div class="kpi-card">
        <p>Rendimiento (SP)</p>
        <strong>${performancePct}%</strong>
        <span class="sub">${pointsDone}/${pointsTotal} pts</span>
      </div>
      <div class="kpi-card">
        <p>En progreso</p>
        <strong>${totals.inprogress}</strong>
        <span class="sub">${totals.todo} por iniciar</span>
      </div>
    `;

    const defaultChecklist = [
      "Estado personal",
      "Bloqueos",
      "Foco de la semana",
      "Retro + proximos pasos",
    ];
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const noteKey = `${state.selectedCelulaId}:${selected.id}:${monthKey}`;

    const normalizeNotes = (payload) => {
      if (!payload) return null;
      const checklist = Array.isArray(payload.checklist) ? payload.checklist : [];
      const agreements = Array.isArray(payload.agreements) ? payload.agreements : [];
      return {
        checklist: checklist.map((item) => ({
          id: item.id ?? Date.now() + Math.random(),
          text: item.text ?? "",
          done: Boolean(item.done),
        })),
        agreements: agreements.map((item) => ({
          id: item.id ?? Date.now() + Math.random(),
          text: item.text ?? "",
          due: item.due ?? "",
          done: Boolean(item.done),
        })),
        mood: payload.mood || "",
        feedback_pos: payload.feedback_pos || "",
        feedback_neg: payload.feedback_neg || "",
        growth: payload.growth || "",
      };
    };

    const fetchNotes = async () => {
      const params = new URLSearchParams({
        celula_id: String(state.selectedCelulaId),
        persona_id: String(selected.id),
        month: monthKey,
      });
      const res = await fetchWithFallback(`/oneonone-notes?${params.toString()}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "No se pudo cargar notas");
      }
      const data = await res.json();
      return normalizeNotes({
        checklist: data.checklist,
        agreements: data.agreements,
        mood: data.mood,
        feedback_pos: data.feedback_pos,
        feedback_neg: data.feedback_neg,
        growth: data.growth,
      });
    };

    const buildDefaultNotes = () => ({
      checklist: defaultChecklist.map((text) => ({ id: Date.now() + Math.random(), text, done: false })),
      agreements: [],
      mood: "",
      feedback_pos: "",
      feedback_neg: "",
      growth: "",
    });

    let notes = buildDefaultNotes();
    state.oneononeNotesCache[noteKey] = notes;

    const resetNotes = () => {
      notes = buildDefaultNotes();
      notes.agreements = [];
      notes.mood = "";
      notes.feedback_pos = "";
      notes.feedback_neg = "";
      notes.growth = "";
      state.oneononeNotesCache[noteKey] = notes;
      renderNotesSection();
    };

    const buildPayload = () => ({
      celula_id: Number(state.selectedCelulaId),
      persona_id: Number(selected.id),
      mes: monthKey,
      checklist: notes.checklist,
      agreements: notes.agreements,
      mood: notes.mood,
      feedback_pos: notes.feedback_pos,
      feedback_neg: notes.feedback_neg,
      growth: notes.growth,
    });

    const saveNotesNow = async () => {
      state.oneononeNotesCache[noteKey] = notes;
      if (state.oneononeSaveTimer) {
        clearTimeout(state.oneononeSaveTimer);
        state.oneononeSaveTimer = null;
      }
      try {
        await postJson("/oneonone-notes", buildPayload());
      } catch {
        // ignore
      }
    };

    const persistNotes = () => {
      state.oneononeNotesCache[noteKey] = notes;
      if (state.oneononeSaveTimer) {
        clearTimeout(state.oneononeSaveTimer);
      }
      state.oneononeSaveTimer = setTimeout(saveNotesNow, 600);
    };

    const sessionsKey = `${state.selectedCelulaId}:${selected.id}`;
    const fetchSessionsForPersona = async (personaId) => {
      const params = new URLSearchParams({
        celula_id: String(state.selectedCelulaId),
        persona_id: String(personaId),
      });
      const res = await fetchWithFallback(`/oneonone-sessions?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "No se pudo cargar historial");
      }
      return res.json();
    };

    let sessions = state.oneononeSessionsCache?.[sessionsKey];
    if (!sessions) {
      try {
        sessions = await fetchSessionsForPersona(selected.id);
      } catch {
        sessions = [];
      }
      state.oneononeSessionsCache = state.oneononeSessionsCache || {};
      state.oneononeSessionsCache[sessionsKey] = sessions;
    }
    let commitmentSessions = [];
    try {
      const allSessions = await Promise.all(
        sortedPersonas.map(async (persona) => {
          const key = `${state.selectedCelulaId}:${persona.id}`;
          let cached = state.oneononeSessionsCache?.[key];
          if (!cached) {
            cached = await fetchSessionsForPersona(persona.id);
            state.oneononeSessionsCache = state.oneononeSessionsCache || {};
            state.oneononeSessionsCache[key] = cached;
          }
          const personaName = `${persona.nombre} ${persona.apellido}`.trim();
          return (cached || []).map((session) => ({
            ...session,
            persona_nombre: personaName,
          }));
        })
      );
      commitmentSessions = allSessions.flat();
    } catch {
      commitmentSessions = sessions.map((session) => ({
        ...session,
        persona_nombre: fullName,
      }));
    }

    const formatSessionDate = (value) => {
      if (!value) return "";
      return formatDate(String(value).split("T")[0]);
    };

    const summarizeList = (items) => {
      if (!Array.isArray(items) || !items.length) return "-";
      return items
        .map((item) => item.text)
        .filter(Boolean)
        .join(" · ");
    };

    const summarizeAgreements = (items) => {
      if (!Array.isArray(items) || !items.length) return "-";
      return items
        .map((item) => {
          const label = item.text || "";
          const due = item.due ? ` (${formatDate(item.due)})` : "";
          return `${label}${due}`.trim();
        })
        .filter(Boolean)
        .join(" · ");
    };

    const renderCommitments = () => {
      if (!commitmentsTable) return;
      const todayValue = getToday();
      const entries = [];
      let pendingCount = 0;
      let overdueCount = 0;
      commitmentSessions.forEach((session) => {
        const agreements = Array.isArray(session.agreements) ? session.agreements : [];
        agreements.forEach((item) => {
          if (!item || !String(item.text || "").trim()) return;
          if (item.done) return;
          const dueLabel = item.due ? formatDate(item.due) : "-";
          const assignedLabel =
            item.assignee ||
            item.asignado ||
            item.responsable ||
            session.persona_nombre ||
            fullName ||
            "-";
          const dueDate = item.due ? parseDateOnly(item.due) : null;
          let statusLabel = "Pendiente";
          let statusClass = "status-warn";
          if (dueDate && dueDate < todayValue) {
            statusLabel = "Vencido";
            statusClass = "status-danger";
            overdueCount += 1;
          } else {
            pendingCount += 1;
          }
          entries.push({
            text: item.text,
            dueLabel,
            assignedLabel,
            statusLabel,
            statusClass,
            sessionDate: formatSessionDate(session.fecha),
            rank: statusLabel === "Vencido" ? 0 : 1,
            dueSort: dueDate ? dueDate.getTime() : Number.POSITIVE_INFINITY,
          });
        });
      });
      if (!entries.length) {
        commitmentsTable.innerHTML = '<p class="helper">Sin compromisos.</p>';
        if (commitmentsSummary) commitmentsSummary.textContent = "";
        return;
      }
      if (commitmentsSummary) {
        commitmentsSummary.textContent = `Pendientes: ${pendingCount} · Vencidos: ${overdueCount}`;
      }
      const rows = entries
        .sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank;
          if (a.dueSort !== b.dueSort) return a.dueSort - b.dueSort;
          return String(a.text).localeCompare(String(b.text), "es");
        })
        .map(
          (entry) => `
            <tr>
              <td>${entry.text}</td>
              <td>${entry.dueLabel}</td>
              <td>${entry.assignedLabel}</td>
              <td><span class="status-pill ${entry.statusClass}">${entry.statusLabel}</span></td>
              <td>${entry.sessionDate}</td>
            </tr>
          `
        )
        .join("");
      commitmentsTable.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Compromiso</th>
              <th>Vence</th>
              <th>Asignado</th>
              <th>Estado</th>
              <th>1:1</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    };

    const renderSessions = () => {
      if (!historyTable) return;
      if (!sessions.length) {
        historyTable.innerHTML = '<p class="helper">Sin registros historicos.</p>';
        if (commitmentsTable) commitmentsTable.innerHTML = '<p class="helper">Sin compromisos.</p>';
        if (commitmentsSummary) commitmentsSummary.textContent = "";
        return;
      }
      const todayValue = getToday();
      const rows = sessions
        .slice()
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
        .map((session) => {
          const checklistCount = session.checklist?.length || 0;
          const agreementsCount = session.agreements?.length || 0;
          const feedbackText = [session.feedback_pos, session.feedback_neg]
            .map((value) => (value || "").trim())
            .filter(Boolean)
            .join(" / ");
          const growthText = (session.growth || "").trim();
          const detailChecklist = summarizeList(session.checklist);
          const detailAgreements = summarizeAgreements(session.agreements);
          const detailFeedback = feedbackText || "-";
          const detailGrowth = growthText || "-";
          const agreements = Array.isArray(session.agreements) ? session.agreements : [];
          const pending = agreements.filter((item) => !item.done);
          const overdue = pending.some((item) => {
            if (!item.due) return false;
            const dueDate = parseDateOnly(item.due);
            return dueDate && dueDate < todayValue;
          });
          let statusLabel = "Sin acuerdos";
          let statusClass = "status-muted";
          let statusValue = "none";
          if (agreements.length) {
            if (overdue) {
              statusLabel = "Vencido";
              statusClass = "status-danger";
              statusValue = "overdue";
            } else if (pending.length === 0) {
              statusLabel = "Finalizado";
              statusClass = "status-ok";
              statusValue = "done";
            } else {
              statusLabel = "Pendiente";
              statusClass = "status-warn";
              statusValue = "pending";
            }
          }
          const statusControl = `
            <select class="status-pill ${statusClass} session-status-select" data-id="${session.id}" aria-label="Estado de 1:1" ${
              agreements.length ? "" : "disabled"
            }>
              ${
                agreements.length
                  ? `
                    <option value="pending" ${statusValue === "pending" ? "selected" : ""}>Pendiente</option>
                    <option value="done" ${statusValue === "done" ? "selected" : ""}>Finalizado</option>
                    <option value="overdue" ${statusValue === "overdue" ? "selected" : ""}>Vencido</option>
                  `
                  : `<option value="none" selected>Sin acuerdos</option>`
              }
            </select>
          `;
          return `
            <tr class="session-row" data-session="${session.id}">
              <td>${formatSessionDate(session.fecha)}</td>
              <td>${statusControl}</td>
              <td>${session.mood || "-"}</td>
              <td>${agreementsCount}</td>
              <td>${checklistCount}</td>
              <td>${growthText ? "Si" : "No"}</td>
              <td>
                <div class="action-wrap">
                  <button class="icon-btn" type="button" data-action="edit" data-id="${session.id}" aria-label="Editar">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L18.8 8.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.4l-2.34-2.34a1 1 0 0 0-1.4 0l-1.82 1.82 3.75 3.75 1.81-1.83z"/></svg>
                  </button>
                  <button class="icon-btn" type="button" data-action="delete" data-id="${session.id}" aria-label="Eliminar">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h2v10H7zm4 0h2v10h-2zm4 0h2v10h-2zM9 4h6l1 2h4v2H4V6h4l1-2zm-3 6h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10z"/></svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr class="session-detail" data-detail="${session.id}" hidden>
              <td colspan="7">
                <strong>Checklist:</strong> ${detailChecklist}<br />
                <strong>Acuerdos:</strong> ${detailAgreements}<br />
                <strong>Feedback:</strong> ${detailFeedback}<br />
                <strong>Crecimiento:</strong> ${detailGrowth}
              </td>
            </tr>
          `;
        })
        .join("");
      historyTable.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Animo</th>
              <th>Acuerdos</th>
              <th>Checklist</th>
              <th>Crecimiento</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
      renderCommitments();
      enhanceOneOnOneTable(historyTable.querySelector("table"), "oneonone-history");

      const updateSessionStatus = async (sessionId, newStatus) => {
        const session = sessions.find((item) => String(item.id) === String(sessionId));
        if (!session) return;
        const agreements = Array.isArray(session.agreements) ? session.agreements : [];
        if (!agreements.length) return;
        const doneValue = newStatus === "done";
        const updatedAgreements = agreements.map((item) => ({
          ...item,
          done: doneValue ? true : false,
        }));
        const payload = {
          fecha: session.fecha,
          checklist: session.checklist || [],
          agreements: updatedAgreements,
          mood: session.mood || "",
          feedback_pos: session.feedback_pos || "",
          feedback_neg: session.feedback_neg || "",
          growth: session.growth || "",
        };
        const saved = await putJson(`/oneonone-sessions/${sessionId}`, payload);
        sessions = sessions.map((item) =>
          String(item.id) === String(saved.id) ? saved : item
        );
        state.oneononeSessionsCache[sessionsKey] = sessions;
        renderSessions();
      };

      historyTable.querySelectorAll(".session-row").forEach((row) => {
        row.addEventListener("click", (event) => {
          const target = event.target;
          if (target.closest(".icon-btn") || target.closest(".session-status-select")) return;
          const sessionId = row.dataset.session;
          const detail = historyTable.querySelector(`[data-detail=\"${sessionId}\"]`);
          if (detail) {
            detail.hidden = !detail.hidden;
          }
        });
      });

      historyTable.querySelectorAll(".session-status-select").forEach((select) => {
        select.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        select.addEventListener("change", async (event) => {
          event.stopPropagation();
          const sessionId = select.dataset.id;
          const newStatus = select.value;
          if (newStatus === "none") return;
          select.disabled = true;
          try {
            await updateSessionStatus(sessionId, newStatus);
          } catch {
            // ignore
          } finally {
            select.disabled = false;
          }
        });
      });

      historyTable.querySelectorAll("[data-action='edit']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          const sessionId = btn.dataset.id;
          const session = sessions.find((item) => String(item.id) === String(sessionId));
          if (!session) return;
          state.oneononeEditingSessionId = String(session.id);
          notes.checklist = (session.checklist || []).map((item) => ({
            id: item.id ?? Date.now() + Math.random(),
            text: item.text ?? "",
            done: Boolean(item.done),
          }));
          notes.agreements = (session.agreements || []).map((item) => ({
            id: item.id ?? Date.now() + Math.random(),
            text: item.text ?? "",
            due: item.due ?? "",
            done: Boolean(item.done),
          }));
          notes.mood = session.mood || "";
          notes.feedback_pos = session.feedback_pos || "";
          notes.feedback_neg = session.feedback_neg || "";
          notes.growth = session.growth || "";
          renderNotesSection();
          if (sessionSaveBtn) sessionSaveBtn.textContent = "Actualizar 1:1";
        });
      });

      historyTable.querySelectorAll("[data-action='delete']").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
          event.stopPropagation();
          const sessionId = btn.dataset.id;
          if (!window.confirm("Eliminar este registro de 1:1?")) return;
          try {
            const res = await fetchWithFallback(`/oneonone-sessions/${sessionId}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(text || "No se pudo eliminar");
            }
            sessions = sessions.filter((item) => String(item.id) !== String(sessionId));
            state.oneononeSessionsCache[sessionsKey] = sessions;
            renderSessions();
          } catch {
            // ignore
          }
        });
      });
    };

    const saveSession = async () => {
      const celulaId = Number(state.selectedCelulaId);
      const personaId = Number(selected.id);
      if (!Number.isFinite(celulaId) || !Number.isFinite(personaId)) {
        alert("Selecciona una celula y una persona antes de registrar.");
        return;
      }
      const sessionDate = formatISO(getToday());
      const checklist = notes.checklist.map((item) => ({
        text: (item.text || "").trim(),
        done: Boolean(item.done),
      }));
      const agreements = notes.agreements.map((item) => ({
        text: (item.text || "").trim(),
        due: item.due || "",
        done: Boolean(item.done),
      }));
      const payload = {
        celula_id: celulaId,
        persona_id: personaId,
        fecha: sessionDate,
        checklist,
        agreements,
        mood: notes.mood || "",
        feedback_pos: notes.feedback_pos || "",
        feedback_neg: notes.feedback_neg || "",
        growth: notes.growth || "",
      };
      const missing = [];
      if (!agreements.some((item) => item.text)) missing.push("Acuerdos");
      if (!payload.mood) missing.push("Estado de animo");
      if (!payload.feedback_pos) missing.push("Feedback positivo");
      if (!payload.feedback_neg) missing.push("Feedback negativo");
      if (!payload.growth) missing.push("Foco de crecimiento");
      if (missing.length) {
        alert(`Campos obligatorios: ${missing.join(", ")}`);
        return;
      }
      try {
        let saved;
        if (state.oneononeEditingSessionId) {
          const updatePayload = {
            fecha: payload.fecha,
            checklist: payload.checklist,
            agreements: payload.agreements,
            mood: payload.mood,
            feedback_pos: payload.feedback_pos,
            feedback_neg: payload.feedback_neg,
            growth: payload.growth,
          };
          saved = await putJson(`/oneonone-sessions/${state.oneononeEditingSessionId}`, updatePayload);
          sessions = sessions.map((item) =>
            String(item.id) === String(saved.id) ? saved : item
          );
        } else {
          saved = await postJson("/oneonone-sessions", payload);
          sessions.unshift(saved);
        }
        state.oneononeSessionsCache[sessionsKey] = sessions;
        state.oneononeEditingSessionId = "";
        if (sessionSaveBtn) sessionSaveBtn.textContent = "Registrar 1:1";
        notes.checklist = buildDefaultNotes().checklist;
        notes.agreements = [];
        notes.mood = "";
        notes.feedback_pos = "";
        notes.feedback_neg = "";
        notes.growth = "";
        state.oneononeNotesCache[noteKey] = notes;
        renderNotesSection();
        renderSessions();
      } catch {
        // ignore
      }
    };

    const renderNoteList = (container, items, opts = {}) => {
      if (!container) return;
      container.innerHTML = "";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "note-row";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !!item.done;
        checkbox.addEventListener("change", () => {
          item.done = checkbox.checked;
          persistNotes();
        });

        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.placeholder = opts.placeholder || "Detalle";
        textInput.value = item.text || "";
        textInput.addEventListener("input", () => {
          item.text = textInput.value;
          persistNotes();
        });

        row.appendChild(checkbox);
        row.appendChild(textInput);

        if (opts.withDate) {
          const dateInput = document.createElement("input");
          dateInput.type = "date";
          dateInput.value = item.due || "";
          dateInput.addEventListener("input", () => {
            item.due = dateInput.value;
            persistNotes();
          });
          row.appendChild(dateInput);
        }

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "note-remove";
        removeBtn.textContent = "x";
        removeBtn.addEventListener("click", () => {
          const index = items.findIndex((entry) => entry.id === item.id);
          if (index >= 0) {
            items.splice(index, 1);
            persistNotes();
            renderNotesSection();
          }
        });
        row.appendChild(removeBtn);
        container.appendChild(row);
      });
    };

    const renderNotesSection = () => {
      renderNoteList(checklistEl, notes.checklist, { placeholder: "Item" });
      renderNoteList(agreementsEl, notes.agreements, { placeholder: "Acuerdo", withDate: true });
      if (moodSelect) {
        moodSelect.value = notes.mood || "";
      }
      if (moodLabel) {
        moodLabel.textContent = notes.mood ? `Seleccionado: ${notes.mood}` : "";
      }
      if (feedbackPos) feedbackPos.value = notes.feedback_pos || "";
      if (feedbackNeg) feedbackNeg.value = notes.feedback_neg || "";
      if (growthEl) growthEl.value = notes.growth || "";
    };

    renderNotesSection();
    renderSessions();

    if (checklistAddBtn) {
      checklistAddBtn.onclick = () => {
        notes.checklist.push({ id: Date.now() + Math.random(), text: "", done: false });
        persistNotes();
        renderNotesSection();
      };
    }

    if (agreementsAddBtn) {
      agreementsAddBtn.onclick = () => {
        notes.agreements.push({ id: Date.now() + Math.random(), text: "", due: "", done: false });
        persistNotes();
        renderNotesSection();
      };
    }

    if (moodSelect) {
      moodSelect.onchange = () => {
        notes.mood = moodSelect.value;
        persistNotes();
        renderNotesSection();
      };
    }

    if (feedbackPos) {
      feedbackPos.oninput = () => {
        notes.feedback_pos = feedbackPos.value;
        persistNotes();
      };
    }

    if (feedbackNeg) {
      feedbackNeg.oninput = () => {
        notes.feedback_neg = feedbackNeg.value;
        persistNotes();
      };
    }

    if (growthEl) {
      growthEl.oninput = () => {
        notes.growth = growthEl.value;
        persistNotes();
      };
    }

    if (sessionSaveBtn) {
      sessionSaveBtn.onclick = () => {
        saveNotesNow();
        saveSession();
      };
    }

    if (sessionCancelBtn) {
      sessionCancelBtn.onclick = () => {
        state.oneononeEditingSessionId = "";
        if (sessionSaveBtn) sessionSaveBtn.textContent = "Registrar 1:1";
        if (state.oneononeSaveTimer) {
          clearTimeout(state.oneononeSaveTimer);
          state.oneononeSaveTimer = null;
        }
        resetNotes();
      };
    }

    function openOneOnOneDayModal(dateKey, dayEvents) {
      const modal = qs("#oneonone-day-modal");
      if (!modal) return;
      const title = qs("#oneonone-day-modal-title");
      const list = qs("#oneonone-day-modal-list");
      if (title) {
        title.textContent = `Eventos del dia ${formatDate(dateKey)}`;
      }
      if (list) {
        list.innerHTML = "";
        if (!dayEvents.length) {
          const li = document.createElement("li");
          li.textContent = "Sin eventos registrados.";
          list.appendChild(li);
        } else {
          dayEvents.forEach((item) => {
            const li = document.createElement("li");
            li.textContent = item.label;
            list.appendChild(li);
          });
        }
      }
      if (!modal.dataset.bound) {
        modal.dataset.bound = "true";
        const closeBtn = modal.querySelector(".modal-close");
        if (closeBtn) {
          closeBtn.addEventListener("click", () => {
            modal.classList.remove("open");
          });
        }
        modal.addEventListener("click", (event) => {
          if (event.target === modal) {
            modal.classList.remove("open");
          }
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            modal.classList.remove("open");
          }
        });
      }
      modal.classList.add("open");
    }
  }

  function renderAdminTable(container, rows, columns, actions = [], tailColumns = []) {
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<p class="empty">Sin registros</p>';
      return;
    }
    const disableDataTables = container.id === "daily-dev-table";
    const disableFilters = container.id === "daily-dev-table";
    const useDataTables =
      !disableDataTables && Boolean(window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable);
    const tableKey = container.id || "table";
    state.tableFilters[tableKey] = state.tableFilters[tableKey] || {};
    const filters = useDataTables ? {} : state.tableFilters[tableKey];
    const sortState = useDataTables ? null : state.tableSort[tableKey] || null;
    let preservedPage = null;
    if (useDataTables) {
      const existingTable = container.querySelector("table");
      if (existingTable && window.jQuery.fn.DataTable.isDataTable(existingTable)) {
        preservedPage = window.jQuery(existingTable).DataTable().page();
        state.tableDataPage = state.tableDataPage || {};
        state.tableDataPage[tableKey] = preservedPage;
      }
    }
    const renderCellContent = (td, rendered) => {
      if (rendered instanceof Node) {
        td.appendChild(rendered);
        return;
      }
      if (rendered && typeof rendered === "object" && "text" in rendered) {
        const valueSpan = document.createElement("span");
        valueSpan.textContent = rendered.text ?? "";
        if (rendered.className) {
          valueSpan.className = rendered.className;
        }
        td.appendChild(valueSpan);
        if (Array.isArray(rendered.arrows)) {
          rendered.arrows.forEach((arrow) => {
            if (!arrow || !arrow.icon) return;
            const arrowSpan = document.createElement("span");
            arrowSpan.className = `trend-arrow ${arrow.className || ""}`;
            arrowSpan.textContent = arrow.icon;
            td.appendChild(arrowSpan);
          });
        } else if (rendered.arrow) {
          const arrowSpan = document.createElement("span");
          arrowSpan.className = `trend-arrow ${rendered.arrowClass || ""}`;
          arrowSpan.textContent = rendered.arrow;
          td.appendChild(arrowSpan);
        }
        return;
      }
      td.textContent = rendered == null ? "" : rendered;
    };
    const pageKey = container.id || "table";
    const rerenderTable = () => {
      if (container.closest("#daily-panel")) {
        renderDaily(state.base);
        return;
      }
      if (container.closest("#release-table-page")) {
        initReleaseTable();
        return;
      }
      renderAdmin(state.base);
    };
    const restoreTableFocus = (tableEl) => {
      const focus = state.lastTableFocus;
      if (!focus || focus.tableKey !== tableKey) return;
      const keys = [...columns, ...tailColumns].map((col) => col.key);
      const idx = keys.indexOf(focus.colKey);
      if (idx < 0) return;
      const inputs = tableEl.querySelectorAll(".filter-row .column-filter");
      const input = inputs[idx];
      if (!input) return;
      input.focus();
      const pos = Math.min(focus.caret ?? input.value.length, input.value.length);
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(pos, pos);
      }
    };
    const normalizeValue = (value) => {
      if (value == null) return "";
      if (Array.isArray(value)) {
        return value
          .map((item) => (item && typeof item === "object" ? item.nombre || item.label || item : item))
          .join(", ");
      }
      if (value && typeof value === "object" && "text" in value) {
        return String(value.text ?? "");
      }
      return String(value);
    };
    const getColumnValue = (row, col, index) => {
      if (col.getValue) return col.getValue(row, index);
      if (col.key === "_index") return index + 1;
      if (col.render) {
        const rendered = col.render(row);
        if (rendered instanceof Node) {
          return col.key in row ? row[col.key] : "";
        }
        if (rendered && typeof rendered === "object" && "text" in rendered) {
          return rendered.text ?? "";
        }
        if (typeof rendered === "string" || typeof rendered === "number") {
          return rendered;
        }
      }
      if (col.key in row) return row[col.key];
      return "";
    };
    const filterColumns = [...columns, ...tailColumns];
    const filteredRows = useDataTables
      ? rows
      : rows.filter((row, index) =>
          filterColumns.every((col) => {
            const filterValue = String(filters[col.key] || "").trim().toLowerCase();
            if (!filterValue) return true;
            const value = normalizeValue(getColumnValue(row, col, index)).toLowerCase();
            return value.includes(filterValue);
          })
        );
    const totalRows = filteredRows.filter((row) => row?._isTotal);
    const sortableRows = filteredRows.filter((row) => !row?._isTotal);
    const sortedRows = [...sortableRows];
    if (sortState?.key) {
      const sortCol = filterColumns.find((col) => col.key === sortState.key);
      if (sortCol && sortCol.key !== "_select") {
        sortedRows.sort((a, b) => {
          const aVal = normalizeValue(getColumnValue(a, sortCol, 0));
          const bVal = normalizeValue(getColumnValue(b, sortCol, 0));
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          let result = 0;
          if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
            result = aNum - bNum;
          } else {
            result = aVal.localeCompare(bVal, "es", {
              numeric: true,
              sensitivity: "base",
            });
          }
          return sortState.dir === "desc" ? -result : result;
        });
      }
    }
    const orderedRows = [...sortedRows, ...totalRows];
    const defaultPageSize = container.id === "admin-sprint-items" ? 25 : 0;
    const pageSize = useDataTables ? 0 : Number(container.dataset.pageSize || defaultPageSize) || 0;
    let page = state.adminPage?.[pageKey] || 1;
    const totalPages = pageSize ? Math.ceil(orderedRows.length / pageSize) : 1;
    if (page > totalPages) {
      page = totalPages;
      state.adminPage[pageKey] = page;
    }
    const startIndex = pageSize ? (page - 1) * pageSize : 0;
    const endIndex = pageSize ? startIndex + pageSize : orderedRows.length;
    const pagedRows = pageSize ? orderedRows.slice(startIndex, endIndex) : orderedRows;
    const table = document.createElement("table");
    if (useDataTables) {
      table.className = "table table-bordered table-striped";
    }
    const selection = getAdminSelection(tableKey);
    const selectableIds = sortedRows.map((row) => row?.id).filter(Boolean);
    if (selection.size) {
      const selectableSet = new Set(selectableIds);
      Array.from(selection).forEach((id) => {
        if (!selectableSet.has(id)) {
          selection.delete(id);
        }
      });
    }
    let headerCheckbox = null;
    const updateHeaderCheckbox = () => {
      if (!headerCheckbox) return;
      if (!selectableIds.length) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
        headerCheckbox.disabled = true;
        return;
      }
      headerCheckbox.disabled = false;
      const selectedCount = selectableIds.filter((id) => selection.has(id)).length;
      headerCheckbox.checked = selectedCount === selectableIds.length;
      headerCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectableIds.length;
    };
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      if (col.key === "_select") {
        headerCheckbox = document.createElement("input");
        headerCheckbox.type = "checkbox";
        headerCheckbox.className = "select-all";
        headerCheckbox.addEventListener("change", () => {
          const checked = headerCheckbox.checked;
          if (checked) {
            selectableIds.forEach((id) => selection.add(id));
          } else {
            selectableIds.forEach((id) => selection.delete(id));
          }
          table.querySelectorAll("input.row-select").forEach((input) => {
            if (!input.disabled) input.checked = checked;
          });
          headerCheckbox.indeterminate = false;
        });
        updateHeaderCheckbox();
        th.appendChild(headerCheckbox);
      } else if (useDataTables) {
        th.textContent = col.label;
      } else {
        th.className = "sortable";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "table-sort";
        const indicator = document.createElement("span");
        indicator.className = "sort-indicator";
        if (sortState?.key === col.key) {
          indicator.textContent = sortState.dir === "desc" ? "▼" : "▲";
        }
        btn.append(document.createTextNode(col.label), indicator);
        btn.addEventListener("click", () => {
          const current = state.tableSort[tableKey];
          const nextDir =
            current && current.key === col.key && current.dir === "asc" ? "desc" : "asc";
          state.tableSort[tableKey] = { key: col.key, dir: nextDir };
          state.adminPage[pageKey] = 1;
          rerenderTable();
        });
        th.appendChild(btn);
      }
      headRow.appendChild(th);
    });
    if (actions.length) {
      const th = document.createElement("th");
      th.textContent = "Acciones";
      headRow.appendChild(th);
    }
    if (tailColumns.length) {
      tailColumns.forEach((col) => {
        const th = document.createElement("th");
        if (useDataTables) {
          th.textContent = col.label;
        } else {
          th.className = "sortable";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "table-sort";
          const indicator = document.createElement("span");
          indicator.className = "sort-indicator";
          if (sortState?.key === col.key) {
            indicator.textContent = sortState.dir === "desc" ? "▼" : "▲";
          }
          btn.append(document.createTextNode(col.label), indicator);
          btn.addEventListener("click", () => {
            const current = state.tableSort[tableKey];
            const nextDir =
              current && current.key === col.key && current.dir === "asc" ? "desc" : "asc";
            state.tableSort[tableKey] = { key: col.key, dir: nextDir };
            state.adminPage[pageKey] = 1;
            rerenderTable();
          });
          th.appendChild(btn);
        }
        headRow.appendChild(th);
      });
    }
    thead.appendChild(headRow);
    if (!useDataTables && !disableFilters) {
      const filterRow = document.createElement("tr");
      filterRow.className = "filter-row";
      columns.forEach((col) => {
        const th = document.createElement("th");
        if (col.key === "_select") {
          filterRow.appendChild(th);
          return;
        }
        const input = document.createElement("input");
        input.type = "search";
        input.className = "column-filter";
        input.placeholder = "Buscar";
        input.value = filters[col.key] || "";
        input.addEventListener("input", () => {
          filters[col.key] = input.value;
          state.lastTableFocus = {
            tableKey,
            colKey: col.key,
            caret: input.selectionStart ?? input.value.length,
          };
          state.adminPage[pageKey] = 1;
          rerenderTable();
        });
        th.appendChild(input);
        filterRow.appendChild(th);
      });
      if (actions.length) {
        const th = document.createElement("th");
        filterRow.appendChild(th);
      }
      if (tailColumns.length) {
        tailColumns.forEach((col) => {
          const th = document.createElement("th");
          const input = document.createElement("input");
          input.type = "search";
          input.className = "column-filter";
          input.placeholder = "Buscar";
          input.value = filters[col.key] || "";
          input.addEventListener("input", () => {
            filters[col.key] = input.value;
            state.lastTableFocus = {
              tableKey,
              colKey: col.key,
              caret: input.selectionStart ?? input.value.length,
            };
            state.adminPage[pageKey] = 1;
            rerenderTable();
          });
          th.appendChild(input);
          filterRow.appendChild(th);
        });
      }
      thead.appendChild(filterRow);
    }
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    if (!pagedRows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      const totalCols = columns.length + (actions.length ? 1 : 0) + tailColumns.length;
      td.colSpan = totalCols || 1;
      td.className = "empty";
      td.textContent = "Sin registros";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    pagedRows.forEach((row, index) => {
      const tr = document.createElement("tr");
      if (row?._rowClass) {
        row._rowClass
          .split(" ")
          .filter(Boolean)
          .forEach((klass) => tr.classList.add(klass));
      }
      if (row?._rowClick) {
        tr.classList.add("clickable-row");
        tr.addEventListener("click", row._rowClick);
      }
      columns.forEach((col) => {
        const td = document.createElement("td");
        if (col.key === "_index") {
          td.textContent = String(startIndex + index + 1);
        } else if (col.key === "_select") {
          const rendered = buildAdminRowCheckbox(row, tableKey, updateHeaderCheckbox);
          renderCellContent(td, rendered);
        } else {
          const rendered = col.render ? col.render(row) : row[col.key];
          renderCellContent(td, rendered);
        }
        const cellClass = row?._cellClasses?.[col.key];
        if (cellClass) {
          cellClass
            .split(" ")
            .filter(Boolean)
            .forEach((klass) => td.classList.add(klass));
        }
        tr.appendChild(td);
      });
      if (actions.length) {
        const td = document.createElement("td");
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "action-wrap";
        actions.forEach((action, actionIdx) => {
          const btn = document.createElement("button");
          btn.className = "icon-btn";
          btn.type = "button";
          btn.setAttribute("aria-label", action.label);
          btn.innerHTML = action.icon || "";
          if (row?.id != null) {
            btn.dataset.rowId = String(row.id);
          }
          btn.dataset.actionIdx = String(actionIdx);
          btn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            action.onClick(row);
          });
          actionsWrap.appendChild(btn);
        });
        td.appendChild(actionsWrap);
        tr.appendChild(td);
      }
      if (tailColumns.length) {
        tailColumns.forEach((col) => {
          const td = document.createElement("td");
          const rendered = col.render ? col.render(row) : row[col.key];
          renderCellContent(td, rendered);
          tr.appendChild(td);
        });
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.innerHTML = "";
    container.appendChild(table);
    updateHeaderCheckbox();
    if (!useDataTables) {
      restoreTableFocus(table);
    }
    if (useDataTables) {
      const dt = initDataTable(table, tableKey);
      const targetPage = state.tableDataPage?.[tableKey];
      if (dt && targetPage != null) {
        dt.page(targetPage).draw(false);
      }
      if (actions.length) {
        const rowById = new Map(
          rows
            .filter((row) => row?.id != null)
            .map((row) => [String(row.id), row])
        );
        table.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-action-idx]");
          if (!btn) return;
          event.preventDefault();
          event.stopPropagation();
          const actionIdx = Number(btn.dataset.actionIdx || "0");
          const action = actions[actionIdx];
          if (!action?.onClick) return;
          const rowId = btn.dataset.rowId;
          const row = rowId ? rowById.get(rowId) : null;
          if (!row) return;
          action.onClick(row);
        });
      }
    }
    if (pageSize && totalPages > 1) {
      const pager = document.createElement("div");
      pager.className = "table-pagination";
      pager.innerHTML = `
        <button type="button" class="btn ghost small" data-page="prev">Anterior</button>
        <span class="page-info">Pagina ${page} de ${totalPages}</span>
        <button type="button" class="btn ghost small" data-page="next">Siguiente</button>
      `;
      pager.querySelector('[data-page="prev"]').addEventListener("click", () => {
        const nextPage = Math.max(1, page - 1);
        state.adminPage[pageKey] = nextPage;
        renderAdmin(state.base);
      });
      pager.querySelector('[data-page="next"]').addEventListener("click", () => {
        const nextPage = Math.min(totalPages, page + 1);
        state.adminPage[pageKey] = nextPage;
        renderAdmin(state.base);
      });
      container.appendChild(pager);
    }
  }

  function initDataTable(table, tableKey) {
    if (!table) return;
    if (!(window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable)) return;
    const $table = window.jQuery(table);
    if (window.jQuery.fn.DataTable.isDataTable(table)) {
      $table.DataTable().destroy();
    }
    $table.addClass("table table-bordered table-striped");
    const dt = $table.DataTable({
      paging: true,
      lengthChange: true,
      searching: true,
      ordering: true,
      info: true,
      autoWidth: false,
      responsive: false,
      order: [],
      buttons: [],
    });
    dt.buttons().container().remove();
    return dt;
  }

  function enhanceStaticTable(table, tableKey) {
    if (!table) return;
    if (tableKey === "person-summary") return;
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable) {
      initDataTable(table, tableKey);
      return;
    }
    const thead = table.querySelector("thead");
    const headRow = thead?.querySelector("tr");
    if (!thead || !headRow) return;
    state.tableFilters[tableKey] = state.tableFilters[tableKey] || {};
    const filters = state.tableFilters[tableKey];

    const headers = Array.from(headRow.children);
    headers.forEach((th, index) => {
      const label = th.textContent || "";
      th.classList.add("sortable");
      th.textContent = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-sort";
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      const sortState = state.tableSort[tableKey];
      if (sortState?.key === String(index)) {
        indicator.textContent = sortState.dir === "desc" ? "▼" : "▲";
      }
      btn.append(document.createTextNode(label), indicator);
      btn.addEventListener("click", () => {
        const current = state.tableSort[tableKey];
        const nextDir =
          current && current.key === String(index) && current.dir === "asc" ? "desc" : "asc";
        state.tableSort[tableKey] = { key: String(index), dir: nextDir };
        applyStaticSortFilter();
      });
      th.appendChild(btn);
    });

    const filterRow = document.createElement("tr");
    filterRow.className = "filter-row";
    headers.forEach((_, index) => {
      const th = document.createElement("th");
      const input = document.createElement("input");
      input.type = "search";
      input.className = "column-filter";
      input.placeholder = "Buscar";
      input.value = filters[index] || "";
      input.addEventListener("input", () => {
        filters[index] = input.value;
        applyStaticSortFilter();
      });
      th.appendChild(input);
      filterRow.appendChild(th);
    });
    thead.appendChild(filterRow);

    const applyStaticSortFilter = () => {
      const tbody = table.querySelector("tbody");
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const sortState = state.tableSort[tableKey];
      const getCellText = (row, idx) =>
        String(row.children[idx]?.textContent ?? "")
          .trim()
          .toLowerCase();
      const matchRow = (row) =>
        headers.every((_, idx) => {
          const filterValue = String(filters[idx] || "").trim().toLowerCase();
          if (!filterValue) return true;
          return getCellText(row, idx).includes(filterValue);
        });
      if (sortState?.key != null) {
        const colIndex = Number(sortState.key);
        const sorted = [...rows].sort((a, b) => {
          const aVal = getCellText(a, colIndex);
          const bVal = getCellText(b, colIndex);
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          let result = 0;
          if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
            result = aNum - bNum;
          } else {
            result = aVal.localeCompare(bVal, "es", { numeric: true, sensitivity: "base" });
          }
          return sortState.dir === "desc" ? -result : result;
        });
        sorted.forEach((row) => tbody.appendChild(row));
      }
      rows.forEach((row) => {
        row.hidden = !matchRow(row);
      });
    };

    applyStaticSortFilter();
  }

  function enhanceOneOnOneTable(table, tableKey) {
    if (!table) return;
    const thead = table.querySelector("thead");
    const headRow = thead?.querySelector("tr");
    if (!thead || !headRow) return;
    state.tableFilters[tableKey] = state.tableFilters[tableKey] || {};
    const filters = state.tableFilters[tableKey];
    const headers = Array.from(headRow.children);

    headers.forEach((th, index) => {
      const label = th.textContent || "";
      th.classList.add("sortable");
      th.textContent = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-sort";
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      const sortState = state.tableSort[tableKey];
      if (sortState?.key === String(index)) {
        indicator.textContent = sortState.dir === "desc" ? "▼" : "▲";
      }
      btn.append(document.createTextNode(label), indicator);
      btn.addEventListener("click", () => {
        const current = state.tableSort[tableKey];
        const nextDir =
          current && current.key === String(index) && current.dir === "asc" ? "desc" : "asc";
        state.tableSort[tableKey] = { key: String(index), dir: nextDir };
        applyGroupedSortFilter();
      });
      th.appendChild(btn);
    });

    const filterRow = document.createElement("tr");
    filterRow.className = "filter-row";
    headers.forEach((_, index) => {
      const th = document.createElement("th");
      const input = document.createElement("input");
      input.type = "search";
      input.className = "column-filter";
      input.placeholder = "Buscar";
      input.value = filters[index] || "";
      input.addEventListener("input", () => {
        filters[index] = input.value;
        applyGroupedSortFilter();
      });
      th.appendChild(input);
      filterRow.appendChild(th);
    });
    thead.appendChild(filterRow);

    const applyGroupedSortFilter = () => {
      const tbody = table.querySelector("tbody");
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const groups = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row.classList.contains("session-row")) continue;
        const detail = rows[i + 1] && rows[i + 1].classList.contains("session-detail")
          ? rows[i + 1]
          : null;
        groups.push({ main: row, detail });
        if (detail) i += 1;
      }
      const sortState = state.tableSort[tableKey];
      const getCellText = (row, idx) =>
        String(row.children[idx]?.textContent ?? "")
          .trim()
          .toLowerCase();
      const matchGroup = (group) =>
        headers.every((_, idx) => {
          const filterValue = String(filters[idx] || "").trim().toLowerCase();
          if (!filterValue) return true;
          return getCellText(group.main, idx).includes(filterValue);
        });
      if (sortState?.key != null) {
        const colIndex = Number(sortState.key);
        groups.sort((a, b) => {
          const aVal = getCellText(a.main, colIndex);
          const bVal = getCellText(b.main, colIndex);
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          let result = 0;
          if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
            result = aNum - bNum;
          } else {
            result = aVal.localeCompare(bVal, "es", { numeric: true, sensitivity: "base" });
          }
          return sortState.dir === "desc" ? -result : result;
        });
      }
      const detailState = new Map();
      groups.forEach((group) => {
        if (group.detail) {
          detailState.set(group.detail, group.detail.hidden);
        }
      });
      groups.forEach((group) => {
        tbody.appendChild(group.main);
        if (group.detail) tbody.appendChild(group.detail);
      });
      groups.forEach((group) => {
        const matches = matchGroup(group);
        group.main.hidden = !matches;
        if (group.detail) {
          group.detail.hidden = matches ? detailState.get(group.detail) ?? true : true;
        }
      });
    };

    applyGroupedSortFilter();
  }

  function getDailySprints(base) {
    return state.selectedCelulaId
      ? base.sprints.filter((sprint) => String(sprint.celula_id) === state.selectedCelulaId)
      : base.sprints;
  }

  function renderDailyItemsSummary(container, count) {
    if (!container) return;
    container.textContent = count ? `Mostrando ${count} items` : "Sin items cargados.";
  }

  function applyHeatmapClasses(rows, keys, options = {}) {
    const reversed = new Set(options.reverse || []);
    const ranges = {};
    keys.forEach((key) => {
      const values = rows
        .map((row) => Number(row[key]))
        .filter((value) => Number.isFinite(value));
      if (!values.length) return;
      const min = Math.min(...values);
      const max = Math.max(...values);
      ranges[key] = { min, max };
    });
    rows.forEach((row) => {
      keys.forEach((key) => {
        const value = Number(row[key]);
        if (!Number.isFinite(value) || !ranges[key]) return;
        const { min, max } = ranges[key];
        let klass = "heat-mid";
        if (max === min) {
          klass = "heat-mid";
        } else if (value === max) {
          klass = reversed.has(key) ? "heat-low" : "heat-high";
        } else if (value === min) {
          klass = reversed.has(key) ? "heat-high" : "heat-low";
        }
        if (!row._cellClasses) row._cellClasses = {};
        row._cellClasses[key] = klass;
      });
    });
  }

  function getPreviousSprint(sprints, current) {
    if (!current) return null;
    const ordered = [...sprints].filter((sprint) => sprint.fecha_inicio);
    ordered.sort(
      (a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio)
    );
    const index = ordered.findIndex(
      (sprint) => String(sprint.id) === String(current.id)
    );
    if (index > 0) return ordered[index - 1];
    return null;
  }

  function buildPersonaLookup(personas = []) {
    const map = new Map();
    personas.forEach((persona) => {
      const fullName = normalizeText(`${persona.nombre} ${persona.apellido}`.trim());
      if (fullName) map.set(fullName, persona.id);
      const compactName = fullName.replace(/\s+/g, "");
      if (compactName) map.set(compactName, persona.id);
      const jira = normalizeText(persona.jira_usuario || "");
      if (jira) map.set(jira, persona.id);
      const compactJira = jira.replace(/\s+/g, "");
      if (compactJira) map.set(compactJira, persona.id);
    });
    return map;
  }

  function resolvePersonaIdFromItem(item, lookup) {
    if (!item) return null;
    if (item.persona_id) return item.persona_id;
    if (!lookup) return null;
    const key = normalizeText(item.assignee_nombre || "");
    if (!key) return null;
    return lookup.get(key) || lookup.get(key.replace(/\s+/g, "")) || null;
  }

  function resolvePersonaNameFromItem(item, personaLookup, personaMap) {
    const resolvedId = resolvePersonaIdFromItem(item, personaLookup);
    if (resolvedId && personaMap && personaMap[resolvedId]) return personaMap[resolvedId];
    return item?.assignee_nombre || "";
  }

  const STORY_POINTS_REF_DAYS = new Map([
    [1, 1],
    [2, 1],
    [3, 2],
    [5, 5],
    [8, 8],
    [13, 10],
  ]);

  function renderStorypointsKpi(itemsList, container, feriadosSet, selectedPoints) {
    if (!container) return;
    container.innerHTML = "";
    const totalsByPoints = new Map();
    itemsList.forEach((item) => {
      if (!item.start_date) return;
      const points = Number(item.story_points);
      if (!Number.isFinite(points) || points <= 0) return;
      const endValue = item.end_date || formatISO(getToday());
      const totalDays = countWeekdays(item.start_date, endValue, feriadosSet);
      if (!Number.isFinite(totalDays)) return;
      const current = totalsByPoints.get(points) || { sum: 0, count: 0 };
      current.sum += totalDays;
      current.count += 1;
      totalsByPoints.set(points, current);
    });
    const orderedPoints = Array.from(totalsByPoints.keys()).sort((a, b) => a - b);
    if (!orderedPoints.length) {
      const empty = document.createElement("div");
      empty.className = "alert alert-secondary mb-0";
      empty.textContent = "Sin datos";
      container.appendChild(empty);
      return;
    }
    orderedPoints.forEach((points) => {
      const { sum, count } = totalsByPoints.get(points);
      const avg = count ? sum / count : 0;
      const value = Number.isFinite(avg) ? avg.toFixed(1).replace(/\.0$/, "") : "0";
      const expected = STORY_POINTS_REF_DAYS.get(points);
      let tone = "secondary";
      if (expected != null) {
        const diff = avg - expected;
        if (diff <= 0) tone = "success";
        else if (diff <= 1) tone = "warning";
        else tone = "danger";
      }
      const alert = document.createElement("div");
      alert.className = `alert alert-${tone} d-flex justify-content-between align-items-center py-2 mb-2`;
      alert.dataset.points = String(points);
      alert.style.cursor = "pointer";
      if (selectedPoints != null && Number(selectedPoints) === Number(points)) {
        alert.classList.add("border", "border-dark");
      }
      const left = document.createElement("div");
      left.className = "d-flex align-items-center gap-2";
      const flag = document.createElement("span");
      flag.textContent = "⚑";
      flag.style.fontSize = "1rem";
      flag.style.color =
        tone === "success" ? "#28a745" : tone === "warning" ? "#f0ad4e" : tone === "danger" ? "#dc3545" : "#6c757d";
      const label = document.createElement("strong");
      label.textContent = `${points} Pts`;
      left.appendChild(flag);
      left.appendChild(label);
      const right = document.createElement("span");
      right.textContent = `${value} dias`;
      alert.appendChild(left);
      alert.appendChild(right);
      container.appendChild(alert);
    });
  }

  function customizeNavbar(user) {
    const header = document.querySelector(".app-header");
    if (!header) return;
    const hideByText = new Set(["Home", "Contact"]);
    header.querySelectorAll(".navbar-nav a.nav-link").forEach((link) => {
      const text = link.textContent?.trim();
      if (text && hideByText.has(text)) {
        const item = link.closest(".nav-item");
        if (item) {
          item.dataset.scrumiaHidden = "true";
          item.remove();
        } else {
          link.dataset.scrumiaHidden = "true";
          link.remove();
        }
      }
    });
    const searchToggle = header.querySelector('[data-widget="navbar-search"]');
    searchToggle?.closest(".nav-item")?.classList.add("d-none");
    header.querySelector(".navbar-search-block")?.classList.add("d-none");
    const chatItem = header.querySelector(".bi-chat-text")?.closest(".nav-item");
    chatItem?.classList.add("d-none");
    const bellItem = header.querySelector(".bi-bell-fill")?.closest(".nav-item");
    bellItem?.classList.add("d-none");
    header.querySelectorAll(".navbar-badge").forEach((badge) => badge.classList.add("d-none"));

    const displayName = user?.username || "Admin";
    const menu = header.querySelector(".user-menu");
    const nameSpan = menu?.querySelector(".nav-link span");
    if (nameSpan) nameSpan.textContent = displayName;
    const headerText = menu?.querySelector(".user-header p");
    if (headerText) {
      headerText.innerHTML = `${displayName}<small>ScrumIA</small>`;
    }
    menu?.querySelectorAll("img").forEach((img) => {
      const parent = img.parentElement;
      if (parent && !parent.querySelector(".user-avatar-placeholder")) {
        const placeholder = document.createElement("span");
        placeholder.className = "user-avatar-placeholder";
        placeholder.style.display = "inline-block";
        placeholder.style.width = "32px";
        placeholder.style.height = "32px";
        placeholder.style.borderRadius = "50%";
        placeholder.style.backgroundColor = "#bfc5cd";
        placeholder.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.15)";
        placeholder.style.verticalAlign = "middle";
        parent.insertBefore(placeholder, img);
      }
      img.remove();
    });
    if (!document.getElementById("scrumia-navbar-hide")) {
      const style = document.createElement("style");
      style.id = "scrumia-navbar-hide";
      style.textContent =
        "[data-scrumia-hidden=\"true\"]{display:none !important;}" +
        ".app-header .navbar-nav .nav-item.d-none.d-md-block{display:none !important;}" +
        ".app-header .user-menu img{display:none !important;}" +
        ".user-avatar-placeholder{background:#bfc5cd !important;}";
      document.head.appendChild(style);
    }
  }

  function buildSprintItemStats(items, personaLookup) {
    const byPersona = new Map();
    const byName = new Map();
    const ensureStats = (map, key, name) => {
      if (!map.has(key)) {
        map.set(key, {
          nombre: name,
          totalTareas: 0,
          totalPoints: 0,
          donePoints: 0,
        });
      }
      return map.get(key);
    };
    items.forEach((item) => {
      const points = item.story_points ? Number(item.story_points) : 0;
      const done = isDoneStatus(item.status);
      const resolvedId = resolvePersonaIdFromItem(item, personaLookup);
      if (resolvedId) {
        const stats = ensureStats(byPersona, resolvedId, "");
        stats.totalTareas += 1;
        stats.totalPoints += points;
        if (done) stats.donePoints += points;
      } else {
        const name = item.assignee_nombre || "Sin asignar";
        const key = normalizeText(name);
        const stats = ensureStats(byName, key, name);
        stats.totalTareas += 1;
        stats.totalPoints += points;
        if (done) stats.donePoints += points;
      }
    });
    return { byPersona, byName };
  }

  function getTrend(current, previous) {
    const currentNum = Number(current);
    const prevNum = Number(previous);
    if (!Number.isFinite(prevNum) || !Number.isFinite(currentNum)) {
      return { arrow: "=", className: "trend-none" };
    }
    if (currentNum > prevNum) return { arrow: "↑", className: "trend-up" };
    if (currentNum < prevNum) return { arrow: "↓", className: "trend-down" };
    return { arrow: "=", className: "trend-eq" };
  }

  async function getSprintCapacity(sprintId) {
    if (!sprintId) return null;
    const cacheKey = String(sprintId);
    if (state.dailyCapacityCache[cacheKey]) {
      return state.dailyCapacityCache[cacheKey];
    }
    try {
      const data = await fetchJson(`/sprints/${sprintId}/capacidad`);
      state.dailyCapacityCache[cacheKey] = data;
      return data;
    } catch {
      return null;
    }
  }

  async function renderDaily(base) {
    const panel = qs("#daily-panel");
    if (!panel || !base) return;
    const sprintSelect = qs("#daily-sprint-select");
    const sprintFilter = qs("#daily-sprint-filter");
    const sprintTrigger = qs("#daily-sprint-trigger");
    const sprintPanel = qs("#daily-sprint-panel");
    const sprintSelected = qs("#daily-sprint-selected");
    const sprintLabel = qs("#daily-sprint-label");
    const teamSprintLabel = qs("#daily-team-sprint");
    const itemsSprintLabel = qs("#daily-items-sprint");
    const statusFilter = qs("#daily-status-filter");
    const remainingEl = qs("#daily-remaining-days");
    let statusChart = qs("#daily-status-chart");
    const devTable = qs("#daily-dev-table");
    const itemsTable = qs("#daily-items-table");
    const itemsCount = qs("#daily-items-count");
    const form = qs("#daily-form");
    const status = qs("#daily-status");
    const storypointsKpi = qs("#daily-kpi-storypoints");

    const sprints = getDailySprints(base);
    if (!sprints.length) {
      if (sprintSelect) sprintSelect.innerHTML = "";
      if (remainingEl) remainingEl.textContent = "-";
      if (sprintLabel) sprintLabel.textContent = "Sin sprint";
      if (teamSprintLabel) teamSprintLabel.textContent = "-";
      if (itemsSprintLabel) itemsSprintLabel.textContent = "-";
      renderDailyItemsSummary(itemsCount, 0);
      if (devTable) devTable.innerHTML = '<p class="empty">Sin datos</p>';
      if (itemsTable) itemsTable.innerHTML = '<p class="empty">Sin items cargados.</p>';
      if (status) status.textContent = "";
      return;
    }

    const activeSprint = getActiveSprint(sprints) || sprints[0];
    let selectedSprint = state.selectedSprintId
      ? sprints.find((sprint) => String(sprint.id) === state.selectedSprintId)
      : null;
    if (!selectedSprint) {
      selectedSprint = activeSprint;
      state.selectedSprintId = selectedSprint ? String(selectedSprint.id) : "";
    }

    const orderedSprints = selectedSprint
      ? [selectedSprint, ...sprints.filter((sprint) => String(sprint.id) !== String(selectedSprint.id))]
      : sprints;

    if (sprintSelect) {
      fillSelect(sprintSelect, orderedSprints);
      if (selectedSprint) {
        sprintSelect.value = String(selectedSprint.id);
      }
    }
    if (!sprintSelect && sprintPanel) {
      sprintPanel.innerHTML = "";
      orderedSprints.forEach((sprint) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "status-filter-option";
        btn.textContent = sprint.nombre;
        if (selectedSprint && String(sprint.id) === String(selectedSprint.id)) {
          btn.classList.add("is-selected");
        }
        btn.addEventListener("click", () => {
          state.selectedSprintId = String(sprint.id);
          state.dailySelectedPersonaId = "";
          state.dailySelectedAssignee = "";
          state.dailyStatusFilters = [];
          state.dailyStoryPointsFilter = null;
          state.dailyStatusOpen = false;
          state.dailyStatusTouched = false;
          state.dailySprintOpen = false;
          renderDaily(state.base);
        });
        sprintPanel.appendChild(btn);
      });
    }
    if (sprintFilter) {
      sprintFilter.classList.toggle("open", state.dailySprintOpen);
    }
    if (sprintSelected) {
      sprintSelected.textContent = selectedSprint?.nombre || "-";
    }

    const sprintRange =
      selectedSprint?.fecha_inicio && selectedSprint?.fecha_fin
        ? `${formatDate(selectedSprint.fecha_inicio)} - ${formatDate(selectedSprint.fecha_fin)}`
        : "";
    const sprintLabelText = selectedSprint
      ? sprintRange
        ? `${selectedSprint.nombre} · ${sprintRange}`
        : selectedSprint.nombre
      : "-";
    if (sprintLabel) sprintLabel.textContent = sprintLabelText;
    if (teamSprintLabel) teamSprintLabel.textContent = selectedSprint?.nombre || "-";
    if (itemsSprintLabel) itemsSprintLabel.textContent = selectedSprint?.nombre || "-";

    const feriadosFiltrados = state.selectedCelulaId
      ? (base.feriados || []).filter(
          (feriado) =>
            !feriado.celula_id || String(feriado.celula_id) === state.selectedCelulaId
        )
      : base.feriados || [];
    const feriadosSet = new Set(
      feriadosFiltrados.map((feriado) => feriado.fecha).filter(Boolean)
    );
    const remainingInfo = getSprintRemainingDays(selectedSprint, feriadosFiltrados);
    if (remainingEl) {
      remainingEl.textContent = formatDaysValue(remainingInfo.remaining);
      let color = "#39ff14";
      if (remainingInfo.ratio <= 0.25) {
        color = "#ff4b4b";
      } else if (remainingInfo.ratio <= 0.55) {
        color = "#ffc857";
      }
      remainingEl.style.color = color;
      const label = panel.querySelector(".remaining-label");
      if (label) label.style.color = color;
    }

    const ensureStatusCard = () => {
      if (statusChart || !remainingEl) return;
      const parentCard = remainingEl.closest(".card") || remainingEl.closest(".chart-card");
      if (!parentCard) return;
      const column = parentCard.parentElement;
      if (column) {
        column.classList.add("daily-left-stack");
      }
      const card = document.createElement("div");
      card.className = "card daily-card daily-status-card";
      card.innerHTML = `
        <div class="card-body">
          <h3 class="card-title">Estados de items</h3>
          <div class="daily-donut" id="daily-status-chart">
            <div class="donut"></div>
            <ul class="legend"></ul>
          </div>
        </div>
      `;
      parentCard.insertAdjacentElement("afterend", card);
      statusChart = card.querySelector("#daily-status-chart");
    };

    const getTotalDaysValue = (row) => {
      if (!row.start_date) return "";
      const endValue = row.end_date || formatISO(getToday());
      return countWeekdays(row.start_date, endValue, feriadosSet);
    };

    const getDiasCompValue = (row) => {
      const todayKey = formatISO(getToday());
      if (!row.due_date) return "";
      if (!row.end_date) {
        if (row.due_date === todayKey) {
          return 0;
        }
        if (row.due_date > todayKey) {
          return countWeekdays(todayKey, row.due_date, feriadosSet) - 1;
        }
        return -(countWeekdays(row.due_date, todayKey, feriadosSet) - 1);
      }
      if (row.due_date === row.end_date) {
        return 0;
      }
      if (row.due_date > row.end_date) {
        return countWeekdays(row.end_date, row.due_date, feriadosSet) - 1;
      }
      return -(countWeekdays(row.due_date, row.end_date, feriadosSet) - 1);
    };

    const buildTotalDaysCell = (row) => {
      const total = getTotalDaysValue(row);
      if (total === "") return "";
      const points = Number(row.story_points);
      const expected = Number.isFinite(points) ? STORY_POINTS_REF_DAYS.get(points) : null;
      const ok = expected != null ? expected >= total : null;
      const wrap = document.createElement("span");
      wrap.className = "status-pill";
      if (ok === true) {
        wrap.classList.add("status-ok");
      } else if (ok === false) {
        wrap.classList.add("status-danger");
      } else {
        wrap.classList.add("status-muted");
      }
      wrap.textContent = String(total);
      if (ok !== null) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.classList.add("ref-flag");
        svg.classList.add(ok ? "ok" : "bad");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M5 4h2v16H5z M7 4h10l-2 4 2 4H7z");
        svg.appendChild(path);
        svg.setAttribute("aria-label", ok ? "Ref ok" : "Ref fuera");
        svg.setAttribute("role", "img");
        wrap.appendChild(svg);
      }
      return wrap;
    };

    const buildDiasComp = (row) => {
      const value = getDiasCompValue(row);
      if (value === "") {
        return { text: "—", className: "status-pill status-danger" };
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return { text: String(value), className: "status-pill status-danger" };
      }
      if (numeric === 0) {
        return { text: "0", className: "status-pill status-warn" };
      }
      if (numeric > 0) {
        return { text: String(numeric), className: "status-pill status-ok" };
      }
      return { text: String(numeric), className: "status-pill status-danger" };
    };

    const personasActivas = filterActivePersonas(base.personas || []);
    const personasFiltradas = state.selectedCelulaId
      ? personasActivas.filter((persona) =>
          (persona.celulas || []).some(
            (celula) => String(celula.id) === state.selectedCelulaId
          )
        )
      : personasActivas;
    const personaLookup = buildPersonaLookup(personasFiltradas);
    const activePersonaIds = new Set(personasActivas.map((persona) => persona.id));
    const shouldFilterByPersona = activePersonaIds.size > 0;
    const itemsAll = base.sprintItems.filter((item) => {
      if (state.selectedCelulaId && String(item.celula_id) !== state.selectedCelulaId) {
        return false;
      }
      if (item.persona_id && shouldFilterByPersona && !activePersonaIds.has(item.persona_id)) {
        return false;
      }
      return selectedSprint
        ? String(item.sprint_id) === String(selectedSprint.id)
        : true;
    });
    const renderStorypointsKpiCard = (itemsList) =>
      renderStorypointsKpi(
        itemsList,
        storypointsKpi,
        feriadosSet,
        state.dailyStoryPointsFilter
      );

    ensureStatusCard();
    if (statusChart) {
      const counts = new Map();
      itemsAll.forEach((item) => {
        const label = getStatusLabel(item.status) || "Sin estado";
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      const preferredOrder = [
        "In Progress",
        "Finalizada",
        "To Do",
        "Backlog",
        "Cancelada",
        "Sin estado",
      ];
      const ordered = [
        ...preferredOrder.filter((label) => counts.has(label)),
        ...Array.from(counts.keys())
          .filter((label) => !preferredOrder.includes(label))
          .sort((a, b) => a.localeCompare(b, "es")),
      ];
      const colorMap = {
        "In Progress": "#ffc857",
        Finalizada: "#39ff14",
        "To Do": "#4ba3ff",
        Backlog: "#9aa6b2",
        Cancelada: "#ff4b4b",
        "Sin estado": "#6c757d",
      };
      const values = ordered.map((label) => counts.get(label) || 0);
      const colors = ordered.map((label) => colorMap[label] || "#4ba3ff");
      renderPie(
        statusChart,
        {
          labels: ordered,
          values,
          colors,
        },
        "donut"
      );
    }

    if (statusFilter) {
      const statusSet = new Set(
        itemsAll.map((item) => getStatusLabel(item.status)).filter(Boolean)
      );
      (state.dailyStatusFilters || []).forEach((value) => {
        if (value) statusSet.add(value);
      });
      const statusOptions = Array.from(statusSet).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      );
      if (!state.dailyStatusTouched && !state.dailyStatusFilters.length && statusOptions.length) {
        state.dailyStatusFilters = [...statusOptions];
      }
      statusFilter.innerHTML = "";
      const wrapper = document.createElement("div");
      wrapper.className = "status-filter";
      if (state.dailyStatusOpen) {
        wrapper.classList.add("open");
      }
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "status-filter-trigger";
      const selectedLabels = (state.dailyStatusFilters || []).filter(Boolean);
      const triggerText = selectedLabels.length
        ? selectedLabels.join(", ")
        : "Todos";
      trigger.innerHTML = `<span>${triggerText}</span><span class="status-filter-caret">▾</span>`;
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        state.dailyStatusOpen = !state.dailyStatusOpen;
        renderDaily(state.base);
      });
      const panel = document.createElement("div");
      panel.className = "status-filter-panel";
      panel.addEventListener("click", (event) => event.stopPropagation());
      if (!statusOptions.length) {
        panel.innerHTML = '<span class="empty">Sin estados</span>';
      } else {
        statusOptions.forEach((status) => {
          const label = document.createElement("label");
          label.className = "status-filter-option";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = status;
          input.checked = (state.dailyStatusFilters || []).includes(status);
          input.addEventListener("change", () => {
            const selected = new Set(state.dailyStatusFilters || []);
            if (input.checked) {
              selected.add(status);
            } else {
              selected.delete(status);
            }
            state.dailyStatusFilters = Array.from(selected);
            state.dailyStatusOpen = true;
            state.dailyStatusTouched = true;
            renderDaily(state.base);
          });
          const text = document.createElement("span");
          text.textContent = status;
          label.appendChild(input);
          label.appendChild(text);
          panel.appendChild(label);
        });
      }
      wrapper.appendChild(trigger);
      wrapper.appendChild(panel);
      statusFilter.appendChild(wrapper);
    }
    let items = itemsAll;
    if (state.dailyStatusFilters && state.dailyStatusFilters.length) {
      const target = new Set(state.dailyStatusFilters.map((value) => normalizeText(value)));
      items = items.filter((item) => target.has(normalizeText(getStatusLabel(item.status))));
    }
    const selectedPersonaId = state.dailySelectedPersonaId;
    const selectedAssignee = state.dailySelectedAssignee;
    if (selectedPersonaId) {
      items = items.filter(
        (item) =>
          String(resolvePersonaIdFromItem(item, personaLookup) || "") ===
          String(selectedPersonaId)
      );
    } else if (selectedAssignee) {
      const target = normalizeText(selectedAssignee);
      items = items.filter((item) => normalizeText(item.assignee_nombre) === target);
    }
    if (state.dailyStoryPointsFilter != null) {
      const targetPoints = Number(state.dailyStoryPointsFilter);
      items = items.filter((item) => Number(item.story_points) === targetPoints);
    }
    renderDailyItemsSummary(itemsCount, items.length);
    renderStorypointsKpiCard(items);

    if (storypointsKpi && !storypointsKpi.dataset.bound) {
      storypointsKpi.dataset.bound = "true";
      storypointsKpi.addEventListener("click", (event) => {
        const card = event.target.closest?.(".alert[data-points]");
        if (!card) return;
        const points = Number(card.dataset.points);
        if (!Number.isFinite(points)) return;
        if (state.dailyStoryPointsFilter === points) {
          state.dailyStoryPointsFilter = null;
        } else {
          state.dailyStoryPointsFilter = points;
        }
        renderDaily(state.base);
      });
    }

    const previousSprint = getPreviousSprint(sprints, selectedSprint);
    const previousSprint2 = getPreviousSprint(sprints, previousSprint);
    const sprintInfoById = new Map(
      sprints.map((sprint) => [
        sprint.id,
        {
          id: sprint.id,
          nombre: sprint.nombre,
          rank: getSprintRank(sprint.nombre),
          start: parseDateOnly(sprint.fecha_inicio),
        },
      ])
    );
    const issueSprintMap = new Map();
    base.sprintItems
      .filter((item) =>
        state.selectedCelulaId ? String(item.celula_id) === state.selectedCelulaId : true
      )
      .forEach((item) => {
        const issueKey = normalizeText(item.issue_key);
        if (!issueKey) return;
        const sprintInfo = sprintInfoById.get(item.sprint_id);
        if (!sprintInfo) return;
        const list = issueSprintMap.get(issueKey) || [];
        if (!list.some((entry) => entry.id === sprintInfo.id)) {
          list.push(sprintInfo);
          issueSprintMap.set(issueKey, list);
        }
      });
    const getPreviousSprintNames = (row) => {
      if (!selectedSprint) return "";
      const issueKey = normalizeText(row.issue_key);
      if (!issueKey) return "";
      const currentInfo = sprintInfoById.get(selectedSprint.id);
      const list = (issueSprintMap.get(issueKey) || []).filter(
        (entry) => entry.id !== currentInfo?.id
      );
      if (!list.length) return "";
      let previous = list;
      if (currentInfo?.rank != null) {
        previous = previous.filter((entry) => entry.rank != null && entry.rank < currentInfo.rank);
      } else if (currentInfo?.start) {
        previous = previous.filter((entry) => entry.start && entry.start < currentInfo.start);
      }
      if (!previous.length) return "";
      previous.sort((a, b) => {
        if (a.rank != null && b.rank != null) return b.rank - a.rank;
        if (a.start && b.start) return b.start - a.start;
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });
      return previous.map((entry) => entry.nombre).join(", ");
    };
    const getSprintCarryCount = (row) => {
      if (!selectedSprint) return 0;
      const issueKey = normalizeText(row.issue_key);
      if (!issueKey) return 0;
      const currentInfo = sprintInfoById.get(selectedSprint.id);
      const list = issueSprintMap.get(issueKey) || [];
      if (!list.length) return 0;
      if (currentInfo?.rank != null) {
        return list.filter((entry) => entry.rank != null && entry.rank <= currentInfo.rank).length;
      }
      if (currentInfo?.start) {
        return list.filter((entry) => entry.start && entry.start <= currentInfo.start).length;
      }
      return list.length;
    };
    const buildSprintIndicator = (row) => {
      const count = Math.max(1, getSprintCarryCount(row));
      const dots = Math.min(count, 3);
      const tone = count <= 1 ? "ok" : count === 2 ? "warn" : "risk";
      const wrap = document.createElement("div");
      wrap.className = "sprint-indicator";
      for (let i = 0; i < dots; i += 1) {
        const dot = document.createElement("span");
        dot.className = `sprint-dot ${tone}`;
        wrap.appendChild(dot);
      }
      return { node: wrap, count };
    };

    const kpi1El = qs("#daily-kpi-1");
    const kpi1ExpectedEl = qs("#daily-kpi-1-expected");
    const kpi2El = qs("#daily-kpi-2");
    const kpi3El = qs("#daily-kpi-3");
    const kpi4El = qs("#daily-kpi-4");
    const buildFlagHTML = (tone) =>
      `<svg class="ref-flag ${tone}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h2v16H5z M7 4h10l-2 4 2 4H7z"></path></svg>`;
    if (selectedSprint) {
      const pointsTotal = itemsAll.reduce((sum, item) => {
        const value = Number(item.story_points);
        return Number.isFinite(value) && value > 0 ? sum + value : sum;
      }, 0);
      const pointsDone = itemsAll.reduce((sum, item) => {
        if (!isDoneStatus(item.status)) return sum;
        const value = Number(item.story_points);
        return Number.isFinite(value) && value > 0 ? sum + value : sum;
      }, 0);
      const advancePct = pointsTotal ? (pointsDone / pointsTotal) * 100 : 0;
      const advanceDisplay = Number(advancePct.toFixed(0));
      const expectedPct = remainingInfo.total
        ? ((remainingInfo.total - remainingInfo.remaining) / remainingInfo.total) * 100
        : 0;
      const expectedDisplay = Number(expectedPct.toFixed(0));
      if (kpi1El) {
        kpi1El.textContent = `${advanceDisplay}%`;
        kpi1El.classList.remove("kpi-ok", "kpi-warn", "kpi-bad");
        if (advanceDisplay < expectedDisplay) {
          kpi1El.classList.add("kpi-bad");
        } else if (advanceDisplay === expectedDisplay) {
          kpi1El.classList.add("kpi-warn");
        } else {
          kpi1El.classList.add("kpi-ok");
        }
      }
      if (kpi1ExpectedEl) kpi1ExpectedEl.textContent = `${expectedDisplay}%`;

      let sprintNow = 0;
      let sprintPrev1 = 0;
      let sprintPrev2 = 0;
      itemsAll.forEach((item) => {
        const carry = getSprintCarryCount(item);
        if (carry <= 1) {
          sprintNow += 1;
        } else if (carry === 2) {
          sprintPrev1 += 1;
        } else {
          sprintPrev2 += 1;
        }
      });
      if (kpi2El) {
        kpi2El.innerHTML = `Sprint actual: ${sprintNow}<br>Sprint anterior -1: ${sprintPrev1}<br>Sprint anterior -2: ${sprintPrev2}`;
      }

      let inRange = 0;
      let outRange = 0;
      itemsAll.forEach((item) => {
        const total = getTotalDaysValue(item);
        if (total === "") return;
        const points = Number(item.story_points);
        const expected = Number.isFinite(points) ? STORY_POINTS_REF_DAYS.get(points) : null;
        if (expected == null) return;
        if (expected >= total) {
          inRange += 1;
        } else {
          outRange += 1;
        }
      });
      if (kpi3El) {
        kpi3El.innerHTML = `${buildFlagHTML("ok")} ${inRange} <span class="kpi-divider">·</span> ${buildFlagHTML("bad")} ${outRange}`;
      }

      let compIn = 0;
      let compOut = 0;
      itemsAll.forEach((item) => {
        const value = getDiasCompValue(item);
        if (value === "") return;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return;
        if (numeric >= 0) {
          compIn += 1;
        } else {
          compOut += 1;
        }
      });
      if (kpi4El) {
        kpi4El.innerHTML = `${buildFlagHTML("ok")} ${compIn} <span class="kpi-divider">·</span> ${buildFlagHTML("bad")} ${compOut}`;
      }
    } else {
      if (kpi1El) {
        kpi1El.textContent = "—%";
        kpi1El.classList.remove("kpi-ok", "kpi-warn", "kpi-bad");
      }
      if (kpi1ExpectedEl) kpi1ExpectedEl.textContent = "—%";
      if (kpi2El) kpi2El.textContent = "—";
      if (kpi3El) kpi3El.textContent = "—";
      if (kpi4El) kpi4El.textContent = "—";
    }
    const previousItems = previousSprint
      ? base.sprintItems.filter((item) => {
          if (state.selectedCelulaId && String(item.celula_id) !== state.selectedCelulaId) {
            return false;
          }
          if (item.persona_id && shouldFilterByPersona && !activePersonaIds.has(item.persona_id)) {
            return false;
          }
          return String(item.sprint_id) === String(previousSprint.id);
        })
      : [];
    const previousItems2 = previousSprint2
      ? base.sprintItems.filter((item) => {
          if (state.selectedCelulaId && String(item.celula_id) !== state.selectedCelulaId) {
            return false;
          }
          if (item.persona_id && shouldFilterByPersona && !activePersonaIds.has(item.persona_id)) {
            return false;
          }
          return String(item.sprint_id) === String(previousSprint2.id);
        })
      : [];

    const capacidad = selectedSprint
      ? await getSprintCapacity(selectedSprint.id)
      : null;
    const prevCapacidad = previousSprint
      ? await getSprintCapacity(previousSprint.id)
      : null;
    const prevCapacidad2 = previousSprint2
      ? await getSprintCapacity(previousSprint2.id)
      : null;

    const personaMap = Object.fromEntries(
      personasActivas.map((persona) => [persona.id, `${persona.nombre} ${persona.apellido}`])
    );
    const capacityByPersona = new Map(
      (capacidad?.detalle_por_persona || []).map((entry) => [entry.persona_id, entry.porcentaje])
    );
    const prevCapacityByPersona = new Map(
      (prevCapacidad?.detalle_por_persona || []).map((entry) => [entry.persona_id, entry.porcentaje])
    );
    const prevCapacityByPersona2 = new Map(
      (prevCapacidad2?.detalle_por_persona || []).map((entry) => [entry.persona_id, entry.porcentaje])
    );

    const currentStats = buildSprintItemStats(itemsAll, personaLookup);
    const previousStats = buildSprintItemStats(previousItems, personaLookup);
    const previousStats2 = buildSprintItemStats(previousItems2, personaLookup);

    const buildTrendSet = (current, prev1, prev2) => ({
      one: getTrend(current, prev1),
      two: getTrend(current, prev2),
    });

    const teamRows = personasFiltradas.map((persona) => {
      const stats = currentStats.byPersona.get(persona.id) || {
        totalTareas: 0,
        totalPoints: 0,
        donePoints: 0,
      };
      const prevStats = previousStats.byPersona.get(persona.id) || {
        totalTareas: 0,
        totalPoints: 0,
        donePoints: 0,
      };
      const prevStats2 = previousStats2.byPersona.get(persona.id) || {
        totalTareas: 0,
        totalPoints: 0,
        donePoints: 0,
      };
      const pendingPoints = stats.totalPoints - stats.donePoints;
      const avance =
        stats.totalPoints > 0 ? (stats.donePoints / stats.totalPoints) * 100 : 0;
      const prevPending = prevStats.totalPoints - prevStats.donePoints;
      const prevAvance =
        prevStats.totalPoints > 0 ? (prevStats.donePoints / prevStats.totalPoints) * 100 : 0;
      const prevPending2 = prevStats2.totalPoints - prevStats2.donePoints;
      const prevAvance2 =
        prevStats2.totalPoints > 0 ? (prevStats2.donePoints / prevStats2.totalPoints) * 100 : 0;
      const trend = {
        capacidad: buildTrendSet(
          capacityByPersona.get(persona.id) ?? 0,
          prevCapacityByPersona.get(persona.id),
          prevCapacityByPersona2.get(persona.id)
        ),
        totalTareas: buildTrendSet(
          stats.totalTareas,
          prevStats.totalTareas,
          prevStats2.totalTareas
        ),
        totalStoryPoints: buildTrendSet(
          stats.totalPoints,
          prevStats.totalPoints,
          prevStats2.totalPoints
        ),
        totalHechos: buildTrendSet(
          stats.donePoints,
          prevStats.donePoints,
          prevStats2.donePoints
        ),
        totalPendientes: buildTrendSet(pendingPoints, prevPending, prevPending2),
        avance: buildTrendSet(avance, prevAvance, prevAvance2),
      };
      const isSelected = String(persona.id) === String(state.dailySelectedPersonaId);
      const rol = String(persona.rol || "").trim().toLowerCase();
      const isDev = rol !== "sm" && rol !== "po";
      return {
        usuario: `${persona.nombre} ${persona.apellido}`,
        capacidad: capacityByPersona.has(persona.id)
          ? capacityByPersona.get(persona.id)
          : null,
        totalTareas: stats.totalTareas,
        totalStoryPoints: stats.totalPoints,
        totalHechos: stats.donePoints,
        totalPendientes: pendingPoints,
        avance,
        _trend: trend,
        _rowClass: isSelected ? "is-selected" : "",
        _isDev: isDev,
        _rowClick: () => {
          if (state.dailySelectedPersonaId === String(persona.id)) {
            state.dailySelectedPersonaId = "";
            state.dailySelectedAssignee = "";
          } else {
            state.dailySelectedPersonaId = String(persona.id);
            state.dailySelectedAssignee = "";
          }
          renderDaily(state.base);
        },
      };
    });

    Array.from(currentStats.byName.values()).forEach((stats) => {
      const pendingPoints = stats.totalPoints - stats.donePoints;
      const avance =
        stats.totalPoints > 0 ? (stats.donePoints / stats.totalPoints) * 100 : 0;
      const key = normalizeText(stats.nombre);
      const prevStats = previousStats.byName.get(key) || {
        totalTareas: 0,
        totalPoints: 0,
        donePoints: 0,
      };
      const prevStats2 = previousStats2.byName.get(key) || {
        totalTareas: 0,
        totalPoints: 0,
        donePoints: 0,
      };
      const prevPending = prevStats.totalPoints - prevStats.donePoints;
      const prevAvance =
        prevStats.totalPoints > 0 ? (prevStats.donePoints / prevStats.totalPoints) * 100 : 0;
      const prevPending2 = prevStats2.totalPoints - prevStats2.donePoints;
      const prevAvance2 =
        prevStats2.totalPoints > 0 ? (prevStats2.donePoints / prevStats2.totalPoints) * 100 : 0;
      const trend = {
        capacidad: buildTrendSet(0, null, null),
        totalTareas: buildTrendSet(stats.totalTareas, prevStats.totalTareas, prevStats2.totalTareas),
        totalStoryPoints: buildTrendSet(stats.totalPoints, prevStats.totalPoints, prevStats2.totalPoints),
        totalHechos: buildTrendSet(stats.donePoints, prevStats.donePoints, prevStats2.donePoints),
        totalPendientes: buildTrendSet(pendingPoints, prevPending, prevPending2),
        avance: buildTrendSet(avance, prevAvance, prevAvance2),
      };
      const isSelected = normalizeText(state.dailySelectedAssignee) === key;
      teamRows.push({
        usuario: stats.nombre,
        capacidad: null,
        totalTareas: stats.totalTareas,
        totalStoryPoints: stats.totalPoints,
        totalHechos: stats.donePoints,
        totalPendientes: pendingPoints,
        avance,
        _trend: trend,
        _rowClass: isSelected ? "is-selected" : "",
        _isDev: false,
        _rowClick: () => {
          if (normalizeText(state.dailySelectedAssignee) === key) {
            state.dailySelectedAssignee = "";
            state.dailySelectedPersonaId = "";
          } else {
            state.dailySelectedAssignee = stats.nombre;
            state.dailySelectedPersonaId = "";
          }
          renderDaily(state.base);
        },
      });
    });

    const heatmapKeys = [
      "capacidad",
      "totalTareas",
      "totalStoryPoints",
      "totalHechos",
      "totalPendientes",
      "avance",
    ];
    teamRows.sort((a, b) =>
      String(a.usuario || "").localeCompare(String(b.usuario || ""), "es", {
        sensitivity: "base",
      })
    );
    applyHeatmapClasses(teamRows, heatmapKeys, { reverse: ["totalPendientes"] });
    const devIds = personasFiltradas
      .filter((persona) => {
        const rol = String(persona.rol || "").trim().toLowerCase();
        return rol !== "sm" && rol !== "po";
      })
      .map((persona) => persona.id);
    const averageCapacity = (map) => {
      const values = devIds
        .map((id) => Number(map.get(id)))
        .filter((value) => Number.isFinite(value));
      if (!values.length) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const summarizeStats = (stats) => {
      const totals = { totalTareas: 0, totalPoints: 0, donePoints: 0 };
      const add = (entry) => {
        totals.totalTareas += entry.totalTareas || 0;
        totals.totalPoints += entry.totalPoints || 0;
        totals.donePoints += entry.donePoints || 0;
      };
      stats.byPersona.forEach(add);
      stats.byName.forEach(add);
      return totals;
    };
    const totalsStats = summarizeStats(currentStats);
    const totalsPrevStats = summarizeStats(previousStats);
    const totalsPrevStats2 = summarizeStats(previousStats2);
    const totals = {
      totalTareas: totalsStats.totalTareas,
      totalStoryPoints: totalsStats.totalPoints,
      totalHechos: totalsStats.donePoints,
      totalPendientes: totalsStats.totalPoints - totalsStats.donePoints,
    };
    const avgCapacidad = averageCapacity(capacityByPersona);
    const avgCapacidadPrev = averageCapacity(prevCapacityByPersona);
    const avgCapacidadPrev2 = averageCapacity(prevCapacityByPersona2);
    const avgAvance = (() => {
      const values = teamRows
        .filter((row) => row._isDev)
        .map((row) => Number(row.avance))
        .filter((value) => Number.isFinite(value));
      if (!values.length) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    })();
    const totalTrend = {
      capacidad: buildTrendSet(avgCapacidad, avgCapacidadPrev, avgCapacidadPrev2),
      totalTareas: buildTrendSet(
        totalsStats.totalTareas,
        totalsPrevStats.totalTareas,
        totalsPrevStats2.totalTareas
      ),
      totalStoryPoints: buildTrendSet(
        totalsStats.totalPoints,
        totalsPrevStats.totalPoints,
        totalsPrevStats2.totalPoints
      ),
    };
    teamRows.push({
      usuario: "Total",
      capacidad: avgCapacidad,
      totalTareas: totals.totalTareas ?? 0,
      totalStoryPoints: totals.totalStoryPoints ?? 0,
      totalHechos: totals.totalHechos ?? 0,
      totalPendientes: totals.totalPendientes ?? 0,
      avance: avgAvance,
      _trend: totalTrend,
      _rowClass: "totals-row",
      _isTotal: true,
    });

    const editIcon =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L18.8 8.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.4l-2.34-2.34a1 1 0 0 0-1.4 0l-1.82 1.82 3.75 3.75 1.81-1.83z"/></svg>';
    const trashIcon =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h2v10H7zm4 0h2v10h-2zm4 0h2v10h-2zM9 4h6l1 2h4v2H4V6h4l1-2zm-3 6h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10z"/></svg>';

    const updateSprintItem = async (itemId, payload) => {
      try {
        const updated = await putJson(`/sprint-items/${itemId}`, payload);
        const idx = state.base.sprintItems.findIndex((item) => item.id === itemId);
        if (idx >= 0) {
          state.base.sprintItems[idx] = updated;
        }
        await renderDaily(state.base);
      } catch {
        if (status) {
          status.textContent = "No se pudo actualizar el item.";
          status.dataset.type = "error";
        }
      }
    };

    const buildDateInput = (row, field) => {
      const input = document.createElement("input");
      input.type = "date";
      input.className = "table-input";
      const value = row[field] || "";
      input.value = value;
      if (!value) {
        input.dataset.emptyDate = "true";
      }
      input.addEventListener("input", () => {
        if (input.value) {
          delete input.dataset.emptyDate;
        } else {
          input.dataset.emptyDate = "true";
        }
      });
      input.addEventListener("change", async () => {
        await updateSprintItem(row.id, { [field]: input.value || null });
      });
      return input;
    };
    const statusOptions = ["To Do", "In Progress", "Finalizada", "Cancelada", "Backlog"];
    const applyStatusStyle = (el, value) => {
      if (!el) return;
      el.classList.remove("status-ok", "status-warn", "status-danger", "status-muted");
      const normalized = normalizeText(value);
      if (normalized.includes("finalizada") || normalized.includes("finalizado")) {
        el.classList.add("status-ok");
      } else if (normalized.includes("in progress") || normalized.includes("progress")) {
        el.classList.add("status-warn");
      } else if (normalized.includes("cancelada") || normalized.includes("cancelado")) {
        el.classList.add("status-danger");
      } else {
        el.classList.add("status-muted");
      }
    };
    const buildStatusSelect = (row) => {
      const select = document.createElement("select");
      select.className = "table-input";
      const current = getStatusLabel(row.status) || row.status || "";
      const options = current && !statusOptions.includes(current)
        ? [current, ...statusOptions]
        : statusOptions;
      options.forEach((value) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      });
      select.value = current || statusOptions[0];
      applyStatusStyle(select, select.value);
      select.addEventListener("change", async () => {
        applyStatusStyle(select, select.value);
        await updateSprintItem(row.id, { status: select.value });
      });
      return select;
    };
    const buildStoryPointsInput = (row) => {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.1";
      input.className = "table-input";
      input.value =
        row.story_points === null || row.story_points === undefined
          ? ""
          : String(row.story_points);
      input.addEventListener("change", async () => {
        const raw = String(input.value || "").trim();
        const parsed = raw === "" ? null : Number(raw);
        await updateSprintItem(row.id, {
          story_points: Number.isFinite(parsed) ? parsed : null,
        });
      });
      return input;
    };

    renderAdminTable(
      devTable,
      teamRows,
      [
        { key: "usuario", label: "Usuario" },
        {
          key: "capacidad",
          label: "Capacidad",
          render: (row) =>
            row.capacidad === null || row.capacidad === undefined
              ? {
                  text: "—",
                  arrows: row._trend?.capacidad
                    ? [
                        { icon: row._trend.capacidad.one.arrow, className: row._trend.capacidad.one.className },
                        { icon: row._trend.capacidad.two.arrow, className: row._trend.capacidad.two.className },
                      ]
                    : [],
                }
              : {
                  text: `${row.capacidad.toFixed(0)}%`,
                  arrows: row._trend?.capacidad
                    ? [
                        { icon: row._trend.capacidad.one.arrow, className: row._trend.capacidad.one.className },
                        { icon: row._trend.capacidad.two.arrow, className: row._trend.capacidad.two.className },
                      ]
                    : [],
                },
        },
        {
          key: "totalTareas",
          label: "Total tareas",
          render: (row) => ({
            text: String(row.totalTareas),
            arrows: row._trend?.totalTareas
              ? [
                  { icon: row._trend.totalTareas.one.arrow, className: row._trend.totalTareas.one.className },
                  { icon: row._trend.totalTareas.two.arrow, className: row._trend.totalTareas.two.className },
                ]
              : [],
          }),
        },
        {
          key: "totalStoryPoints",
          label: "Total story points",
          render: (row) => ({
            text: formatDaysValue(row.totalStoryPoints),
            arrows: row._trend?.totalStoryPoints
              ? [
                  { icon: row._trend.totalStoryPoints.one.arrow, className: row._trend.totalStoryPoints.one.className },
                  { icon: row._trend.totalStoryPoints.two.arrow, className: row._trend.totalStoryPoints.two.className },
                ]
              : [],
          }),
        },
        {
          key: "totalHechos",
          label: "Total puntos hechos",
          render: (row) => formatDaysValue(row.totalHechos),
        },
        {
          key: "totalPendientes",
          label: "Total puntos pendientes",
          render: (row) => formatDaysValue(row.totalPendientes),
        },
        {
          key: "avance",
          label: "% de avance",
          render: (row) => `${row.avance.toFixed(0)}%`,
        },
      ],
      []
    );

    const itemsColumns = [
        {
          key: "sprint_indicator",
          label: "Sprint",
          render: (row) => {
            const indicator = buildSprintIndicator(row);
            return indicator.node;
          },
          getValue: (row) => buildSprintIndicator(row).count,
        },
        { key: "issue_key", label: "Issue" },
        { key: "issue_type", label: "Tipo" },
        { key: "summary", label: "Resumen" },
        {
          key: "status",
          label: "Estado",
          render: (row) => buildStatusSelect(row),
          getValue: (row) => row.status || "",
        },
        {
          key: "story_points",
          label: "Story Points",
          render: (row) => buildStoryPointsInput(row),
          getValue: (row) => row.story_points ?? "",
        },
        {
          key: "start_date",
          label: "Start Date",
          render: (row) => buildDateInput(row, "start_date"),
        },
        {
          key: "end_date",
          label: "End Date",
          render: (row) => buildDateInput(row, "end_date"),
        },
        {
          key: "total_days",
          label: "Dias Totales",
          render: buildTotalDaysCell,
          getValue: (row) => getTotalDaysValue(row),
        },
        {
          key: "due_date",
          label: "Due Date",
          render: (row) => buildDateInput(row, "due_date"),
        },
        {
          key: "dias_comp",
          label: "Dias Comp",
          render: buildDiasComp,
          getValue: (row) => getDiasCompValue(row),
        },
        {
          key: "assignee",
          label: "Asignado",
          render: (row) => resolvePersonaNameFromItem(row, personaLookup, personaMap),
          getValue: (row) => resolvePersonaNameFromItem(row, personaLookup, personaMap),
        },
      ];
    const renderBasicItemsTable = (container, rows, columns) => {
      if (!container) return;
      const table = document.createElement("table");
      table.className = "table table-bordered table-striped";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      columns.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col.label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        columns.forEach((col) => {
          const td = document.createElement("td");
          const rendered = col.render ? col.render(row) : row[col.key];
          if (rendered instanceof Node) {
            td.appendChild(rendered);
          } else if (rendered && typeof rendered === "object" && "text" in rendered) {
            td.textContent = rendered.text ?? "";
          } else {
            td.textContent = rendered == null ? "" : String(rendered);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = "";
      container.appendChild(table);
    };

    renderAdminTable(
      itemsTable,
      items,
      itemsColumns,
      [
        {
          label: "Editar",
          icon: editIcon,
          onClick: (row) => {
            if (!form) return;
            form.issue_type.value = row.issue_type || "Task";
            form.issue_key.value = row.issue_key || "";
            form.summary.value = row.summary || "";
            form.status.value = row.status || "To Do";
            form.story_points.value = row.story_points ?? "";
            form.persona_id.value = row.persona_id ? String(row.persona_id) : "";
            form.sprint_id.value = row.sprint_id ? String(row.sprint_id) : "";
            setFormMode(form, "edit", row.id, "Actualizar item");
            form.scrollIntoView({ behavior: "smooth", block: "center" });
          },
        },
        {
          label: "Eliminar",
          icon: trashIcon,
          onClick: async (row) => {
            if (!confirm(`Eliminar item ${row.issue_key}?`)) return;
            try {
              const res = await fetchWithFallback(`/sprint-items/${row.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("No se pudo eliminar");
              state.base.sprintItems = state.base.sprintItems.filter((item) => item.id !== row.id);
              await renderDaily(state.base);
            } catch {
              if (status) {
                status.textContent = "No se pudo eliminar el item.";
                status.dataset.type = "error";
              }
            }
          },
        },
      ],
      []
    );
    if (itemsTable && !itemsTable.querySelector("table")) {
      renderBasicItemsTable(itemsTable, items, itemsColumns);
    }

    if (form) {
      const personaOptions = personasFiltradas
        .map((persona) => ({
          id: persona.id,
          nombre: `${persona.nombre} ${persona.apellido}`,
        }))
        .sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true })
        );
      const sprintOptions = [...sprints].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true })
      );
      fillSelect(form.persona_id, personaOptions);
      fillSelect(form.sprint_id, sprintOptions);
      if (selectedSprint) {
        form.sprint_id.value = String(selectedSprint.id);
      }
    }
  }

  function initDaily() {
    const panel = qs("#daily-panel");
    if (!panel || !state.base) return;
    const sprintSelect = qs("#daily-sprint-select");
    const sprintTrigger = qs("#daily-sprint-trigger");
    const sprintPanel = qs("#daily-sprint-panel");
    const form = qs("#daily-form");
    const clearBtn = qs("#daily-form-clear");
    const status = qs("#daily-status");

    if (sprintSelect && !sprintSelect.dataset.bound) {
      sprintSelect.dataset.bound = "true";
      sprintSelect.addEventListener("change", async (event) => {
        const sprintId = event.target.value;
        state.selectedSprintId = sprintId ? String(sprintId) : "";
        state.dailySelectedPersonaId = "";
        state.dailySelectedAssignee = "";
        state.dailyStatusFilters = [];
        state.dailyStoryPointsFilter = null;
        state.dailyStatusOpen = false;
        state.dailyStatusTouched = false;
        await renderDaily(state.base);
      });
    }
    if (sprintTrigger && !sprintTrigger.dataset.bound) {
      sprintTrigger.dataset.bound = "true";
      sprintTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        state.dailySprintOpen = !state.dailySprintOpen;
        renderDaily(state.base);
      });
    }
    if (sprintPanel && !sprintPanel.dataset.bound) {
      sprintPanel.dataset.bound = "true";
      sprintPanel.addEventListener("click", (event) => event.stopPropagation());
    }

    if (!state.dailyStatusOutsideBound) {
      state.dailyStatusOutsideBound = true;
      document.addEventListener("click", () => {
        if (!state.dailyStatusOpen && !state.dailySprintOpen) return;
        state.dailyStatusOpen = false;
        state.dailySprintOpen = false;
        renderDaily(state.base);
      });
    }

    const resetDailyForm = (keepStatus = false) => {
      if (!form) return;
      form.reset();
      resetFormMode(form, "Agregar item");
      if (status && !keepStatus) status.textContent = "";
      renderDaily(state.base);
    };

    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = "true";
      clearBtn.addEventListener("click", resetDailyForm);
    }

    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const issueKey = form.issue_key.value.trim();
        const issueType = form.issue_type.value.trim();
        const summary = form.summary.value.trim();
        const statusValue = form.status.value.trim();
        const sprintId = Number(form.sprint_id.value);
        const personaId = Number(form.persona_id.value);
        if (!issueKey || !issueType || !summary || !statusValue || !sprintId || !personaId) {
          if (status) {
            status.textContent = "Completa todos los campos requeridos.";
            status.dataset.type = "error";
          }
          return;
        }
        const sprint = state.base?.sprints.find((item) => item.id === sprintId);
        if (!sprint) {
          if (status) {
            status.textContent = "Sprint invalido.";
            status.dataset.type = "error";
          }
          return;
        }
        const persona = state.base?.personas.find((p) => p.id === personaId);
        const storyPointsRaw = form.story_points.value.trim();
        const storyPoints = storyPointsRaw ? Number(storyPointsRaw) : null;
        const payload = {
          celula_id: sprint.celula_id,
          sprint_id: sprintId,
          persona_id: personaId,
          assignee_nombre: persona ? `${persona.nombre} ${persona.apellido}` : null,
          issue_key: issueKey,
          issue_type: issueType,
          summary,
          status: statusValue,
          story_points: Number.isNaN(storyPoints) ? null : storyPoints,
        };
        try {
          const editId = form.dataset.editId;
          if (editId) {
            const updatePayload = {
              sprint_id: sprintId,
              persona_id: personaId,
              assignee_nombre: persona ? `${persona.nombre} ${persona.apellido}` : null,
              issue_key: issueKey,
              issue_type: issueType,
              summary,
              status: statusValue,
              story_points: Number.isNaN(storyPoints) ? null : storyPoints,
            };
            await putJson(`/sprint-items/${editId}`, updatePayload);
            if (status) {
              status.textContent = "Item actualizado.";
              status.dataset.type = "ok";
            }
          } else {
            await postJson("/sprint-items", payload);
            if (status) {
              status.textContent = "Item agregado.";
              status.dataset.type = "ok";
            }
          }
          resetDailyForm(true);
          await reloadAll();
        } catch (err) {
          if (status) {
            status.textContent = "No se pudo crear el item.";
            status.dataset.type = "error";
          }
        }
      });
    }

    renderDaily(state.base);
  }

  function classifyReleaseStatus(status) {
    const value = String(status || "").toLowerCase();
    if (!value) return "pendiente";
    if (
      value.includes("final") ||
      value.includes("done") ||
      value.includes("cerrad") ||
      value.includes("released")
    ) {
      return "finalizada";
    }
    if (
      value.includes("progress") ||
      value.includes("progreso") ||
      value.includes("despliegue") ||
      value.includes("in progress")
    ) {
      return "progreso";
    }
    return "pendiente";
  }

  function renderReleaseKpis(counts) {
    const totalEl = qs("#release-kpi-total");
    const doneEl = qs("#release-kpi-finalizadas");
    const progressEl = qs("#release-kpi-progreso");
    const pendingEl = qs("#release-kpi-pendientes");
    const completionEl = qs("#release-kpi-cumplimiento");
    if (totalEl) totalEl.textContent = String(counts.total || 0);
    if (doneEl) doneEl.textContent = String(counts.finalizadas || 0);
    if (progressEl) progressEl.textContent = String(counts.progreso || 0);
    if (pendingEl) pendingEl.textContent = String(counts.pendientes || 0);
    if (completionEl) {
      const pct = counts.total ? Math.round((counts.finalizadas / counts.total) * 100) : 0;
      completionEl.textContent = `${pct}%`;
    }
  }

  function initReleaseTable() {
    const panel = qs("#release-table-page");
    if (!panel || !state.base) return;
    const base = state.base;
    const personaMap = Object.fromEntries(
      (base.personas || []).map((persona) => [
        persona.id,
        `${persona.nombre} ${persona.apellido}`.trim(),
      ])
    );
    const statusOptions = ["Backlog", "To Do", "In Progress", "Finalizada", "Cancelada"];
    const typeOptions = ["ETEC", "Func", "MTEC", "New", "Prob"];
    const buildQuarterOptions = (rows) => {
      const set = new Set();
      rows.forEach((item) => {
        if (item.quarter) {
          set.add(item.quarter);
          return;
        }
        const label = getQuarterLabel(item);
        if (label && label !== "-") {
          set.add(label);
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    };
    const updateReleaseItem = async (itemId, payload) => {
      try {
        const updated = await putJson(`/release-items/${itemId}`, payload);
        const idx = state.base.releaseItems.findIndex((item) => item.id === itemId);
        if (idx >= 0) {
          state.base.releaseItems[idx] = updated;
        }
        initReleaseTable();
      } catch {
        setAdminStatus("No se pudo actualizar el release.", "error");
      }
    };
    const applyStatusStyle = (el, value) => {
      if (!el) return;
      el.classList.remove("status-ok", "status-warn", "status-danger", "status-muted");
      const normalized = normalizeText(value);
      if (normalized.includes("finalizada") || normalized.includes("finalizado")) {
        el.classList.add("status-ok");
      } else if (normalized.includes("in progress") || normalized.includes("progress")) {
        el.classList.add("status-warn");
      } else if (normalized.includes("cancelada") || normalized.includes("cancelado")) {
        el.classList.add("status-danger");
      } else {
        el.classList.add("status-muted");
      }
    };
    const buildStatusSelect = (row) => {
      const select = document.createElement("select");
      select.className = "table-input";
      const current = row.status || "";
      const options = current && !statusOptions.includes(current)
        ? [current, ...statusOptions]
        : statusOptions;
      options.forEach((value) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      });
      select.value = current || statusOptions[0];
      applyStatusStyle(select, select.value);
      select.addEventListener("change", async () => {
        applyStatusStyle(select, select.value);
        await updateReleaseItem(row.id, { status: select.value });
      });
      return select;
    };
    const buildTypeSelect = (row) => {
      const select = document.createElement("select");
      select.className = "table-input";
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Sin tipo";
      select.appendChild(blank);
      typeOptions.forEach((value) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      });
      select.value = row.tipo || "";
      select.addEventListener("change", async () => {
        await updateReleaseItem(row.id, { tipo: select.value || null });
      });
      return select;
    };
    const buildDateInput = (row, field, options = {}) => {
      const input = document.createElement("input");
      input.type = "date";
      input.className = "table-input";
      const value = row[field] || "";
      const showToday = field === "end_date" && !value;
      const displayValue = showToday ? formatISO(getToday()) : value;
      input.value = displayValue;
      if (!value) {
        input.dataset.emptyDate = "true";
      }
      let flag = null;
      if (options.showFlag && !value) {
        flag = document.createElement("span");
        flag.className = "flag flag-pending";
      }
      input.addEventListener("input", () => {
        if (input.value) {
          delete input.dataset.emptyDate;
        } else {
          input.dataset.emptyDate = "true";
        }
      });
      input.addEventListener("change", async () => {
        if (flag) {
          flag.classList.add("hidden");
        }
        await updateReleaseItem(row.id, { [field]: input.value || null });
      });
      if (flag) {
        const wrap = document.createElement("span");
        wrap.className = "date-flag";
        wrap.appendChild(flag);
        wrap.appendChild(input);
        return wrap;
      }
      return input;
    };
    const getQuarterLabel = (row) => {
      if (row.quarter) return row.quarter;
      const startDate = parseDateOnly(row.start_date);
      const dueDate = parseDateOnly(row.due_date);
      const date = startDate || dueDate;
      if (date) {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `Q${quarter} ${date.getFullYear()}`;
      }
      if (row.sprint_nombre) {
        const rank = getSprintRank(row.sprint_nombre);
        if (rank) {
          const year = Math.floor(rank / 100);
          const week = rank % 100;
          const quarter = Math.min(4, Math.max(1, Math.floor((week - 1) / 13) + 1));
          return `Q${quarter} ${year}`;
        }
      }
      return "-";
    };
    const releasesFiltrados = state.selectedCelulaId
      ? (base.releaseItems || []).filter(
          (item) => String(item.celula_id) === String(state.selectedCelulaId)
        )
      : base.releaseItems || [];
    const quarterOptions = buildQuarterOptions(releasesFiltrados);
    const buildQuarterSelect = (row) => {
      const select = document.createElement("select");
      select.className = "table-input";
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Sin quarter";
      select.appendChild(blank);
      quarterOptions.forEach((value) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      });
      select.value = row.quarter || "";
      select.addEventListener("change", async () => {
        await updateReleaseItem(row.id, { quarter: select.value || null });
      });
      return select;
    };
    const activeFilter = state.releaseStatusFilter || "";
    const releasesVisibles = activeFilter
      ? releasesFiltrados.filter(
          (item) => classifyReleaseStatus(item.status) === activeFilter
        )
      : releasesFiltrados;
    const counts = releasesFiltrados.reduce(
      (acc, item) => {
        acc.total += 1;
        const bucket = classifyReleaseStatus(item.status);
        if (bucket === "finalizada") acc.finalizadas += 1;
        else if (bucket === "progreso") acc.progreso += 1;
        else acc.pendientes += 1;
        return acc;
      },
      { total: 0, finalizadas: 0, progreso: 0, pendientes: 0 }
    );
    renderReleaseKpis(counts);
    const kpiCards = panel.querySelectorAll(".release-kpi");
    kpiCards.forEach((card) => {
      if (!card.dataset.bound) {
        card.dataset.bound = "true";
        card.addEventListener("click", () => {
          let filter = card.dataset.releaseFilter || "";
          if (filter === "all") filter = "";
          if (state.releaseStatusFilter === filter || !filter) {
            state.releaseStatusFilter = "";
          } else {
            state.releaseStatusFilter = filter;
          }
          initReleaseTable();
        });
      }
      const filter = card.dataset.releaseFilter || "";
      const isAll = !filter || filter === "all";
      if ((isAll && !state.releaseStatusFilter) || (!isAll && filter === state.releaseStatusFilter)) {
        card.classList.add("is-active");
      } else {
        card.classList.remove("is-active");
      }
    });

    const renderQuarterSummary = (rows) => {
      const container = qs("#release-quarter-summary");
      if (!container) return;
      const summaryMap = new Map();
      rows.forEach((item) => {
        const label = getQuarterLabel(item);
        const entry = summaryMap.get(label) || {
          quarter: label,
          comprometido: 0,
          ejecutado: 0,
        };
        if (normalizeText(item.release_tipo) === "comprometido") {
          entry.comprometido += 1;
        }
        if (classifyReleaseStatus(item.status) === "finalizada") {
          entry.ejecutado += 1;
        }
        summaryMap.set(label, entry);
      });
      const rowsData = Array.from(summaryMap.values());
      rowsData.sort((a, b) => {
        const parse = (value) => {
          const match = /Q(\\d)\\s+(\\d{4})/.exec(value);
          if (!match) return 0;
          return Number(match[2]) * 10 + Number(match[1]);
        };
        return parse(a.quarter) - parse(b.quarter);
      });
      if (!rowsData.length) {
        container.innerHTML = '<p class="empty">Sin registros</p>';
        return;
      }
      const table = document.createElement("table");
      table.className = "table table-bordered table-striped";
      table.innerHTML = `
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Comprometido</th>
            <th>Ejecutado</th>
            <th>Cumplimiento</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");
      const buildQuarterRange = (label) => {
        const match = /Q(\\d)\\s*(\\d{4})/.exec(label || "");
        if (!match) return null;
        const quarter = Number(match[1]);
        const year = Number(match[2]);
        if (!Number.isFinite(quarter) || !Number.isFinite(year)) return null;
        const startMonth = (quarter - 1) * 3;
        const start = new Date(year, startMonth, 1);
        const end = new Date(year, startMonth + 3, 0);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        return { start, end };
      };
      const calcQuarterProgress = (label) => {
        const range = buildQuarterRange(label);
        if (!range) return 0;
        const today = getToday();
        if (today < range.start) return 0;
        if (today > range.end) return 1;
        const totalDays = Math.round((range.end - range.start) / 86400000) + 1;
        const elapsed = Math.round((today - range.start) / 86400000) + 1;
        if (!totalDays) return 0;
        return Math.max(0, Math.min(1, elapsed / totalDays));
      };
      rowsData.forEach((row) => {
        const pct = row.comprometido
          ? Math.round((row.ejecutado / row.comprometido) * 100)
          : 0;
        const progress = calcQuarterProgress(row.quarter);
        const expected = row.comprometido * progress;
        let statusClass = "status-muted";
        if (row.comprometido > 0) {
          if (row.ejecutado >= expected) {
            statusClass = "status-ok";
          } else if (row.ejecutado >= expected * 0.75) {
            statusClass = "status-warn";
          } else {
            statusClass = "status-danger";
          }
        }
        const dot = `<span class=\"summary-dot ${statusClass}\"></span>`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${row.quarter}</td>
          <td>${row.comprometido}</td>
          <td>${row.ejecutado}</td>
          <td>${dot}${pct}%</td>
        `;
        tbody.appendChild(tr);
      });
      container.innerHTML = "";
      container.appendChild(table);
    };
    renderAdminTable(
      qs("#release-table"),
      releasesVisibles,
      [
        { key: "_index", label: "#" },
        { key: "issue_key", label: "Issue" },
        { key: "issue_type", label: "Tipo" },
        { key: "summary", label: "Resumen" },
        {
          key: "quarter",
          label: "Quarter",
          render: (row) => buildQuarterSelect(row),
        },
        {
          key: "status",
          label: "Estado",
          render: (row) => buildStatusSelect(row),
        },
        {
          key: "start_date",
          label: "Start Date",
          render: (row) => buildDateInput(row, "start_date"),
        },
        {
          key: "end_date",
          label: "End Date",
          render: (row) => buildDateInput(row, "end_date", { showFlag: true }),
        },
        {
          key: "tipo",
          label: "Type",
          render: (row) => buildTypeSelect(row),
        },
        {
          key: "release_tipo",
          label: "Tipo release",
          render: (row) => row.release_tipo || "",
        },
      ],
      []
    );
    renderQuarterSummary(releasesVisibles);

    const kpiCommitmentEl = qs("#release-kpi-commitment");
    const kpiAvgExecEl = qs("#release-kpi-avg-exec");
    const kpiAgingEl = qs("#release-kpi-aging");
    const kpiTypeEl = qs("#release-kpi-types");
    if (kpiCommitmentEl) {
      const committed = releasesFiltrados.filter(
        (item) => normalizeText(item.release_tipo) === "comprometido"
      );
      const executed = committed.filter(
        (item) => classifyReleaseStatus(item.status) === "finalizada"
      );
      const pct = committed.length
        ? Math.round((executed.length / committed.length) * 100)
        : 0;
      kpiCommitmentEl.textContent = `${pct}% (${executed.length}/${committed.length})`;
    }
    if (kpiAvgExecEl) {
      const durations = releasesFiltrados
        .map((item) => {
          const start = parseDateOnly(item.start_date);
          const end = parseDateOnly(item.end_date);
          if (!start || !end || end < start) return null;
          const diff = Math.round((end - start) / 86400000);
          return diff;
        })
        .filter((value) => Number.isFinite(value));
      const avg = durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : 0;
      kpiAvgExecEl.textContent = `${avg} dias`;
    }
    if (kpiAgingEl) {
      const today = getToday();
      const ages = releasesFiltrados
        .filter((item) => classifyReleaseStatus(item.status) !== "finalizada")
        .map((item) => {
          const start = parseDateOnly(item.start_date);
          const due = parseDateOnly(item.due_date);
          const baseDate = start || due;
          if (!baseDate) return null;
          const diff = Math.round((today - baseDate) / 86400000);
          return diff;
        })
        .filter((value) => Number.isFinite(value));
      const avg = ages.length
        ? Math.round(ages.reduce((sum, value) => sum + value, 0) / ages.length)
        : 0;
      kpiAgingEl.textContent = `${avg} dias`;
    }
    const typeCounts = new Map();
    releasesFiltrados.forEach((item) => {
      const key = item.tipo || "Sin tipo";
      typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    });
    if (kpiTypeEl) {
      const lines = Array.from(typeCounts.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }))
        .map(([key, value]) => `${key}: ${value}`);
      kpiTypeEl.textContent = lines.join(" · ") || "Sin datos";
    }
    const breakdown = qs("#release-type-breakdown");
    if (breakdown) {
      const total = releasesFiltrados.length || 0;
      const sorted = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
      if (!sorted.length) {
        breakdown.classList.remove("donut-chart");
        breakdown.innerHTML = '<p class="empty">Sin registros</p>';
      } else {
        breakdown.classList.add("donut-chart");
        breakdown.innerHTML = '<div class="donut"></div><ul class="legend"></ul>';
        const labels = sorted.map(([label]) => label);
        const values = sorted.map(([, count]) => count);
        const palette = [
          "#4ba3ff",
          "#49d1cc",
          "#ffb347",
          "#ff6b6b",
          "#a7f36a",
          "#9b6bff",
          "#6c757d",
        ];
        const colors = values.map((_, idx) => palette[idx % palette.length]);
        renderPie(
          breakdown,
          {
            labels,
            values,
            colors,
          },
          "donut"
        );
      }
    }
  }

  async function initRetrospective(options = {}) {
    const { skipPolling = false } = options;
    const panel = qs("#retro-page");
    if (!panel || !state.base) return;
    const base = state.base;
    const sprintSelect = qs("#retro-sprint-select");
    const summaryTable = qs("#retro-summary-table");
    const itemsTable = qs("#retro-items-table");
    const commitmentsTable = qs("#retro-commitments-table");
    const commitmentFilter = qs("#retro-commitment-filter");
    const status = qs("#retro-status");
    const shareUrl = qs("#retro-share-url");
    const shareQr = qs("#retro-share-qr");
    const copyBtn = qs("#retro-share-copy");
    const shareStatus = qs("#retro-share-status");
    const shareBlock = shareUrl ? shareUrl.closest(".retro-share") : null;
    const qrBlock = shareQr ? shareQr.closest(".retro-qr") : null;
    const phaseStatus = qs("#retro-phase-status");
    const openSprintLabel = qs("#retro-open-sprint");
    const createBtn = qs("#retro-create");
    const startGoodBtn = qs("#retro-start-good");
    const startBadBtn = qs("#retro-start-bad");
    const closeBtn = qs("#retro-close");
    const closeSummaryBtn = qs("#retro-close-summary");
    const presenceCount = qs("#retro-connected-count");
    const presenceList = qs("#retro-connected-list");
    const form = qs("#retro-form");
    const tipoSelect = qs("#retro-type");
    const detailInput = qs("#retro-detail");
    const authorSelect = qs("#retro-author");
    const assigneeSelect = qs("#retro-assignee");
    const dueInput = qs("#retro-due");
    const commitmentFields = qs("#retro-commitment-fields");
    const formCancelBtn = qs("#retro-form-cancel");

    const setRetroStatus = (message, type = "info") => {
      if (!status) return;
      status.textContent = message || "";
      status.dataset.type = type;
    };
    let presenceFilter = { ids: new Set(), names: new Set() };
    const applyPresenceFilter = (personas) =>
      personas.filter((persona) => {
        if (!persona) return false;
        const personaId = persona.persona_id;
        if (personaId && presenceFilter.ids.has(String(personaId))) return true;
        const nombre = normalizeText(persona.nombre || "");
        return nombre && presenceFilter.names.has(nombre);
      });
    const renderPresence = (payload) => {
      if (!presenceCount || !presenceList) return;
      const personas = Array.isArray(payload?.personas)
        ? payload.personas
        : Array.isArray(state.retroPresence?.personas)
          ? state.retroPresence.personas
          : [];
      const filtered = applyPresenceFilter(personas);
      const submittedIds = state.retroSubmittedIds || new Set();
      const visibleTotal = filtered.length || 0;
      presenceCount.textContent = String(visibleTotal);
      presenceList.innerHTML = "";
      if (!filtered.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "Sin conexiones";
        presenceList.appendChild(li);
        return;
      }
      filtered.forEach((persona) => {
        const li = document.createElement("li");
        const name = persona.nombre || "";
        const label = document.createElement("span");
        label.textContent = name;
        li.appendChild(label);
        const personaId = persona.persona_id;
        if (personaId != null && submittedIds.has(String(personaId))) {
          const badge = document.createElement("span");
          badge.className = "retro-submitted";
          badge.textContent = "✅";
          badge.title = "Comentario enviado";
          li.appendChild(badge);
        }
        presenceList.appendChild(li);
      });
    };

    const renderTable = (container, headers, rows) => {
      if (!container) return;
      if (!rows.length) {
        container.innerHTML = '<p class="empty">Sin datos.</p>';
        return;
      }
      const tableKey = container.id || "retro-table";
      const sortState = state.tableSort[tableKey] || null;
      const normalizeSortable = (cell) => {
        if (cell == null) return "";
        if (cell instanceof Node) {
          return cell.textContent?.trim() || "";
        }
        return String(cell).trim();
      };
      let sortedRows = [...rows];
      if (sortState?.index != null) {
        sortedRows.sort((a, b) => {
          const aVal = normalizeSortable(a[sortState.index]);
          const bVal = normalizeSortable(b[sortState.index]);
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          let result = 0;
          if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
            result = aNum - bNum;
          } else {
            result = aVal.localeCompare(bVal, "es", {
              numeric: true,
              sensitivity: "base",
            });
          }
          return sortState.dir === "desc" ? -result : result;
        });
      }
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      headers.forEach((label, index) => {
        const th = document.createElement("th");
        th.className = "sortable";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "table-sort";
        const indicator = document.createElement("span");
        indicator.className = "sort-indicator";
        if (sortState?.index === index) {
          indicator.textContent = sortState.dir === "desc" ? "▼" : "▲";
        }
        btn.append(document.createTextNode(label), indicator);
        btn.addEventListener("click", () => {
          const current = state.tableSort[tableKey];
          const nextDir =
            current && current.index === index && current.dir === "asc" ? "desc" : "asc";
          state.tableSort[tableKey] = { index, dir: nextDir };
          renderTable(container, headers, rows);
        });
        th.appendChild(btn);
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      sortedRows.forEach((cells) => {
        const tr = document.createElement("tr");
        cells.forEach((cell) => {
          const td = document.createElement("td");
          if (cell instanceof Node) {
            td.appendChild(cell);
          } else {
            td.textContent = cell ?? "";
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.innerHTML = "";
      container.appendChild(table);
    };

    if (!state.selectedCelulaId) {
      setRetroStatus("Selecciona una celula para gestionar retros.", "warn");
      renderPresence({ personas: [], total: 0 });
      if (summaryTable) summaryTable.innerHTML = '<p class="empty">Sin celula seleccionada.</p>';
      if (itemsTable) itemsTable.innerHTML = "";
      if (commitmentsTable) commitmentsTable.innerHTML = "";
      return;
    }

    const sprints = base.sprints.filter(
      (sprint) => String(sprint.celula_id) === String(state.selectedCelulaId)
    );
    if (!sprints.length) {
      setRetroStatus("No hay sprints para la celula seleccionada.", "warn");
      renderPresence({ personas: [], total: 0 });
      if (summaryTable) summaryTable.innerHTML = '<p class="empty">Sin sprints cargados.</p>';
      return;
    }

    const sprintMap = Object.fromEntries(base.sprints.map((s) => [s.id, s.nombre]));
    const phaseLabels = {
      espera: "En espera",
      bien: "Que hicimos bien",
      mal: "Que pudimos hacer mejor",
      compromiso: "Compromisos",
    };
    let retros = [];
    try {
      retros = await fetchJson(`/retros?celula_id=${state.selectedCelulaId}`);
    } catch (err) {
      setRetroStatus("No se pudo cargar la retros.", "error");
      return;
    }
    const retroSprintIds = new Set(retros.map((retro) => String(retro.sprint_id)));
    const getSprintSortValue = (sprint) => {
      const date = parseDateOnly(sprint.fecha_inicio || sprint.fecha_fin);
      if (date) return date.getTime();
      const numericId = Number(sprint.id);
      return Number.isFinite(numericId) ? numericId : 0;
    };
    const sortedSprints = [...sprints].sort(
      (a, b) => getSprintSortValue(a) - getSprintSortValue(b)
    );
    const activeSprint = getActiveSprint(sortedSprints) || sortedSprints[0];
    const activeIndex = activeSprint
      ? sortedSprints.findIndex((sprint) => String(sprint.id) === String(activeSprint.id))
      : -1;
    const futureSprints =
      activeIndex >= 0 ? sortedSprints.slice(activeIndex) : sortedSprints;
    const lastTwoSprints = [];
    if (activeIndex > 0) {
      lastTwoSprints.push(sortedSprints[activeIndex - 1]);
    }
    if (activeIndex > 1) {
      lastTwoSprints.push(sortedSprints[activeIndex - 2]);
    }
    const selectableSet = new Map();
    [...futureSprints, ...lastTwoSprints].forEach((sprint) => {
      if (!sprint) return;
      if (retroSprintIds.has(String(sprint.id))) return;
      selectableSet.set(String(sprint.id), sprint);
    });
    const selectableSprints = Array.from(selectableSet.values()).sort(
      (a, b) => getSprintSortValue(a) - getSprintSortValue(b)
    );
    const selectedRetro = state.selectedSprintId
      ? retros.find((retro) => String(retro.sprint_id) === state.selectedSprintId)
      : null;
    let displaySprints = [...selectableSprints];
    if (selectedRetro) {
      const selectedSprint = sprints.find(
        (sprint) => String(sprint.id) === state.selectedSprintId
      );
      if (
        selectedSprint &&
        !displaySprints.some((sprint) => String(sprint.id) === String(selectedSprint.id))
      ) {
        displaySprints.push(selectedSprint);
      }
    }
    displaySprints.sort((a, b) => getSprintSortValue(a) - getSprintSortValue(b));
    if (sprintSelect) {
      fillSelect(sprintSelect, displaySprints);
      const activeSprint = getActiveSprint(displaySprints) || displaySprints[0];
      if (
        !state.selectedSprintId ||
        (!displaySprints.some((s) => String(s.id) === state.selectedSprintId) && !selectedRetro)
      ) {
        state.selectedSprintId = activeSprint ? String(activeSprint.id) : "";
      }
      sprintSelect.value = state.selectedSprintId || "";
      if (!sprintSelect.dataset.bound) {
        sprintSelect.dataset.bound = "true";
        sprintSelect.addEventListener("change", () => {
          state.selectedSprintId = sprintSelect.value;
          initRetrospective();
        });
      }
    }

    const personasActivas = filterActivePersonas(base.personas || []);
    const personasFiltradas = personasActivas.filter((persona) =>
      (persona.celulas || []).some(
        (celula) => String(celula.id) === String(state.selectedCelulaId)
      )
    );
    const personaMap = Object.fromEntries(
      personasFiltradas.map((p) => [p.id, `${p.nombre} ${p.apellido}`])
    );
    presenceFilter = {
      ids: new Set(personasFiltradas.map((p) => String(p.id))),
      names: new Set(
        personasFiltradas
          .map((p) => normalizeText(`${p.nombre} ${p.apellido}`.trim()))
          .filter(Boolean)
      ),
    };
    const fillPersonaSelect = (select, placeholder) => {
      if (!select) return;
      const currentValue = select.value;
      select.innerHTML = `<option value="">${placeholder}</option>`;
      personasFiltradas.forEach((persona) => {
        const opt = document.createElement("option");
        opt.value = persona.id;
        opt.textContent = `${persona.nombre} ${persona.apellido}`.trim();
        select.appendChild(opt);
      });
      if (currentValue) {
        select.value = currentValue;
      }
    };
    const isEditing = Boolean(form?.dataset?.editId);
    const pendingValues = isEditing
      ? {
          tipo: tipoSelect?.value || "",
          detalle: detailInput?.value || "",
          autor: authorSelect?.value || "",
          asignado: assigneeSelect?.value || "",
          fecha: dueInput?.value || "",
        }
      : null;
    fillPersonaSelect(authorSelect, "Autor (opcional)");
    fillPersonaSelect(assigneeSelect, "Asignado");
    renderPresence(state.retroPresence);
    if (pendingValues) {
      if (tipoSelect) tipoSelect.value = pendingValues.tipo;
      if (detailInput) detailInput.value = pendingValues.detalle;
      if (authorSelect) authorSelect.value = pendingValues.autor;
      if (assigneeSelect) assigneeSelect.value = pendingValues.asignado;
      if (dueInput) dueInput.value = pendingValues.fecha;
      if (commitmentFields) {
        commitmentFields.classList.toggle("hidden", pendingValues.tipo !== "compromiso");
      }
    }

    const sprintId = Number(sprintSelect?.value || state.selectedSprintId || 0);
    if (!skipPolling && !window.__retroAdminPoll) {
      window.__retroAdminPoll = window.setInterval(() => {
        if (document.hidden) return;
        initRetrospective({ skipPolling: true });
      }, 8000);
    }
    if (state.retroActiveId) {
      const exists = retros.some((retro) => String(retro.id) === state.retroActiveId);
      if (!exists) {
        state.retroActiveId = "";
      }
    }

    const summaryRows = retros.map((retro) => {
      const sprintLabel = sprintMap[retro.sprint_id] || `Sprint ${retro.sprint_id}`;
      const sprintBtn = document.createElement("button");
      sprintBtn.type = "button";
      sprintBtn.className = "table-link";
      sprintBtn.textContent = sprintLabel;
      sprintBtn.addEventListener("click", () => {
        state.selectedSprintId = String(retro.sprint_id);
        if (sprintSelect) {
          sprintSelect.value = state.selectedSprintId;
        }
        initRetrospective();
      });
      const actions = document.createElement("div");
      actions.className = "row-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn small";
      editBtn.textContent = "Editar";
      editBtn.addEventListener("click", async () => {
        await withButtonBusy(editBtn, async () => {
          if (retro.estado !== "abierta") {
            await putJson(`/retros/${retro.id}`, { estado: "abierta", fase: "espera" });
          }
          state.selectedSprintId = String(retro.sprint_id);
          initRetrospective();
        });
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn small ghost";
      delBtn.textContent = "Eliminar";
      delBtn.addEventListener("click", async () => {
        if (!confirm("Eliminar retro del sprint?")) return;
        await withButtonBusy(delBtn, async () => {
          await fetchWithFallback(`/retros/${retro.id}`, { method: "DELETE" });
          if (String(retro.id) === state.retroActiveId) {
            state.retroActiveId = "";
          }
          initRetrospective();
        });
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      return [
        sprintBtn,
        String(retro.resumen?.bien ?? 0),
        String(retro.resumen?.mal ?? 0),
        String(retro.resumen?.compromiso ?? 0),
        retro.estado,
        formatDate(retro.actualizado_en?.slice?.(0, 10) || retro.actualizado_en),
        actions,
      ];
    });
    renderTable(
      summaryTable,
      ["Sprint", "Bien", "Mal", "Compromisos", "Estado", "Actualizado", "Acciones"],
      summaryRows
    );

    let currentRetro = retros.find((retro) => retro.sprint_id === sprintId) || null;
    let shareRetro = currentRetro;
    if (!shareRetro && state.retroActiveId) {
      shareRetro = retros.find((retro) => String(retro.id) === state.retroActiveId) || null;
    }
    let items = [];
    if (currentRetro) {
      try {
        const detail = await fetchJson(`/retros/${currentRetro.id}`);
        items = detail.items || [];
        try {
          state.retroPresence = await fetchJson(`/retros/${currentRetro.id}/presence`);
          renderPresence(state.retroPresence);
        } catch {
          // ignore
        }
      } catch {
        setRetroStatus("No se pudo cargar los aportes.", "error");
        items = [];
      }
    }
    if (shareRetro && shareRetro.estado !== "abierta") {
      state.retroPresence = { total: 0, personas: [] };
      renderPresence(state.retroPresence);
    }
    const currentPhase = shareRetro?.fase || currentRetro?.fase || "";
    const submittedIds = new Set(
      items
        .filter((item) => item?.persona_id && item.tipo === currentPhase)
        .map((item) => String(item.persona_id))
    );
    state.retroSubmittedIds = submittedIds;

    const updateShareSection = () => {
      if (!shareUrl) return;
      const isOpen = shareRetro && shareRetro.estado !== "cerrada";
      if (shareBlock) shareBlock.classList.toggle("hidden", !isOpen);
      if (qrBlock) qrBlock.classList.toggle("hidden", !isOpen);
      if (copyBtn) copyBtn.disabled = !isOpen;
      if (!shareRetro || !isOpen) {
        shareUrl.value = "";
        shareUrl.readOnly = true;
        if (shareStatus) {
          shareStatus.textContent = "";
          shareStatus.dataset.type = "info";
        }
        if (shareQr) {
          shareQr.src = "";
          shareQr.classList.remove("is-zoomed");
        }
        document.body.classList.remove("qr-zoomed");
        return;
      }
      const origin = window.location.origin;
      const basePath = window.location.pathname.replace(/[^/]+$/, "retro-public.html");
      const shareLink = `${origin}${basePath}?token=${shareRetro.token}`;
      shareUrl.value = shareLink;
      shareUrl.readOnly = true;
      if (shareQr) {
        shareQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
          shareLink
        )}`;
        shareQr.alt = "QR Retro";
      }
    };

    const updatePhaseControls = () => {
      if (!phaseStatus) return;
      if (!shareRetro) {
        phaseStatus.textContent = "Sin retro creada.";
        if (openSprintLabel) {
          openSprintLabel.textContent = "Sprint abierto: -";
        }
      } else {
        phaseStatus.textContent = `Flujo actual: ${phaseLabels[shareRetro.fase] || "Retro"} · ${shareRetro.estado}`;
        if (openSprintLabel) {
          const sprintName = sprintMap[shareRetro.sprint_id] || `Sprint ${shareRetro.sprint_id}`;
          openSprintLabel.textContent =
            shareRetro.estado === "cerrada"
              ? "Sprint abierto: -"
              : `Sprint abierto: ${sprintName}`;
        }
      }
      const isClosed = shareRetro && shareRetro.estado === "cerrada";
      if (createBtn) createBtn.disabled = !!shareRetro;
      if (startGoodBtn) startGoodBtn.disabled = !shareRetro || isClosed;
      if (startBadBtn) startBadBtn.disabled = !shareRetro || isClosed;
      if (closeBtn) closeBtn.disabled = !shareRetro || isClosed;
      [createBtn, startGoodBtn, startBadBtn, closeBtn].forEach((btn) => {
        setButtonWaiting(btn, true);
      });
      [createBtn, startGoodBtn, startBadBtn, closeBtn].forEach((btn) => {
        if (btn) btn.classList.remove("is-active");
      });
      if (shareRetro?.fase === "bien" && startGoodBtn) startGoodBtn.classList.add("is-active");
      if (shareRetro?.fase === "mal" && startBadBtn) startBadBtn.classList.add("is-active");
      if (shareRetro?.estado === "cerrada" && closeBtn) closeBtn.classList.add("is-active");
    };

    updateShareSection();
    updatePhaseControls();
    renderPresence();
    if (shareRetro?.token) {
      ensureRetroSocket(shareRetro.token, "admin", (payload) => {
        if (payload?.type === "presence") {
          state.retroPresence = payload;
          renderPresence(payload);
          return;
        }
        if (payload?.type === "retro_updated" && shareRetro && payload.retro_id === shareRetro.id) {
          shareRetro = {
            ...shareRetro,
            fase: payload.fase || shareRetro.fase,
            estado: payload.estado || shareRetro.estado,
          };
          if (currentRetro && currentRetro.id === shareRetro.id) {
            currentRetro = { ...currentRetro, ...shareRetro };
          }
          if (shareRetro.estado !== "abierta") {
            state.retroPresence = { total: 0, personas: [] };
            renderPresence(state.retroPresence);
          }
          updateShareSection();
          updatePhaseControls();
          return;
        }
        if (payload?.type === "retro_deleted") {
          initRetrospective({ skipPolling: true });
          return;
        }
        initRetrospective({ skipPolling: true });
      });
    }

    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = "true";
      copyBtn.addEventListener("click", async () => {
        if (shareUrl?.value && currentRetro) {
          const ok = await copyToClipboard(shareUrl.value, shareUrl);
          if (shareStatus) {
            shareStatus.textContent = ok ? "Link copiado." : "No se pudo copiar el link.";
            shareStatus.dataset.type = ok ? "ok" : "error";
          } else {
            setRetroStatus(ok ? "Link copiado." : "No se pudo copiar el link.", ok ? "ok" : "warn");
          }
        }
      });
    }

    if (shareQr && !shareQr.dataset.bound) {
      shareQr.dataset.bound = "true";
      shareQr.addEventListener("click", () => {
        const isZoomed = shareQr.classList.toggle("is-zoomed");
        document.body.classList.toggle("qr-zoomed", isZoomed);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && shareQr.classList.contains("is-zoomed")) {
          shareQr.classList.remove("is-zoomed");
          document.body.classList.remove("qr-zoomed");
        }
      });
    }

    if (createBtn && !createBtn.dataset.bound) {
      createBtn.dataset.bound = "true";
      createBtn.addEventListener("click", async () => {
        await withButtonBusy(
          createBtn,
          async () => {
            try {
              const selectedSprintId = Number(sprintSelect?.value || state.selectedSprintId || 0);
              if (!selectedSprintId) {
                setRetroStatus("Selecciona un sprint valido.", "warn");
                return;
              }
              state.selectedSprintId = String(selectedSprintId);
              currentRetro = await postJson("/retros", {
                celula_id: Number(state.selectedCelulaId),
                sprint_id: selectedSprintId,
              });
              shareRetro = currentRetro;
              state.retroActiveId = String(currentRetro.id);
              items = [];
              updateShareSection();
              updatePhaseControls();
              setRetroStatus("Retro preparada.", "ok");
              if (shareRetro?.token) {
                ensureRetroSocket(shareRetro.token, "admin", (payload) => {
                  if (payload?.type === "presence") {
                    state.retroPresence = payload;
                    renderPresence(payload);
                    return;
                  }
                  initRetrospective({ skipPolling: true });
                });
              }
              initRetrospective({ skipPolling: true });
            } catch {
              setRetroStatus("No se pudo crear la retro.", "error");
            }
          },
          "Creando..."
        );
      });
    }

    if (startGoodBtn && !startGoodBtn.dataset.bound) {
      startGoodBtn.dataset.bound = "true";
      startGoodBtn.addEventListener("click", async () => {
        if (!shareRetro) {
          setRetroStatus("No hay retro para el sprint seleccionado.", "warn");
          return;
        }
        await withButtonBusy(
          startGoodBtn,
          async () => {
            if (shareRetro) {
              shareRetro = { ...shareRetro, fase: "bien", estado: "abierta" };
              updateShareSection();
              updatePhaseControls();
            }
            await putJson(`/retros/${shareRetro.id}`, { fase: "bien", estado: "abierta" });
            initRetrospective();
          },
          "Iniciando..."
        );
      });
    }

    if (startBadBtn && !startBadBtn.dataset.bound) {
      startBadBtn.dataset.bound = "true";
      startBadBtn.addEventListener("click", async () => {
        if (!shareRetro) {
          setRetroStatus("No hay retro para el sprint seleccionado.", "warn");
          return;
        }
        await withButtonBusy(
          startBadBtn,
          async () => {
            if (shareRetro) {
              shareRetro = { ...shareRetro, fase: "mal", estado: "abierta" };
              updateShareSection();
              updatePhaseControls();
            }
            await putJson(`/retros/${shareRetro.id}`, { fase: "mal", estado: "abierta" });
            initRetrospective();
          },
          "Iniciando..."
        );
      });
    }

    const closeAllRetros = async (trigger) => {
      const openRetros = retros.filter((retro) => retro.estado !== "cerrada");
      if (!openRetros.length) {
        setRetroStatus("No hay retros abiertas.", "warn");
        return;
      }
      await withButtonBusy(
        trigger,
        async () => {
          if (shareRetro) {
            shareRetro = { ...shareRetro, estado: "cerrada" };
            updateShareSection();
            updatePhaseControls();
          }
          const results = await Promise.allSettled(
            openRetros.map((retro) => putJson(`/retros/${retro.id}`, { estado: "cerrada" }))
          );
          const failed = [];
          results.forEach((result, index) => {
            if (result.status === "rejected") {
              failed.push(openRetros[index]);
              console.error("No se pudo cerrar retro:", result.reason);
            }
          });
          if (failed.length) {
            const names = failed
              .map((retro) => sprintMap[retro.sprint_id] || `Sprint ${retro.sprint_id}`)
              .join(", ");
            setRetroStatus(`No se pudo cerrar: ${names}.`, "error");
          } else {
            setRetroStatus(`Retros cerradas (${openRetros.length}).`, "ok");
          }
          state.retroActiveId = "";
          initRetrospective();
        },
        "Cerrando..."
      );
    };

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", async () => {
        await closeAllRetros(closeBtn);
      });
    }
    if (closeSummaryBtn && !closeSummaryBtn.dataset.bound) {
      closeSummaryBtn.dataset.bound = "true";
      closeSummaryBtn.addEventListener("click", async () => {
        await closeAllRetros(closeSummaryBtn);
      });
    }

    const renderItems = () => {
      if (!itemsTable) return;
      const grouped = {
        bien: [],
        mal: [],
        compromiso: [],
      };
      items.forEach((item) => {
        if (grouped[item.tipo]) {
          if (item.tipo === "compromiso") {
            const assigned = item.asignado_id ? personaMap[item.asignado_id] || "" : "";
            const dateLabel = item.fecha_compromiso ? formatDate(item.fecha_compromiso) : "";
            const parts = [item.detalle];
            if (assigned) parts.push(assigned);
            if (dateLabel) parts.push(dateLabel);
            grouped[item.tipo].push(parts.join(" · "));
          } else {
            grouped[item.tipo].push(item.detalle);
          }
        }
      });
      const cardSpecs = [
        { key: "bien", title: "Que hicimos bien?", className: "retro-card--good" },
        { key: "mal", title: "Que pudimos hacer mejor?", className: "retro-card--bad" },
        { key: "compromiso", title: "Que nos comprometemos?", className: "retro-card--commit" },
      ];
      const wrapper = document.createElement("div");
      wrapper.className = "retro-cards";
      cardSpecs.forEach((spec) => {
        const card = document.createElement("div");
        card.className = `retro-card ${spec.className}`;
        const title = document.createElement("h4");
        title.textContent = spec.title;
        const list = document.createElement("ul");
        const entries = grouped[spec.key];
        if (!entries.length) {
          const empty = document.createElement("li");
          empty.className = "empty";
          empty.textContent = "Sin aportes.";
          list.appendChild(empty);
        } else {
          entries.forEach((text) => {
            const li = document.createElement("li");
            li.textContent = text;
            list.appendChild(li);
          });
        }
        card.appendChild(title);
        card.appendChild(list);
        wrapper.appendChild(card);
      });
      itemsTable.innerHTML = "";
      itemsTable.appendChild(wrapper);
    };

    const resetForm = () => {
      if (detailInput) detailInput.value = "";
      if (authorSelect) authorSelect.value = "";
      if (assigneeSelect) assigneeSelect.value = "";
      if (dueInput) dueInput.value = "";
      if (tipoSelect) tipoSelect.value = "bien";
      if (commitmentFields) commitmentFields.classList.add("hidden");
      if (form) {
        form.dataset.editId = "";
        form.dataset.retroId = "";
        const submitBtn = form.querySelector("button[type='submit']");
        if (submitBtn) submitBtn.textContent = "Agregar";
      }
    };

    if (formCancelBtn && !formCancelBtn.dataset.bound) {
      formCancelBtn.dataset.bound = "true";
      formCancelBtn.addEventListener("click", () => {
        resetForm();
        setRetroStatus("", "info");
      });
    }

    const setEditMode = (item) => {
      if (!form) return;
      form.dataset.editId = String(item.id);
      form.dataset.retroId = String(item.retro_id || currentRetro?.id || "");
      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.textContent = "Actualizar";
      const tipo = item.tipo || "compromiso";
      if (tipoSelect) tipoSelect.value = tipo;
      if (detailInput) detailInput.value = item.detalle || "";
      if (authorSelect) authorSelect.value = item.persona_id ? String(item.persona_id) : "";
      if (assigneeSelect) assigneeSelect.value = item.asignado_id ? String(item.asignado_id) : "";
      if (dueInput) dueInput.value = item.fecha_compromiso || "";
      if (commitmentFields) commitmentFields.classList.toggle("hidden", tipo !== "compromiso");
    };

    let commitments = [];
    try {
      const fetched = await fetchJson(
        `/retros/compromisos?celula_id=${state.selectedCelulaId}`
      );
      commitments = Array.isArray(fetched) ? fetched : [];
    } catch {
      commitments = [];
    }
    if (!commitments.length && retros.length) {
      try {
        const retroDetails = await Promise.all(
          retros.map((retro) =>
            fetchJson(`/retros/${retro.id}`)
              .then((detail) => ({ retro, detail }))
              .catch(() => null)
          )
        );
        commitments = retroDetails
          .filter(Boolean)
          .flatMap(({ retro, detail }) => {
            const sprintName = sprintMap[retro.sprint_id] || "";
            return (detail.items || [])
              .filter((item) => item.tipo === "compromiso")
              .map((item) => ({
                ...item,
                sprint_id: retro.sprint_id,
                sprint_nombre: sprintName,
              }));
          });
      } catch {
        commitments = [];
      }
    }
    if (!commitments.length) {
      commitments = items.filter((item) => item.tipo === "compromiso");
    }

    if (commitmentFilter && !commitmentFilter.dataset.bound) {
      commitmentFilter.dataset.bound = "true";
      commitmentFilter.value = state.retroCommitmentFilter || "pendiente";
      commitmentFilter.addEventListener("change", () => {
        state.retroCommitmentFilter = commitmentFilter.value;
        renderCommitments();
      });
    }

    const renderCommitments = () => {
      let commits = commitments || [];
      const filter = commitmentFilter?.value || state.retroCommitmentFilter || "pendiente";
      if (filter === "pendiente") {
        commits = commits.filter((item) => item.estado !== "cerrado");
      } else if (filter === "cerrado") {
        commits = commits.filter((item) => item.estado === "cerrado");
      }
      const rows = commits.map((item) => {
        const statusSelect = document.createElement("select");
        ["pendiente", "en_progreso", "cerrado"].forEach((value) => {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent =
            value === "cerrado" ? "Finalizado" : value === "en_progreso" ? "En curso" : "Pendiente";
          statusSelect.appendChild(opt);
        });
        statusSelect.value = item.estado || "pendiente";
        const statusWrap = document.createElement("div");
        statusWrap.className = "status-select";
        const statusDot = document.createElement("span");
        statusDot.className = "status-dot";
        statusWrap.appendChild(statusDot);
        statusWrap.appendChild(statusSelect);
        const setStatusClass = (value) => {
          statusWrap.classList.remove("is-pending", "is-progress", "is-done");
          if (value === "cerrado") {
            statusWrap.classList.add("is-done");
          } else if (value === "en_progreso") {
            statusWrap.classList.add("is-progress");
          } else {
            statusWrap.classList.add("is-pending");
          }
        };
        setStatusClass(statusSelect.value);
        statusSelect.addEventListener("change", async () => {
          setStatusClass(statusSelect.value);
          const retroId = item.retro_id || currentRetro?.id;
          if (!retroId) return;
          await putJson(`/retros/${retroId}/items/${item.id}`, {
            estado: statusSelect.value,
          });
          initRetrospective();
        });
        const dateWrap = document.createElement("div");
        dateWrap.className = "date-flag";
        const dateLabel = document.createElement("span");
        const due = item.fecha_compromiso ? parseDateOnly(item.fecha_compromiso) : null;
        dateLabel.textContent = item.fecha_compromiso ? formatDate(item.fecha_compromiso) : "";
        if (due) {
          const flag = document.createElement("span");
          flag.className = "flag";
          const today = getToday();
          if (item.estado === "cerrado" || today <= due) {
            flag.classList.add("flag-ok");
          } else {
            flag.classList.add("flag-late");
          }
          dateWrap.appendChild(flag);
        }
        dateWrap.appendChild(dateLabel);
        const actions = document.createElement("div");
        actions.className = "row-actions";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn small";
        editBtn.textContent = "Editar";
        editBtn.addEventListener("click", () => {
          setEditMode(item);
          setRetroStatus("Editando compromiso.", "info");
        });
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn small ghost";
        delBtn.textContent = "Eliminar";
        delBtn.addEventListener("click", async () => {
          if (!confirm("Eliminar compromiso?")) return;
          const retroId = item.retro_id || currentRetro?.id;
          if (!retroId) return;
          await fetchWithFallback(`/retros/${retroId}/items/${item.id}`, { method: "DELETE" });
          initRetrospective();
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        return [
          item.sprint_nombre || sprintMap[item.sprint_id] || "",
          item.detalle,
          item.asignado_nombre || (item.asignado_id ? personaMap[item.asignado_id] || "" : ""),
          dateWrap,
          statusWrap,
          actions,
        ];
      });
      renderTable(
        commitmentsTable,
        ["Retro", "Compromiso", "Asignado", "Fecha", "Estado", "Acciones"],
        rows
      );
    };

    renderItems();
    renderCommitments();

    if (tipoSelect && !tipoSelect.dataset.bound) {
      tipoSelect.dataset.bound = "true";
      tipoSelect.addEventListener("change", () => {
        const isCommitment = tipoSelect.value === "compromiso";
        if (commitmentFields) {
          commitmentFields.classList.toggle("hidden", !isCommitment);
        }
      });
    }

    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = form.querySelector("button[type='submit']");
        const tipo = tipoSelect?.value || "";
        const detalle = detailInput?.value || "";
        if (!tipo || !detalle.trim()) {
          setRetroStatus("Completa tipo y detalle.", "error");
          return;
        }
        const normalizeDateValue = (input) => {
          if (!input) return "";
          const raw = String(input.value || "").trim();
          if (!raw) return "";
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
            const [day, month, year] = raw.split("/");
            const iso = `${year}-${month}-${day}`;
            input.value = iso;
            return iso;
          }
          return raw;
        };
        if (tipo === "compromiso") {
          const assigneeValue = (assigneeSelect?.value || "").trim();
          const dueValue = normalizeDateValue(dueInput);
          if (!assigneeValue && !dueValue) {
            setRetroStatus("Compromiso requiere asignado y fecha.", "error");
            return;
          }
          if (!assigneeValue) {
            setRetroStatus("Selecciona Asignado para el compromiso.", "error");
            return;
          }
          if (!dueValue) {
            setRetroStatus("Selecciona Fecha de compromiso.", "error");
            return;
          }
        }
        await withButtonBusy(
          submitBtn,
          async () => {
            let retroId = form.dataset.retroId || currentRetro?.id;
            if (!retroId) {
              try {
                currentRetro = await postJson("/retros", {
                  celula_id: Number(state.selectedCelulaId),
                  sprint_id: sprintId,
                });
                retroId = currentRetro.id;
                updateShareSection();
                updatePhaseControls();
              } catch {
                setRetroStatus("No se pudo crear la retro.", "error");
                return;
              }
            }
            if (retroId && currentRetro?.fase === "espera" && tipo !== "compromiso") {
              await putJson(`/retros/${retroId}`, { fase: tipo });
            }
            const payload = {
              tipo,
              detalle,
              persona_id: authorSelect?.value ? Number(authorSelect.value) : null,
              asignado_id: assigneeSelect?.value ? Number(assigneeSelect.value) : null,
              fecha_compromiso: dueInput?.value || null,
            };
            try {
              const editId = form.dataset.editId;
              if (editId) {
                await putJson(`/retros/${retroId}/items/${editId}`, payload);
                setRetroStatus("Compromiso actualizado.", "ok");
              } else {
                await postJson(`/retros/${retroId}/items`, payload);
                setRetroStatus("Item agregado.", "ok");
              }
              resetForm();
              initRetrospective();
            } catch (err) {
              const message = err?.message?.includes("{")
                ? err.message
                : "No se pudo guardar.";
              setRetroStatus(message, "error");
            }
          },
          "Guardando..."
        );
      });
    }
  }

  async function initRetroPublic(options = {}) {
    const { skipPolling = false } = options;
    const container = qs("#retro-public");
    if (!container) return;
    const form = qs("#retro-public-form");
    const status = qs("#retro-public-status");
    const title = qs("#retro-public-title");
    const phaseLabel = qs("#retro-public-phase");
    const tipoSelect = qs("#retro-public-type");
    const tipoWrap = qs("#retro-public-type-wrap");
    const detailInput = qs("#retro-public-detail");
    const authorSelect = qs("#retro-public-author");
    const assigneeSelect = qs("#retro-public-assignee");
    const dueInput = qs("#retro-public-due");
    const commitmentFields = qs("#retro-public-commitment");
    const detailLabel = detailInput ? detailInput.closest("label") : null;
    const authorLabel = authorSelect ? authorSelect.closest("label") : null;
    const formActions = form ? form.querySelector(".form-actions") : null;
    const markLabel = (label, className) => {
      if (label && !label.classList.contains(className)) {
        label.classList.add(className);
      }
    };
    markLabel(detailLabel, "retro-public-detail");
    markLabel(authorLabel, "retro-public-author");
    if (tipoWrap && !tipoWrap.classList.contains("retro-public-type")) {
      tipoWrap.classList.add("retro-public-type");
    }
    if (commitmentFields && !commitmentFields.classList.contains("retro-public-commitment")) {
      commitmentFields.classList.add("retro-public-commitment");
    }

    const setStatusText = (message, type = "info") => {
      if (!status) return;
      status.textContent = message || "";
      status.dataset.type = type;
    };

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatusText("Link invalido. Falta token.", "error");
      return;
    }
    let retroInfo;
    let personasLoaded = false;
    const phaseMap = {
      espera: "Esperando inicio del SM.",
      bien: "Ahora: Que hicimos bien",
      mal: "Ahora: Que pudimos hacer mejor",
      compromiso: "Compromisos (solo SM)",
    };
    const fillPersona = (select, placeholder, personas) => {
      if (!select) return;
      select.innerHTML = `<option value=\"\">${placeholder}</option>`;
      personas.forEach((persona) => {
        const opt = document.createElement("option");
        opt.value = persona.id;
        opt.textContent = `${persona.nombre} ${persona.apellido}`.trim();
        select.appendChild(opt);
      });
    };
    const emitPresence = () => {
      const id = authorSelect?.value ? Number(authorSelect.value) : null;
      if (!id) {
        sendRetroPresence("public", { type: "leave" });
        return;
      }
      const name = authorSelect?.selectedOptions?.[0]?.textContent?.trim() || "";
      sendRetroPresence("public", { type: "join", persona_id: id, nombre: name });
    };
    const applyRetroInfo = (info) => {
      retroInfo = info;
      if (title) {
        title.textContent = `Retro · ${retroInfo.celula_nombre} · ${retroInfo.sprint_nombre}`;
      }
      const setPhaseLabel = (state, text) => {
        if (!phaseLabel) return;
        phaseLabel.textContent = text;
        phaseLabel.classList.remove("is-waiting", "is-active", "is-closed");
        if (state === "waiting") phaseLabel.classList.add("is-waiting");
        if (state === "active") phaseLabel.classList.add("is-active");
        if (state === "closed") phaseLabel.classList.add("is-closed");
      };
      if (!personasLoaded) {
        const personas = (retroInfo.personas || []).filter((persona) => {
          if (!persona) return false;
          if ("activo" in persona) return persona.activo !== false;
          if ("activa" in persona) return persona.activa !== false;
          return true;
        });
        fillPersona(authorSelect, "Tu nombre", personas);
        fillPersona(assigneeSelect, "Asignado", personas);
        personasLoaded = true;
      }
      if (authorSelect?.value) {
        emitPresence();
      }
      if (retroInfo.estado !== "abierta") {
        if (form) form.classList.add("retro-public-closed");
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            el.disabled = true;
          });
        }
        setPhaseLabel("closed", "Retro cerrada");
        setStatusText("Retro cerrada por el SM.", "warn");
        return;
      }

      if (retroInfo.fase === "bien" || retroInfo.fase === "mal") {
        if (form) form.classList.remove("retro-public-waiting", "retro-public-closed");
        if (tipoSelect) {
          tipoSelect.value = retroInfo.fase;
          tipoSelect.disabled = true;
        }
        if (tipoWrap) tipoWrap.classList.add("hidden");
        if (commitmentFields) commitmentFields.classList.add("hidden");
        if (detailLabel) detailLabel.classList.remove("hidden");
        if (formActions) formActions.classList.remove("hidden");
        if (authorLabel) authorLabel.classList.remove("hidden");
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            if (
              el.id === "retro-public-detail" ||
              el.id === "retro-public-author" ||
              el.type === "submit"
            ) {
              el.disabled = false;
            } else {
              el.disabled = true;
            }
          });
        }
        if (authorSelect) authorSelect.disabled = false;
        setPhaseLabel("active", `Activo: ${phaseMap[retroInfo.fase] || ""}`);
        setStatusText("", "info");
      } else {
        if (form) form.classList.add("retro-public-waiting");
        if (form) form.classList.remove("retro-public-closed");
        if (tipoWrap) tipoWrap.classList.add("hidden");
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            el.disabled = el.id !== "retro-public-author";
          });
        }
        if (authorSelect) {
          authorSelect.disabled = false;
        }
        if (detailLabel) detailLabel.classList.add("hidden");
        if (formActions) formActions.classList.add("hidden");
        if (commitmentFields) commitmentFields.classList.add("hidden");
        if (authorLabel) authorLabel.classList.remove("hidden");
        setPhaseLabel("waiting", "En espera de inicio");
        setStatusText("Esperando inicio del SM.", "warn");
      }
    };

    const handleRealtimeEvent = (payload) => {
      if (!payload) return;
      if (payload.type === "retro_closed") {
        if (form) form.classList.add("retro-public-closed");
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            el.disabled = true;
          });
        }
        if (phaseLabel) {
          phaseLabel.textContent = "Retro cerrada";
          phaseLabel.classList.remove("is-waiting", "is-active");
          phaseLabel.classList.add("is-closed");
        }
        setStatusText("Retro cerrada por el SM.", "warn");
        return;
      }
      if (payload.type === "retro_updated" && retroInfo) {
        retroInfo = {
          ...retroInfo,
          fase: payload.fase || retroInfo.fase,
          estado: payload.estado || retroInfo.estado,
        };
        applyRetroInfo(retroInfo);
        return;
      }
      loadRetroInfo();
    };

    const loadRetroInfo = async () => {
      try {
        const info = await fetchJson(`/retros/public/${token}`);
        applyRetroInfo(info);
        return info;
      } catch (err) {
        setStatusText("No se pudo cargar la retro.", "error");
        return null;
      }
    };

    const initialInfo = await loadRetroInfo();
    if (!initialInfo) return;
    if (!skipPolling && !window.__retroPublicPoll) {
      window.__retroPublicPoll = window.setInterval(() => {
        if (document.hidden) return;
        loadRetroInfo();
      }, 8000);
    }
    ensureRetroSocket(token, "public", (payload) => {
      handleRealtimeEvent(payload);
    });

    if (authorSelect && !authorSelect.dataset.boundPresence) {
      authorSelect.dataset.boundPresence = "true";
      authorSelect.addEventListener("change", () => {
        emitPresence();
      });
    }

    if (tipoSelect && !tipoSelect.dataset.bound) {
      tipoSelect.dataset.bound = "true";
      tipoSelect.addEventListener("change", () => {
        const isCommitment = tipoSelect.value === "compromiso";
        if (commitmentFields) {
          commitmentFields.classList.toggle("hidden", !isCommitment);
        }
      });
    }

    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = form.querySelector("button[type='submit']");
        if (retroInfo.fase !== "bien" && retroInfo.fase !== "mal") {
          setStatusText("Esperando inicio del SM.", "warn");
          return;
        }
        const tipo = tipoSelect?.value || "";
        const detalle = detailInput?.value || "";
        if (!tipo || !detalle.trim()) {
          setStatusText("Completa tipo y detalle.", "error");
          return;
        }
        const payload = {
          tipo,
          detalle,
          persona_id: authorSelect?.value ? Number(authorSelect.value) : null,
          asignado_id: assigneeSelect?.value ? Number(assigneeSelect.value) : null,
          fecha_compromiso: dueInput?.value || null,
        };
        await withButtonBusy(
          submitBtn,
          async () => {
            try {
              await postJson(`/retros/public/${token}/items`, payload);
              if (detailInput) detailInput.value = "";
              if (assigneeSelect) assigneeSelect.value = "";
              if (dueInput) dueInput.value = "";
              if (tipoSelect) tipoSelect.value = "bien";
              if (commitmentFields) commitmentFields.classList.add("hidden");
              setStatusText("Gracias, tu aporte fue registrado.", "ok");
              emitPresence();
            } catch {
              setStatusText("No se pudo guardar.", "error");
            }
          },
          "Enviando..."
        );
      });
    }

  }

  function groupSprintItems(items, sprints) {
    const sprintById = new Map((sprints || []).map((sprint) => [sprint.id, sprint]));
    const sprintRankByName = new Map(
      (sprints || []).map((sprint) => [sprint.nombre, getSprintRank(sprint.nombre)])
    );
    const getSprintName = (id) => sprintById.get(id)?.nombre || "";
    const getSprintRankById = (id) => {
      const sprint = sprintById.get(id);
      return sprint ? getSprintRank(sprint.nombre) : null;
    };
    const groups = new Map();
    items.forEach((item) => {
      const issueKey = String(item.issue_key || "").trim();
      if (!issueKey) return;
      const key = `${item.celula_id || "0"}:${issueKey.toLowerCase()}`;
      const sprintName = getSprintName(item.sprint_id);
      const sprintRank = getSprintRankById(item.sprint_id) ?? getSprintRank(sprintName);
      const group = groups.get(key);
      if (!group) {
        groups.set(key, {
          item,
          sprintNames: sprintName ? [sprintName] : [],
          primaryRank: sprintRank,
          primarySprint: sprintName,
        });
        return;
      }
      if (sprintName && !group.sprintNames.includes(sprintName)) {
        group.sprintNames.push(sprintName);
      }
      const currentRank = group.primaryRank;
      if (sprintRank !== null && (currentRank === null || sprintRank > currentRank)) {
        group.item = item;
        group.primaryRank = sprintRank;
        group.primarySprint = sprintName;
      } else if (currentRank === null && sprintName && !group.primarySprint) {
        group.item = item;
        group.primarySprint = sprintName;
      }
    });
    return [...groups.values()].map((group) => {
      const primarySprint = group.primarySprint || getSprintName(group.item.sprint_id);
      const previous = (group.sprintNames || []).filter(
        (name) => name && name !== primarySprint
      );
      previous.sort((a, b) => {
        const aRank = sprintRankByName.get(a);
        const bRank = sprintRankByName.get(b);
        if (aRank !== null && bRank !== null) return bRank - aRank;
        return a.localeCompare(b, "es", { sensitivity: "base" });
      });
      return {
        ...group.item,
        sprints_anteriores: previous,
      };
    });
  }

  function renderAdmin(base) {
    if (!qs("#admin-panel")) return;
    const adminStatus = qs("#admin-status");
    const adminSearch = qs("#admin-search");
    const userForm = qs("#form-usuario");
    const userStatus = qs("#status-usuario");
    const userCancel = qs("#usuario-cancel");
    const celulaForm = qs("#form-celula");
    const personaForm = qs("#form-persona");
    const sprintForm = qs("#form-sprint");
    const feriadoForm = qs("#form-feriado");
    const eventoForm = qs("#form-evento");
    const tipoForm = qs("#form-evento-tipo");

    const celulaMap = Object.fromEntries(base.cells.map((c) => [c.id, c.nombre]));
    const tipoMap = Object.fromEntries(base.tipos.map((t) => [t.id, t.nombre]));
    const personaMap = Object.fromEntries(
      base.personas.map((p) => [p.id, `${p.nombre} ${p.apellido}`])
    );
    const sprintMap = Object.fromEntries(base.sprints.map((s) => [s.id, s.nombre]));

    if (adminSearch) {
      adminSearch.value = state.adminSearch;
      if (!adminSearch.dataset.bound) {
        adminSearch.dataset.bound = "true";
        adminSearch.addEventListener("input", () => {
          state.adminSearch = adminSearch.value;
          if (state.base) renderAdmin(state.base);
        });
      }
    }

    const editIcon =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L18.8 8.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.4l-2.34-2.34a1 1 0 0 0-1.4 0l-1.82 1.82 3.75 3.75 1.81-1.83z"/></svg>';
    const trashIcon =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h2v10H7zm4 0h2v10h-2zm4 0h2v10h-2zM9 4h6l1 2h4v2H4V6h4l1-2zm-3 6h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10z"/></svg>';
    const toggleIcon =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 5v5.59l3.3 3.3-1.42 1.42L11 13.4V7z"/></svg>';

    function setAdminStatus(text, type = "info") {
      if (!adminStatus) return;
      adminStatus.textContent = text;
      adminStatus.dataset.type = type;
    }

    const ensureBulkDeleteButton = (tableKey, label, onDelete) => {
      const container = qs(`#${tableKey}`);
      const card = container?.closest(".admin-card");
      const head = card?.querySelector(".card-head");
      if (!head) return;
      let btn = head.querySelector(`[data-bulk="${tableKey}"]`);
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost small";
        btn.dataset.bulk = tableKey;
        btn.textContent = label;
        head.appendChild(btn);
        btn.addEventListener("click", onDelete);
      }
    };

    const canEditCelula = !!celulaForm;
    const canEditPersona = !!personaForm;
    const canEditSprint = !!sprintForm;
    const canEditFeriado = !!feriadoForm;
    const canEditEvento = !!eventoForm;
    const canEditTipo = !!tipoForm;

    const query = state.adminSearch.trim().toLowerCase();
    const matchesQuery = (values) => {
      if (!query) return true;
      return values.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(query)
      );
    };

    const personasFiltradas = state.selectedCelulaId
      ? base.personas.filter((persona) =>
          (persona.celulas || []).some(
            (celula) => String(celula.id) === state.selectedCelulaId
          )
        )
      : base.personas;
    const sprintsFiltrados = state.selectedCelulaId
      ? base.sprints.filter((sprint) => String(sprint.celula_id) === state.selectedCelulaId)
      : base.sprints;
    const eventosFiltrados = state.selectedCelulaId
      ? base.eventos.filter((evento) => {
          const persona = base.personas.find((p) => p.id === evento.persona_id);
          const personaMatch = (persona?.celulas || []).some(
            (celula) => String(celula.id) === state.selectedCelulaId
          );
          const sprintMatch = evento.sprint_id
            ? sprintsFiltrados.some((sprint) => sprint.id === evento.sprint_id)
            : false;
          return personaMatch || sprintMatch;
        })
      : base.eventos;
    const celulasBuscadas = (state.selectedCelulaId
      ? base.cells.filter((celula) => String(celula.id) === state.selectedCelulaId)
      : base.cells
    ).filter((celula) => matchesQuery([celula.id, celula.nombre, celula.jira_codigo]));
    const personasBuscadas = personasFiltradas.filter((persona) => {
      const celulasLabel = (persona.celulas || []).map((c) => c.nombre).join(", ");
      return matchesQuery([
        persona.id,
        persona.nombre,
        persona.apellido,
        persona.jira_usuario,
        persona.rol,
        persona.fecha_cumple,
        persona.capacidad_diaria_horas,
        celulasLabel,
      ]);
    });
    const personasOrdenadas = [...personasBuscadas].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", {
        sensitivity: "base",
      })
    );
    const sprintsBuscados = sprintsFiltrados.filter((sprint) =>
      matchesQuery([
        sprint.id,
        sprint.nombre,
        sprint.fecha_inicio,
        sprint.fecha_fin,
        celulaMap[sprint.celula_id],
      ])
    );
    const feriadosFiltrados = state.selectedCelulaId
      ? (base.feriados || []).filter(
          (feriado) =>
            !feriado.celula_id || String(feriado.celula_id) === state.selectedCelulaId
        )
      : base.feriados || [];
    const feriadosSet = new Set(feriadosFiltrados.map((feriado) => feriado.fecha).filter(Boolean));
    const countEventDays = (evento) => {
      const start = parseDateOnly(evento.fecha_inicio);
      const end = parseDateOnly(evento.fecha_fin);
      if (!start || !end || end < start) return 0;
      const factor = evento.jornada === "completo" ? 1 : 0.5;
      let count = 0;
      const cursor = new Date(start);
      while (cursor <= end) {
        const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
        const key = formatISO(cursor);
        if (!isWeekend && !feriadosSet.has(key)) {
          count += factor;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return count;
    };
    const feriadosBuscados = feriadosFiltrados.filter((feriado) =>
      matchesQuery([
        feriado.id,
        feriado.nombre,
        feriado.fecha,
        feriado.tipo,
        celulaMap[feriado.celula_id],
      ])
    );
    const eventosBuscados = eventosFiltrados.filter((evento) =>
      matchesQuery([
        evento.id,
        personaMap[evento.persona_id],
        tipoMap[evento.tipo_evento_id],
        sprintMap[evento.sprint_id],
        evento.fecha_inicio,
        evento.fecha_fin,
        evento.jornada,
        evento.descripcion,
      ])
    );
    const tiposBuscados = (base.tipos || []).filter((tipo) =>
      matchesQuery([
        tipo.nombre,
        tipo.impacto_capacidad,
        tipo.planificado ? "si" : "no",
        tipo.activo ? "si" : "no",
      ])
    );
    const groupedSprintItems = groupSprintItems(base.sprintItems || [], base.sprints || []);
    const sprintItemsFiltrados = state.selectedCelulaId
      ? groupedSprintItems.filter(
          (item) => String(item.celula_id) === String(state.selectedCelulaId)
        )
      : groupedSprintItems;
    const sprintItemsBuscados = sprintItemsFiltrados.filter((item) =>
      matchesQuery([
        item.issue_key,
        item.issue_type,
        item.summary,
        item.status,
        item.story_points,
        personaMap[item.persona_id],
        item.assignee_nombre,
        sprintMap[item.sprint_id],
        (item.sprints_anteriores || []).join(", "),
      ])
    );
    const releaseItemsFiltrados = state.selectedCelulaId
      ? (base.releaseItems || []).filter(
          (item) => String(item.celula_id) === String(state.selectedCelulaId)
        )
      : base.releaseItems || [];
    const releaseItemsBuscados = releaseItemsFiltrados.filter((item) =>
      matchesQuery([
        item.issue_key,
        item.issue_type,
        item.summary,
        item.status,
        item.story_points,
        personaMap[item.persona_id],
        item.assignee_nombre,
        item.sprint_nombre,
        item.release_tipo,
      ])
    );
    const usuariosBuscados = (base.usuarios || []).filter((usuario) =>
      matchesQuery([usuario.username, usuario.rol, usuario.activo ? "si" : "no"])
    );

    if (userForm && !userForm.dataset.bound) {
      userForm.dataset.bound = "true";
      const setUserStatus = (text, type = "info") => {
        if (!userStatus) return;
        userStatus.textContent = text || "";
        userStatus.dataset.type = type;
      };
      const resetUserForm = () => {
        userForm.reset();
        if (userForm.username) {
          userForm.username.disabled = false;
        }
        if (userForm.rol) {
          userForm.rol.value = "member";
        }
        if (userForm.activo) {
          userForm.activo.value = "true";
        }
        if (userForm.password) {
          userForm.password.value = "";
        }
        resetFormMode(userForm, "Crear usuario");
        setUserStatus("");
      };
      resetUserForm();

      userForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const mode = userForm.dataset.mode || "create";
        const editId = userForm.dataset.editId;
        const username = (userForm.username?.value || "").trim().toLowerCase();
        const password = userForm.password?.value || "";
        const rol = (userForm.rol?.value || "member").trim().toLowerCase();
        const activo = userForm.activo?.value === "true";

        if (mode === "create" && (!username || !password)) {
          setUserStatus("Usuario y password son obligatorios.", "error");
          return;
        }
        if (mode === "edit" && !editId) {
          setUserStatus("Selecciona un usuario para editar.", "error");
          return;
        }
        const payload = { rol, activo };
        if (mode === "create") {
          payload.username = username;
          payload.password = password;
        } else if (password) {
          payload.password = password;
        }
        try {
          if (mode === "create") {
            await postJson("/usuarios", payload);
            setAdminStatus("Usuario creado.", "ok");
          } else {
            await putJson(`/usuarios/${editId}`, payload);
            setAdminStatus("Usuario actualizado.", "ok");
          }
          resetUserForm();
          await reloadAll();
        } catch (err) {
          let message = err?.message || "No se pudo guardar el usuario.";
          try {
            const parsed = JSON.parse(message);
            if (parsed?.detail) {
              message = parsed.detail;
            }
          } catch {
            // ignore
          }
          setUserStatus(message, "error");
        }
      });

      if (userCancel) {
        userCancel.addEventListener("click", () => {
          resetUserForm();
        });
      }
    }

    renderAdminTable(
      qs("#admin-usuarios"),
      usuariosBuscados,
      [
        { key: "_index", label: "#" },
        { key: "username", label: "Usuario" },
        { key: "rol", label: "Rol" },
        {
          key: "activo",
          label: "Activo",
          render: (row) => (row.activo ? "Si" : "No"),
        },
      ],
      [
        {
          label: "Estado",
          icon: toggleIcon,
          onClick: async (row) => {
            const action = row.activo ? "desactivar" : "activar";
            if (!confirm(`Deseas ${action} el usuario ${row.username}?`)) return;
            try {
              await putJson(`/usuarios/${row.id}`, { activo: !row.activo });
              setAdminStatus("Estado actualizado.", "ok");
              await reloadAll();
            } catch {
              setAdminStatus("Error al actualizar usuario.", "error");
            }
          },
        },
        {
          label: "Editar",
          icon: editIcon,
          onClick: (row) => {
            if (!userForm) return;
            userForm.username.value = row.username;
            userForm.username.disabled = true;
            userForm.password.value = "";
            if (userForm.rol) {
              userForm.rol.value = row.rol || "member";
            }
            if (userForm.activo) {
              userForm.activo.value = row.activo ? "true" : "false";
            }
            setFormMode(userForm, "edit", row.id, "Actualizar usuario");
            userForm.scrollIntoView({ behavior: "smooth", block: "center" });
          },
        },
      ]
    );

    renderAdminTable(
      qs("#admin-celulas"),
      celulasBuscadas,
      [
        { key: "_index", label: "#" },
        { key: "nombre", label: "Nombre" },
        { key: "jira_codigo", label: "Codigo JIRA" },
      ],
      [
        {
          label: "Eliminar",
          icon: trashIcon,
          onClick: async (row) => {
            if (!confirm(`Eliminar celula ${row.nombre}?`)) return;
            try {
              const res = await fetchWithFallback(`/celulas/${row.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("No se pudo eliminar");
              setAdminStatus("Celula eliminada.", "ok");
              await reloadAll();
            } catch {
              setAdminStatus("Error al eliminar celula.", "error");
            }
          },
        },
        ...(canEditCelula
          ? [
              {
                label: "Editar",
                icon: editIcon,
                onClick: (row) => {
                  celulaForm.nombre.value = row.nombre;
                  if (celulaForm.jira_codigo) {
                    celulaForm.jira_codigo.value = row.jira_codigo || "";
                  }
                  setFormMode(celulaForm, "edit", row.id, "Actualizar celula");
                  openAdminModal(celulaForm, "Editar celula");
                },
              },
            ]
          : []),
      ]
    );

    renderAdminTable(
      qs("#admin-personas"),
      personasOrdenadas,
      [
        { key: "_index", label: "#" },
        { key: "nombre", label: "Nombre" },
        { key: "apellido", label: "Apellido" },
        { key: "jira_usuario", label: "JIRA" },
        { key: "rol", label: "Rol" },
        {
          key: "activo",
          label: "Activo",
          render: (row) => (row.activo ? "Si" : "No"),
        },
        {
          key: "fecha_cumple",
          label: "Cumple",
          render: (row) => {
            if (!row.fecha_cumple) return "";
            const [, mes, dia] = row.fecha_cumple.split("-");
            if (!mes || !dia) return "";
            return `${dia}/${mes}`;
          },
        },
        {
          key: "celulas",
          label: "Celulas",
          render: (row) => (row.celulas || []).map((c) => c.nombre).join(", "),
        },
      ],
      [
        {
          label: "Eliminar",
          icon: trashIcon,
          onClick: async (row) => {
            if (!confirm(`Eliminar persona ${row.nombre} ${row.apellido}?`)) return;
            try {
              const res = await fetchWithFallback(`/personas/${row.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("No se pudo eliminar");
              setAdminStatus("Persona eliminada.", "ok");
              await reloadAll();
            } catch {
              setAdminStatus("Error al eliminar persona.", "error");
            }
          },
        },
        ...(canEditPersona
          ? [
              {
                label: "Editar",
                icon: editIcon,
                onClick: (row) => {
                  personaForm.nombre.value = row.nombre;
                  personaForm.apellido.value = row.apellido;
                  if (personaForm.jira_usuario) {
                    personaForm.jira_usuario.value = row.jira_usuario || "";
                  }
            personaForm.rol.value = row.rol;
            personaForm.capacidad.value = row.capacidad_diaria_horas;
            if (row.fecha_cumple) {
              const [, mes, dia] = row.fecha_cumple.split("-");
              if (personaForm.cumple_mes) {
                personaForm.cumple_mes.value = mes;
              }
              if (personaForm.cumple_dia) {
                personaForm.cumple_dia.value = dia;
              }
            } else {
              if (personaForm.cumple_mes) {
                personaForm.cumple_mes.value = "";
              }
              if (personaForm.cumple_dia) {
                personaForm.cumple_dia.value = "";
              }
            }
            const selected = new Set((row.celulas || []).map((c) => String(c.id)));
            Array.from(personaForm.celulas.options).forEach((opt) => {
              opt.selected = selected.has(opt.value);
            });
            const sinCelulaEditToggle =
              personaForm.sin_celula || personaForm.querySelector('input[name="sin_celula"]');
            if (sinCelulaEditToggle) {
              sinCelulaEditToggle.checked = !selected.size;
              if (personaForm.celulas) {
                personaForm.celulas.disabled = !selected.size;
              }
            }
            if (personaForm.activo) {
              personaForm.activo.value = row.activo ? "true" : "false";
            }
                  setFormMode(personaForm, "edit", row.id, "Actualizar datos");
                  personaForm.dataset.mode = "edit";
                  personaForm.dataset.editId = String(row.id);
                  const submitBtn = personaForm.querySelector("button[type='submit']");
                  if (submitBtn) {
                    submitBtn.textContent = "Actualizar datos";
                  }
                  openAdminModal(personaForm, "Editar persona");
                },
              },
            ]
          : []),
      ]
    );

    renderAdminTable(
      qs("#admin-sprints"),
      sprintsBuscados,
      [
        { key: "_index", label: "#" },
        { key: "nombre", label: "Nombre" },
        {
          key: "celula_id",
          label: "Celula",
          render: (row) => celulaMap[row.celula_id] || row.celula_id,
        },
        { key: "fecha_inicio", label: "Inicio", render: (row) => formatDate(row.fecha_inicio) },
        { key: "fecha_fin", label: "Fin", render: (row) => formatDate(row.fecha_fin) },
      ],
      [
        {
          label: "Eliminar",
          icon: trashIcon,
          onClick: async (row) => {
            if (!confirm(`Eliminar sprint ${row.nombre}?`)) return;
            try {
              const res = await fetchWithFallback(`/sprints/${row.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("No se pudo eliminar");
              setAdminStatus("Sprint eliminado.", "ok");
              await reloadAll();
            } catch {
              setAdminStatus("Error al eliminar sprint.", "error");
            }
          },
        },
        ...(canEditSprint
          ? [
              {
                label: "Editar",
                icon: editIcon,
                onClick: (row) => {
                  sprintForm.nombre.value = row.nombre;
                  sprintForm.celula.value = String(row.celula_id);
                  sprintForm.fecha_inicio.value = row.fecha_inicio;
                  sprintForm.fecha_fin.value = row.fecha_fin;
                  setMultiDateRange(sprintForm, row.fecha_inicio, row.fecha_fin);
                  setFormMode(sprintForm, "edit", row.id, "Actualizar sprint");
                  openAdminModal(sprintForm, "Editar sprint");
                },
              },
            ]
          : []),
      ]
    );

    renderAdminTable(
      qs("#admin-feriados"),
      feriadosBuscados,
      [
        { key: "_index", label: "#" },
        { key: "fecha", label: "Fecha", render: (row) => formatDate(row.fecha) },
        { key: "nombre", label: "Nombre" },
      ],
      [
        {
          label: "Eliminar",
          icon: trashIcon,
          onClick: async (row) => {
            if (!confirm(`Eliminar feriado ${row.nombre}?`)) return;
            try {
              const res = await fetchWithFallback(`/feriados/${row.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("No se pudo eliminar");
              setAdminStatus("Feriado eliminado.", "ok");
              await reloadAll();
            } catch {
              setAdminStatus("Error al eliminar feriado.", "error");
            }
          },
        },
        ...(canEditFeriado
          ? [
              {
                label: "Editar",
                icon: editIcon,
                onClick: (row) => {
                  feriadoForm.fecha.value = row.fecha;
                  feriadoForm.nombre.value = row.nombre;
                  feriadoForm.tipo.value = row.tipo;
                  if (row.tipo === "interno") {
                    state.selectedCelulaId = String(row.celula_id || "");
                    const selector = qs("#cell-filter");
                    if (selector) selector.value = state.selectedCelulaId;
                  }
                  setFormMode(feriadoForm, "edit", row.id, "Actualizar feriado");
                  openAdminModal(feriadoForm, "Editar feriado");
                },
              },
            ]
          : []),
      ]
    );

    renderAdminTable(
      qs("#admin-eventos-tipo"),
      tiposBuscados,
      [
        { key: "_index", label: "#" },
        { key: "nombre", label: "Nombre" },
        {
          key: "impacto_capacidad",
          label: "Impacto",
          render: (row) => `${row.impacto_capacidad}%`,
        },
        {
          key: "planificado",
          label: "Planificado",
          render: (row) => (row.planificado ? "Si" : "No"),
        },
        {
          key: "activo",
          label: "Activo",
          render: (row) => (row.activo ? "Si" : "No"),
        },
      ],
      [
        {
          label: "Eliminar",
          icon: trashIcon,
          onClick: async (row) => {
            if (!confirm(`Eliminar tipo ${row.nombre}?`)) return;
            try {
              const res = await fetchWithFallback(`/eventos-tipo/${row.id}`, { method: "DELETE" });
              if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "No se pudo eliminar");
              }
              setAdminStatus("Tipo de evento eliminado.", "ok");
              await reloadAll();
            } catch (err) {
              const message = err?.message?.includes("Tipo de evento en uso")
                ? "Tipo en uso. Desactivalo en su lugar."
                : "Error al eliminar tipo.";
              setAdminStatus(message, "error");
            }
          },
        },
        ...(canEditTipo
          ? [
              {
                label: "Editar",
                icon: editIcon,
                onClick: (row) => {
                  tipoForm.nombre.value = row.nombre;
                  tipoForm.impacto.value = row.impacto_capacidad;
                  tipoForm.planificado.value = row.planificado ? "true" : "false";
                  tipoForm.activo.value = row.activo ? "true" : "false";
                  setFormMode(tipoForm, "edit", row.id, "Actualizar tipo");
                  openAdminModal(tipoForm, "Editar tipo");
                },
              },
            ]
          : []),
      ]
    );

    renderAdminTable(
      qs("#admin-eventos"),
      eventosBuscados,
      [
        { key: "_index", label: "#" },
        { key: "persona_id", label: "Persona", render: (row) => personaMap[row.persona_id] || row.persona_id },
        {
          key: "tipo_evento_id",
          label: "Tipo",
          render: (row) => tipoMap[row.tipo_evento_id] || row.tipo_evento_id,
        },
        { key: "fecha_inicio", label: "Inicio", render: (row) => formatDate(row.fecha_inicio) },
        { key: "fecha_fin", label: "Fin", render: (row) => formatDate(row.fecha_fin) },
        { key: "descripcion", label: "Descripcion", render: (row) => row.descripcion || "" },
        {
          key: "total_dias",
          label: "Total dias",
          render: (row) => {
            const total = countEventDays(row);
            return Number.isInteger(total) ? String(total) : total.toFixed(1);
          },
        },
      ],
      [
        {
          label: "Eliminar",
          icon: trashIcon,
          onClick: async (row) => {
            if (!confirm(`Eliminar evento ${row.id}?`)) return;
            try {
              const res = await fetchWithFallback(`/eventos/${row.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("No se pudo eliminar");
              setAdminStatus("Evento eliminado.", "ok");
              await reloadAll();
            } catch {
              setAdminStatus("Error al eliminar evento.", "error");
            }
          },
        },
        ...(canEditEvento
          ? [
              {
                label: "Editar",
                icon: editIcon,
                onClick: (row) => {
                  eventoForm.persona.value = String(row.persona_id);
                  eventoForm.tipo.value = String(row.tipo_evento_id);
                  eventoForm.sprint.value = row.sprint_id ? String(row.sprint_id) : "";
                  eventoForm.fecha_inicio.value = row.fecha_inicio;
                  eventoForm.fecha_fin.value = row.fecha_fin;
                  setMultiDateRange(eventoForm, row.fecha_inicio, row.fecha_fin);
                  eventoForm.jornada.value = row.jornada;
                  eventoForm.descripcion.value = row.descripcion || "";
                  setFormMode(eventoForm, "edit", row.id, "Actualizar evento");
                  openAdminModal(eventoForm, "Editar evento");
                },
              },
            ]
          : []),
      ]
    );

    renderAdminTable(
      qs("#admin-release-items"),
      releaseItemsBuscados,
      [
        {
          key: "_select",
          label: "Sel",
          render: (row) => buildAdminRowCheckbox(row, "admin-release-items"),
        },
        { key: "_index", label: "#" },
        { key: "issue_key", label: "Issue" },
        { key: "issue_type", label: "Tipo" },
        { key: "summary", label: "Resumen" },
        {
          key: "quarter",
          label: "Quarter",
          render: (row) => row.quarter || "",
        },
        { key: "status", label: "Estado" },
        {
          key: "story_points",
          label: "Story Points",
          render: (row) => (row.story_points != null ? String(row.story_points) : ""),
        },
        {
          key: "assignee",
          label: "Asignado",
          render: (row) =>
            personaMap[row.persona_id] || row.assignee_nombre || "",
        },
        {
          key: "sprint_nombre",
          label: "Sprint",
          render: (row) => row.sprint_nombre || "",
        },
        {
          key: "release_tipo",
          label: "Tipo release",
          render: (row) => row.release_tipo || "",
        },
      ],
      []
    );

    ensureBulkDeleteButton("admin-release-items", "Eliminar seleccionados", async () => {
      const selection = getAdminSelection("admin-release-items");
      if (!selection.size) {
        setAdminStatus("Selecciona al menos un release.", "error");
        return;
      }
      if (!confirm(`Eliminar ${selection.size} release(s) seleccionados?`)) return;
      try {
        setAdminStatus("Eliminando releases...", "info");
        for (const id of Array.from(selection)) {
          const res = await fetchWithFallback(`/release-items/${id}`, { method: "DELETE" });
          if (res.status === 404) {
            selection.delete(id);
            continue;
          }
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || "No se pudo eliminar release.");
          }
        }
        selection.clear();
        setAdminStatus("Releases eliminados.", "ok");
        await reloadAll();
      } catch (err) {
        setAdminStatus(err.message || "Error al eliminar releases.", "error");
      }
    });

    renderAdminTable(
      qs("#admin-sprint-items"),
      sprintItemsBuscados,
      [
        {
          key: "_select",
          label: "Sel",
          render: (row) => buildAdminRowCheckbox(row, "admin-sprint-items"),
        },
        { key: "_index", label: "#" },
        { key: "issue_key", label: "Issue" },
        { key: "issue_type", label: "Tipo" },
        { key: "summary", label: "Resumen" },
        { key: "status", label: "Estado" },
        {
          key: "story_points",
          label: "Story Points",
          render: (row) => (row.story_points != null ? String(row.story_points) : ""),
        },
        {
          key: "assignee",
          label: "Asignado",
          render: (row) =>
            personaMap[row.persona_id] || row.assignee_nombre || "",
        },
        {
          key: "sprint",
          label: "Sprint",
          render: (row) => sprintMap[row.sprint_id] || "",
        },
        {
          key: "sprints_anteriores",
          label: "Sprints anteriores",
          render: (row) => (row.sprints_anteriores || []).join(", "),
        },
      ],
      []
    );

    ensureBulkDeleteButton("admin-sprint-items", "Eliminar seleccionados", async () => {
      const selection = getAdminSelection("admin-sprint-items");
      if (!selection.size) {
        setAdminStatus("Selecciona al menos un item.", "error");
        return;
      }
      if (!confirm(`Eliminar ${selection.size} item(s) seleccionados?`)) return;
      try {
        setAdminStatus("Eliminando items...", "info");
        for (const id of Array.from(selection)) {
          const res = await fetchWithFallback(`/sprint-items/${id}`, { method: "DELETE" });
          if (res.status === 404) {
            selection.delete(id);
            continue;
          }
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || "No se pudo eliminar item.");
          }
        }
        selection.clear();
        setAdminStatus("Items eliminados.", "ok");
        await reloadAll();
      } catch (err) {
        setAdminStatus(err.message || "Error al eliminar items.", "error");
      }
    });
  }

  async function reloadAll() {
    const base = await loadBase();
    state.base = base;
    state.dailyCapacityCache = {};
    initForms(base);
    renderAdmin(base);
    if (qs("#dashboard")) {
      const dashboard = await loadDashboardData(base, state.selectedCelulaId);
      renderDashboard(dashboard);
      initSprintFilter(base);
    }
    initCelulaSelector(base);
    initDaily();
    initReleaseTable();
    initOneToOne();
    initRetrospective();
    initPokerPlanning();
  }

  async function init() {
    initDataEntrySections();
    initDayModal();
    customizeNavbar();
    ensureTaskMenu();
    try {
      if (isPublicRetroView()) {
        await initRetroPublic();
        return;
      }
      if (isPublicPokerView()) {
        await initPokerPublic();
        return;
      }
      const user = await initAuth();
      customizeNavbar(user);
      if (!user) return;
      const base = await loadBase();
      state.base = base;
      state.dailyCapacityCache = {};
      if (qs("#dashboard")) {
        const dashboard = await loadDashboardData(base, state.selectedCelulaId);
        renderDashboard(dashboard);
        initSprintFilter(base);
      }
      initForms(base);
      renderAdmin(base);
      initCelulaSelector(base);
      initDataEntrySections();
      initDaily();
      initReleaseTable();
      initOneToOne();
      initRetrospective();
      initPokerPlanning();
    } catch (err) {
      // Fallback: no API
      console.error("Dashboard init error:", err);
      const dashboard = qs("#dashboard");
      if (dashboard) {
        dashboard.innerHTML =
          `<p class="empty">No se pudo cargar el dashboard. Verifica el API.</p>
           <p class="empty">${err?.message || "Error desconocido."}</p>`;
      }
      const message = err?.message || "No se pudo cargar datos del API.";
      setStatus("#status-celula", message, "error");
      setStatus("#status-persona", message, "error");
      setStatus("#status-sprint", message, "error");
      setStatus("#status-feriado", message, "error");
      setStatus("#status-evento", message, "error");
      toggleMenuVisibility();
    }
  }

  async function initPokerPlanning(options = {}) {
    const { skipPolling = false } = options;
    const panel = qs("#poker-panel");
    if (!panel || !state.base) return;
    const base = state.base;
    const status = qs("#poker-status");
    const shareUrl = qs("#poker-share-url");
    const shareQr = qs("#poker-share-qr");
    const copyBtn = qs("#poker-share-copy");
    const shareStatus = qs("#poker-share-status");
    const shareBlock = shareUrl ? shareUrl.closest(".retro-share") : null;
    const qrBlock = shareQr ? shareQr.closest(".retro-qr") : null;
    const createBtn = qs("#poker-create");
    const startBtn = qs("#poker-start");
    const revealBtn = qs("#poker-reveal");
    const closeBtn = qs("#poker-close");
    const phaseStatus = qs("#poker-phase-status");
    const connectedCount = qs("#poker-connected-count");
    const connectedList = qs("#poker-connected-list");
    const resultsTable = qs("#poker-results-table");

    const setPokerStatus = (message, type = "info") => {
      if (!status) return;
      status.textContent = message || "";
      status.dataset.type = type;
    };

    const personasActivas = filterActivePersonas(base.personas || []);
    const personasFiltradas = state.selectedCelulaId
      ? personasActivas.filter((persona) =>
          (persona.celulas || []).some(
            (celula) => String(celula.id) === String(state.selectedCelulaId)
          )
        )
      : [];
    const personaById = new Map(
      personasFiltradas.map((persona) => [
        String(persona.id),
        `${persona.nombre} ${persona.apellido}`.trim(),
      ])
    );
    const personaNameSet = new Set(
      personasFiltradas
        .map((persona) => normalizeText(`${persona.nombre} ${persona.apellido}`.trim()))
        .filter(Boolean)
    );
    const filterPresence = (personas) =>
      (personas || []).filter((persona) => {
        if (!persona) return false;
        if (persona.persona_id && personaById.has(String(persona.persona_id))) return true;
        const name = normalizeText(persona.nombre || "");
        return name && personaNameSet.has(name);
      });

    const renderPresence = (payload, votedIds = new Set()) => {
      if (!connectedCount || !connectedList) return;
      const personas = Array.isArray(payload?.personas)
        ? payload.personas
        : Array.isArray(state.pokerPresence?.personas)
          ? state.pokerPresence.personas
          : [];
      const filtered = filterPresence(personas);
      connectedCount.textContent = String(filtered.length);
      connectedList.innerHTML = "";
      if (!filtered.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "Sin conexiones";
        connectedList.appendChild(li);
        return;
      }
      filtered.forEach((persona) => {
        const li = document.createElement("li");
        li.className = "poker-user";
        li.textContent = persona.nombre || "";
        if (persona.persona_id && votedIds.has(String(persona.persona_id))) {
          li.classList.add("is-voted");
        }
        connectedList.appendChild(li);
      });
    };

    const buildVoteClass = (value, counts) => {
      if (!value) return "poker-vote-muted";
      const unique = counts.size;
      if (unique <= 1) return "poker-vote-all";
      const values = Array.from(counts.values());
      const max = Math.max(...values);
      const min = Math.min(...values);
      const count = counts.get(value) || 0;
      if (count === max) return "poker-vote-major";
      if (count === min) return "poker-vote-minor";
      return "poker-vote-mid";
    };

    const renderResults = (session, votes, presencePayload) => {
      if (!resultsTable) return;
      const showValues = session?.fase === "revelado";
      const voteMap = new Map(votes.map((vote) => [String(vote.persona_id), vote.valor]));
      const counts = new Map();
      votes.forEach((vote) => {
        counts.set(vote.valor, (counts.get(vote.valor) || 0) + 1);
      });
      const personas = filterPresence(presencePayload?.personas || []);
      resultsTable.innerHTML = "";
      if (!personas.length) {
        resultsTable.innerHTML = '<p class="empty">Sin datos</p>';
        return;
      }
      const grid = document.createElement("div");
      grid.className = "poker-results-grid";
      if (showValues) grid.classList.add("is-revealed");
      personas.forEach((persona) => {
        const personaId = String(persona.persona_id || "");
        const nombre = personaById.get(personaId) || persona.nombre || "";
        const value = voteMap.get(personaId) ?? null;
        const badgeClass = buildVoteClass(value, counts);
        const card = document.createElement("div");
        card.className = "poker-result-card";
        const inner = document.createElement("div");
        inner.className = "poker-result-inner";
        const front = document.createElement("div");
        front.className = "poker-result-face poker-result-front";
        front.innerHTML = `<span class="poker-result-label">${nombre}</span>`;
        const back = document.createElement("div");
        back.className = `poker-result-face poker-result-back ${badgeClass}`;
        const valueText = value != null ? String(value) : "—";
        back.innerHTML = `<span class="poker-result-value">${valueText}</span><span class="poker-result-label">${nombre}</span>`;
        inner.appendChild(front);
        inner.appendChild(back);
        card.appendChild(inner);
        grid.appendChild(card);
      });
      resultsTable.appendChild(grid);
    };

    let sessions = [];
    let currentSession = null;
    let votes = [];
    let presencePayload = state.pokerPresence;

    if (!state.selectedCelulaId) {
      setPokerStatus("Selecciona una celula para iniciar Poker Planning.", "warn");
      state.pokerSessionId = "";
      state.pokerPresence = { total: 0, personas: [] };
      state.pokerVotes = [];
      presencePayload = state.pokerPresence;
    } else {
      try {
        sessions = await fetchJson(`/poker/sessions?celula_id=${state.selectedCelulaId}`);
      } catch {
        setPokerStatus("No se pudo cargar Poker Planning.", "error");
        sessions = [];
      }
    }

    if (sessions.length) {
      currentSession = sessions.find((sesion) => sesion.estado === "abierta") || null;
      if (state.pokerSessionId) {
        currentSession =
          sessions.find((sesion) => String(sesion.id) === state.pokerSessionId) || currentSession;
      }
      if (currentSession) {
        state.pokerSessionId = String(currentSession.id);
      } else {
        state.pokerSessionId = "";
      }
    }

    if (currentSession) {
      try {
        const detail = await fetchJson(`/poker/sessions/${currentSession.id}`);
        votes = detail.votos || [];
        state.pokerVotes = votes;
      } catch {
        votes = [];
      }
      try {
        presencePayload = await fetchJson(`/poker/sessions/${currentSession.id}/presence`);
        state.pokerPresence = presencePayload;
      } catch {
        presencePayload = state.pokerPresence;
      }
    } else {
      state.pokerPresence = { total: 0, personas: [] };
      state.pokerVotes = [];
    }

    const updateShareSection = () => {
      if (!shareUrl) return;
      const isOpen = currentSession && currentSession.estado !== "cerrada";
      if (shareBlock) shareBlock.classList.toggle("hidden", !isOpen);
      if (qrBlock) qrBlock.classList.toggle("hidden", !isOpen);
      if (copyBtn) copyBtn.disabled = !isOpen;
      if (!currentSession || !isOpen) {
        shareUrl.value = "";
        shareUrl.readOnly = true;
        if (shareStatus) {
          shareStatus.textContent = "";
          shareStatus.dataset.type = "info";
        }
        if (shareQr) {
          shareQr.src = "";
          shareQr.classList.remove("is-zoomed");
        }
        document.body.classList.remove("qr-zoomed");
        return;
      }
      const origin = window.location.origin;
      const basePath = window.location.pathname.replace(/[^/]+$/, "poker-public.html");
      const shareLink = `${origin}${basePath}?token=${currentSession.token}`;
      shareUrl.value = shareLink;
      shareUrl.readOnly = true;
      if (shareQr) {
        shareQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
          shareLink
        )}`;
        shareQr.alt = "QR Poker";
      }
    };

    const updateControls = () => {
      if (!phaseStatus) return;
      if (!currentSession) {
        phaseStatus.textContent = "Sin sesion creada.";
      } else {
        const phaseLabel =
          currentSession.fase === "votacion"
            ? "Votacion activa"
            : currentSession.fase === "revelado"
              ? "Resultados visibles"
              : "En espera";
        phaseStatus.textContent = `${phaseLabel} · ${currentSession.estado}`;
      }
      const isClosed = !currentSession || currentSession.estado === "cerrada";
      if (createBtn) createBtn.disabled = Boolean(currentSession);
      if (startBtn) startBtn.disabled = !currentSession || isClosed;
      if (revealBtn) revealBtn.disabled = !currentSession || isClosed;
      if (closeBtn) closeBtn.disabled = !currentSession || isClosed;
    };

    updateShareSection();
    updateControls();

    const votedIds = new Set(votes.map((vote) => String(vote.persona_id)));
    renderPresence(presencePayload, votedIds);
    renderResults(currentSession, votes, presencePayload);

    if (currentSession?.token) {
      ensurePokerSocket(currentSession.token, "admin", (payload) => {
        if (payload?.type === "presence") {
          state.pokerPresence = payload;
          renderPresence(payload, votedIds);
          renderResults(currentSession, votes, payload);
          return;
        }
        initPokerPlanning({ skipPolling: true });
      });
    }

    if (!skipPolling && !window.__pokerAdminPoll) {
      window.__pokerAdminPoll = window.setInterval(() => {
        if (document.hidden) return;
        initPokerPlanning({ skipPolling: true });
      }, 8000);
    }

    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = "true";
      copyBtn.addEventListener("click", async () => {
        if (shareUrl?.value && currentSession) {
          const ok = await copyToClipboard(shareUrl.value, shareUrl);
          if (shareStatus) {
            shareStatus.textContent = ok ? "Link copiado." : "No se pudo copiar el link.";
            shareStatus.dataset.type = ok ? "ok" : "error";
          } else {
            setPokerStatus(ok ? "Link copiado." : "No se pudo copiar el link.", ok ? "ok" : "warn");
          }
        }
      });
    }

    if (shareQr && !shareQr.dataset.bound) {
      shareQr.dataset.bound = "true";
      shareQr.addEventListener("click", () => {
        const isZoomed = shareQr.classList.toggle("is-zoomed");
        document.body.classList.toggle("qr-zoomed", isZoomed);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && shareQr.classList.contains("is-zoomed")) {
          shareQr.classList.remove("is-zoomed");
          document.body.classList.remove("qr-zoomed");
        }
      });
    }

    if (createBtn && !createBtn.dataset.bound) {
      createBtn.dataset.bound = "true";
      createBtn.addEventListener("click", async () => {
        if (!state.selectedCelulaId) {
          setPokerStatus("Selecciona una celula primero.", "warn");
          return;
        }
        await withButtonBusy(
          createBtn,
          async () => {
            try {
              currentSession = await postJson("/poker/sessions", {
                celula_id: Number(state.selectedCelulaId),
              });
              state.pokerSessionId = String(currentSession.id);
              setPokerStatus("Sesion creada.", "ok");
              initPokerPlanning({ skipPolling: true });
            } catch {
              setPokerStatus("No se pudo crear la sesion.", "error");
            }
          },
          "Creando..."
        );
      });
    }

    if (startBtn && !startBtn.dataset.bound) {
      startBtn.dataset.bound = "true";
      startBtn.addEventListener("click", async () => {
        const sessionId = state.pokerSessionId;
        if (!sessionId) {
          setPokerStatus("Primero prepara el link.", "warn");
          return;
        }
        await withButtonBusy(
          startBtn,
          async () => {
            await putJson(`/poker/sessions/${sessionId}`, {
              fase: "votacion",
              estado: "abierta",
            });
            initPokerPlanning({ skipPolling: true });
          },
          "Iniciando..."
        );
      });
    }

    if (revealBtn && !revealBtn.dataset.bound) {
      revealBtn.dataset.bound = "true";
      revealBtn.addEventListener("click", async () => {
        const sessionId = state.pokerSessionId;
        if (!sessionId) {
          setPokerStatus("Primero prepara el link.", "warn");
          return;
        }
        await withButtonBusy(
          revealBtn,
          async () => {
            await putJson(`/poker/sessions/${sessionId}`, {
              fase: "revelado",
            });
            initPokerPlanning({ skipPolling: true });
          },
          "Mostrando..."
        );
      });
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", async () => {
        const sessionId = state.pokerSessionId;
        if (!sessionId) {
          setPokerStatus("No hay sesion activa.", "warn");
          return;
        }
        await withButtonBusy(
          closeBtn,
          async () => {
            await putJson(`/poker/sessions/${sessionId}`, {
              estado: "cerrada",
            });
            state.pokerSessionId = "";
            initPokerPlanning({ skipPolling: true });
          },
          "Cerrando..."
        );
      });
    }
  }

  async function initPokerPublic(options = {}) {
    const { skipPolling = false } = options;
    const container = qs("#poker-public");
    if (!container) return;
    const form = qs("#poker-public-form");
    const status = qs("#poker-public-status");
    const title = qs("#poker-public-title");
    const phaseLabel = qs("#poker-public-phase");
    const connectionStatus = qs("#poker-public-connection");
    const authorSelect = qs("#poker-public-author");
    const cardsWrap = qs("#poker-public-cards");
    let selectedValue = null;

    const setStatusText = (message, type = "info") => {
      if (!status) return;
      status.textContent = message || "";
      status.dataset.type = type;
    };
    const setConnectionStatus = (connected) => {
      if (!connectionStatus) return;
      connectionStatus.textContent = connected ? "Conectado" : "Desconectado";
      connectionStatus.dataset.type = connected ? "ok" : "error";
    };

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatusText("Link invalido. Falta token.", "error");
      return;
    }

    const renderCards = (enabled) => {
      if (!cardsWrap) return;
      const values = [1, 2, 3, 5, 8, 13, 21];
      cardsWrap.innerHTML = "";
      values.forEach((value) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "poker-card";
        btn.textContent = String(value);
        if (!enabled) btn.disabled = true;
        if (selectedValue === value) btn.classList.add("selected");
        btn.addEventListener("click", () => {
          if (!enabled) return;
          selectedValue = value;
          renderCards(true);
        });
        cardsWrap.appendChild(btn);
      });
    };

    const applyInfo = (info) => {
      if (title) {
        title.textContent = `Poker Planning · ${info.celula_nombre}`;
      }
      if (info.personas && authorSelect) {
        const current = authorSelect.value;
        authorSelect.innerHTML = '<option value=\"\">Tu nombre</option>';
        info.personas.forEach((persona) => {
          const opt = document.createElement("option");
          opt.value = persona.id;
          opt.textContent = `${persona.nombre} ${persona.apellido}`.trim();
          authorSelect.appendChild(opt);
        });
        if (current) authorSelect.value = current;
      }
      if (info.estado !== "abierta") {
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            el.disabled = true;
          });
        }
        if (phaseLabel) phaseLabel.textContent = "Sesion cerrada.";
        renderCards(false);
        setStatusText("Sesion cerrada por el SM.", "warn");
        return;
      }
      if (info.fase === "votacion") {
        if (phaseLabel) phaseLabel.textContent = "Votacion activa.";
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            el.disabled = false;
          });
        }
        renderCards(true);
      } else if (info.fase === "revelado") {
        if (phaseLabel) phaseLabel.textContent = "Resultados visibles.";
        renderCards(false);
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            el.disabled = true;
          });
        }
      } else {
        if (phaseLabel) phaseLabel.textContent = "Esperando inicio del SM.";
        renderCards(false);
        if (form) {
          form.querySelectorAll("input, select, textarea, button").forEach((el) => {
            el.disabled = el.id !== "poker-public-author";
          });
        }
      }
    };

    const loadInfo = async () => {
      try {
        const info = await fetchJson(`/poker/public/${token}`);
        applyInfo(info);
        return info;
      } catch {
        setStatusText("No se pudo cargar Poker Planning.", "error");
        return null;
      }
    };

    const info = await loadInfo();
    if (!info) return;

    const socket = ensurePokerSocket(token, "public", () => {
      loadInfo();
    });
    if (socket) {
      setConnectionStatus(socket.readyState === 1);
      if (!socket.__boundStatus) {
        socket.__boundStatus = true;
        socket.addEventListener("open", () => setConnectionStatus(true));
        socket.addEventListener("close", () => setConnectionStatus(false));
        socket.addEventListener("error", () => setConnectionStatus(false));
      }
    } else {
      setConnectionStatus(false);
    }

    if (!skipPolling && !window.__pokerPublicPoll) {
      window.__pokerPublicPoll = window.setInterval(() => {
        if (document.hidden) return;
        loadInfo();
      }, 8000);
    }

    if (authorSelect && !authorSelect.dataset.boundPresence) {
      authorSelect.dataset.boundPresence = "true";
      authorSelect.addEventListener("change", () => {
        const id = authorSelect.value ? Number(authorSelect.value) : null;
        if (!id) {
          sendPokerPresence("public", { type: "leave" });
          return;
        }
        const name = authorSelect.selectedOptions?.[0]?.textContent?.trim() || "";
        sendPokerPresence("public", { type: "join", persona_id: id, nombre: name });
      });
    }

    if (form && !form.dataset.bound) {
      form.dataset.bound = "true";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const personaId = authorSelect?.value ? Number(authorSelect.value) : null;
        if (!personaId) {
          setStatusText("Selecciona tu nombre.", "error");
          return;
        }
        if (!selectedValue) {
          setStatusText("Selecciona una carta.", "error");
          return;
        }
        const submitBtn = form.querySelector("button[type='submit']");
        await withButtonBusy(
          submitBtn,
          async () => {
            try {
              await postJson(`/poker/public/${token}/vote`, {
                persona_id: personaId,
                valor: selectedValue,
              });
              setStatusText("Voto enviado.", "ok");
            } catch {
              setStatusText("No se pudo enviar el voto.", "error");
            }
          },
          "Enviando..."
        );
      });
    }
  }

  function initDataEntrySections() {
    const container = qs("#data-entry");
    if (!container) return;
    const blocks = Array.from(container.querySelectorAll(".section-block"));
    if (!blocks.length) return;
    const adminCards = Array.from(document.querySelectorAll(".admin-card[data-section]"));

    const group = document.querySelector(".menu-group");
    if (group) {
      group.classList.add("open", "menu-open");
    }

    function showSection(id) {
      const hasBlock = blocks.some((block) => block.id === id);
      const targetId = hasBlock ? id : blocks[0]?.id;
      blocks.forEach((block) => {
        block.classList.toggle("hidden", block.id !== targetId);
      });
      adminCards.forEach((card) => {
        card.classList.toggle("hidden", card.dataset.section !== targetId);
      });
    }

    function resolveTarget() {
      const hash = window.location.hash.replace("#", "");
      if (hash && blocks.some((block) => block.id === hash)) {
        showSection(hash);
      } else {
        showSection(blocks[0].id);
      }
    }

    resolveTarget();
    window.addEventListener("hashchange", resolveTarget);
  }

  function ensureTaskMenu() {
    const nav = qs("#navigation");
    if (!nav) return;
    const taskItems = Array.from(nav.querySelectorAll("a.nav-link"))
      .filter((link) => (link.textContent || "").trim() === "Tareas")
      .map((link) => link.closest("li"))
      .filter(Boolean);
    if (taskItems.length > 1) {
      taskItems.slice(1).forEach((item) => item.remove());
    }
    if (taskItems.length) return;
    const dailyItem = Array.from(nav.querySelectorAll("a.nav-link"))
      .find((link) => (link.textContent || "").trim() === "Daily")
      ?.closest("li");
    if (!dailyItem) return;
    const li = document.createElement("li");
    li.className = "nav-item";
    li.dataset.key = "tasks-menu";
    li.innerHTML = `
      <a href="daily.html" class="nav-link">
        <i class="nav-icon bi bi-list-check"></i>
        <p>Tareas</p>
      </a>
    `;
    dailyItem.insertAdjacentElement("afterend", li);
  }

  init();
})();
