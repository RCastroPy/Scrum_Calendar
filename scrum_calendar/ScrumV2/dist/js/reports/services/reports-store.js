export async function createReportContext(initialState = {}) {
  return {
    filters: initialState.filters || {},
    baseData: null,
    services: {},
    components: {},
    state: {
      loadedAt: new Date().toISOString(),
    },
  };
}
