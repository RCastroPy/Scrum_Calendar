const cards = [
  { label: "SP completados", value: "En construccion", icon: "bi-lightning-charge", tone: "cyan" },
  { label: "Tareas finalizadas", value: "En construccion", icon: "bi-check2-circle", tone: "green" },
  { label: "Tareas vencidas", value: "En construccion", icon: "bi-exclamation-triangle", tone: "red" },
  { label: "Cumplimiento", value: "En construccion", icon: "bi-graph-up", tone: "blue" },
];

export const moduleDefinition = {
  id: "executive-summary",
  title: "Resumen Ejecutivo",
  icon: "bi-speedometer2",
  mount(container) {
    container.innerHTML = `
      <div class="reports-module-header">
        <div>
          <p class="reports-eyebrow mb-1">Vista inicial</p>
          <h2>Resumen Ejecutivo</h2>
          <p>Primer modulo aislado. Aqui conectaremos KPIs generales, alertas y tendencias sin agregar logica a app.js.</p>
        </div>
      </div>
      <div class="reports-kpi-grid">
        ${cards
          .map(
            (card) => `
              <article class="reports-kpi-card reports-tone-${card.tone}">
                <i class="bi ${card.icon}"></i>
                <span>${card.label}</span>
                <strong>${card.value}</strong>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="row g-3 mt-1">
        <div class="col-12 col-xl-7">
          <div class="card reports-placeholder-card">
            <div class="card-body">
              <h3 class="card-title">Tendencia de los ultimos sprints</h3>
              <p>Se conectara con Story Points y cantidad de tareas por sprint.</p>
            </div>
          </div>
        </div>
        <div class="col-12 col-xl-5">
          <div class="card reports-placeholder-card">
            <div class="card-body">
              <h3 class="card-title">Alertas operativas</h3>
              <p>Vencidas, sin responsable, sin fechas, releases atrasados y compromisos vencidos.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },
  update() {},
  destroy() {},
};
