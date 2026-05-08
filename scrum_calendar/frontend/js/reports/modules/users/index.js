export const moduleDefinition = {
  id: "users",
  title: "Usuarios",
  icon: "bi-people",
  mount(container) {
    container.innerHTML = `
      <div class="reports-module-header">
        <div>
          <p class="reports-eyebrow mb-1">Modulo independiente</p>
          <h2>Reportes por Usuario</h2>
          <p>Story Points, cantidad de tareas, aging, vencidas y evolucion por sprint.</p>
        </div>
      </div>
      <div class="reports-empty-module">
        <i class="bi bi-people"></i>
        <strong>Modulo en construccion</strong>
        <span>Proxima fase: reutilizar calculos de Daily sin acoplarlos a app.js.</span>
      </div>
    `;
  },
  update() {},
  destroy() {},
};
