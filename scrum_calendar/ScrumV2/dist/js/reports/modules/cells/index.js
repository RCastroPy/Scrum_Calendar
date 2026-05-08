export const moduleDefinition = {
  id: "cells",
  title: "Celulas",
  icon: "bi-diagram-3",
  mount(container) {
    container.innerHTML = `
      <div class="reports-module-header">
        <div>
          <p class="reports-eyebrow mb-1">Modulo independiente</p>
          <h2>Reportes por Celula</h2>
          <p>Promedio de esfuerzo, velocidad, cumplimiento, tareas vencidas y comparativos por quarter.</p>
        </div>
      </div>
      <div class="reports-empty-module">
        <i class="bi bi-diagram-3"></i>
        <strong>Modulo en construccion</strong>
        <span>Proxima fase: conectar datos reales de celulas y generar KPIs.</span>
      </div>
    `;
  },
  update() {},
  destroy() {},
};
