export const moduleDefinition = {
  id: "quarters",
  title: "Quarter y Releases",
  icon: "bi-box-seam",
  mount(container) {
    container.innerHTML = `
      <div class="reports-module-header">
        <div>
          <p class="reports-eyebrow mb-1">Modulo independiente</p>
          <h2>Quarter y Releases</h2>
          <p>Cumplimiento por quarter, releases comprometidos, ejecutados, atrasados y Gantt resumido.</p>
        </div>
      </div>
      <div class="reports-empty-module">
        <i class="bi bi-box-seam"></i>
        <strong>Modulo en construccion</strong>
        <span>Proxima fase: consumir datos de Releases y comparar quarters.</span>
      </div>
    `;
  },
  update() {},
  destroy() {},
};
