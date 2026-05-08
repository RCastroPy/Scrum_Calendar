export function renderModuleError(container, error, title = "Modulo") {
  if (!container) return;
  const message = error?.message || "Error inesperado.";
  container.innerHTML = `
    <div class="card reports-error-card">
      <div class="card-body">
        <h3 class="card-title">${title}</h3>
        <p class="mb-0">No se pudo cargar este modulo.</p>
        <code>${message}</code>
      </div>
    </div>
  `;
}
