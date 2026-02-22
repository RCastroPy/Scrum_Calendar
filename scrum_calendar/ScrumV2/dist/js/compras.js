      (() => {
        const API = {
          catalogos: "/compras/catalogos",
          productos: "/compras/catalogos/productos",
          supermercados: "/compras/catalogos/supermercados",
          historicos: "/compras/historicos",
        };

        const state = {
          view: "inicio",
          catalogoProductos: [],
          catalogoSupermercados: [],
          historicosCompras: [],
          compraActual: { supermercado: "", items: [] },
          editingHistoryId: null,
          editItemId: null,
          deleteItemId: null,
          selectedHistoryId: null,
          highlightedHistoryId: null,
        };

        const refs = {
          views: {
            inicio: document.getElementById("view-inicio"),
            nueva: document.getElementById("view-nueva"),
            productos: document.getElementById("view-productos"),
            historicos: document.getElementById("view-historicos"),
            reportes: document.getElementById("view-reportes"),
            detalle: document.getElementById("view-detalle"),
          },
          btnNueva: document.getElementById("go-nueva-compra"),
          btnHistoricos: document.getElementById("go-historicos"),
          btnReportes: document.getElementById("go-reportes"),
          btnProductos: document.getElementById("go-productos"),
          btnSupermercados: document.getElementById("go-supermercados"),
          btnVolverInicio: document.getElementById("volver-inicio"),
          btnVolverNuevaProductos: document.getElementById("volver-nueva-desde-productos"),
          btnVolverInicioHistoricos: document.getElementById("volver-inicio-desde-historicos"),
          btnVolverInicioReportes: document.getElementById("volver-inicio-desde-reportes"),
          btnVolverHistoricos: document.getElementById("volver-historicos"),
          btnLimpiarHistorico: document.getElementById("limpiar-historico"),
          resumenUltimaCompra: document.getElementById("resumen-ultima-compra"),
          inputSupermercado: document.getElementById("input-supermercado"),
          supermercadoError: document.getElementById("supermercado-error"),
          supermercadoSuggestions: document.getElementById("supermercado-suggestions"),
          supermercadoSeleccionado: document.getElementById("supermercado-seleccionado"),
          btnUsarSupermercado: document.getElementById("usar-supermercado"),
          inputProducto: document.getElementById("input-producto"),
          productoSuggestions: document.getElementById("producto-suggestions"),
          inputPrecio: document.getElementById("input-precio"),
          inputCantidad: document.getElementById("input-cantidad"),
          totalItemPreview: document.getElementById("total-item-preview"),
          totalGeneral: document.getElementById("total-general"),
          formItemError: document.getElementById("form-item-error"),
          btnAgregarItem: document.getElementById("agregar-item"),
          listaItems: document.getElementById("lista-items"),
          itemsCount: document.getElementById("items-count"),
          lastItemLoaded: document.getElementById("last-item-loaded"),
          catalogoProductoInput: document.getElementById("catalogo-producto-input"),
          catalogoProductoError: document.getElementById("catalogo-producto-error"),
          catalogoProductoAgregar: document.getElementById("catalogo-producto-agregar"),
          catalogoProductosLista: document.getElementById("catalogo-productos-lista"),
          catalogoSupermercadoInput: document.getElementById("catalogo-supermercado-input"),
          catalogoSupermercadoError: document.getElementById("catalogo-supermercado-error"),
          catalogoSupermercadoAgregar: document.getElementById("catalogo-supermercado-agregar"),
          catalogoSupermercadosLista: document.getElementById("catalogo-supermercados-lista"),
          btnFinalizar: document.getElementById("finalizar-compra"),
          historicosLista: document.getElementById("historicos-lista"),
          detalleCompra: document.getElementById("detalle-compra"),
          reportDesde: document.getElementById("report-desde"),
          reportHasta: document.getElementById("report-hasta"),
          btnReportAplicarRango: document.getElementById("report-aplicar-rango"),
          reportProductoSelect: document.getElementById("report-producto-select"),
          reportProductoDesde: document.getElementById("report-producto-desde"),
          reportProductoHasta: document.getElementById("report-producto-hasta"),
          btnReportProductoAplicar: document.getElementById("report-producto-aplicar"),
          reportProductoTableBody: document.getElementById("report-producto-table-body"),
          chartGastoSupermercado: document.getElementById("chart-gasto-supermercado"),
          chartGastoProducto: document.getElementById("chart-gasto-producto"),
          chartVariacionProducto: document.getElementById("chart-variacion-producto"),
          editModalEl: document.getElementById("modal-editar-item"),
          editProducto: document.getElementById("edit-producto"),
          editProductoSuggestions: document.getElementById("edit-producto-suggestions"),
          editPrecio: document.getElementById("edit-precio"),
          editCantidad: document.getElementById("edit-cantidad"),
          editTotal: document.getElementById("edit-total-item"),
          editError: document.getElementById("edit-item-error"),
          btnGuardarEdicion: document.getElementById("guardar-edicion-item"),
          deleteModalEl: document.getElementById("modal-eliminar-item"),
          btnConfirmarEliminar: document.getElementById("confirmar-eliminar-item"),
        };

        const editModal = refs.editModalEl ? new bootstrap.Modal(refs.editModalEl) : null;
        const deleteModal = refs.deleteModalEl ? new bootstrap.Modal(refs.deleteModalEl) : null;
        const reportCharts = {
          supermarkets: null,
          products: null,
          variation: null,
        };
        const DRAFT_STORAGE_KEY = "scrumia_compras_draft_v1";
        const VALID_VIEWS = new Set(["inicio", "nueva", "productos", "historicos", "reportes", "detalle"]);

        const safeLocalStorage = () => {
          try {
            if (typeof window === "undefined" || !window.localStorage) return null;
            return window.localStorage;
          } catch (_error) {
            return null;
          }
        };

        const apiRequest = async (url, options = {}) => {
          const config = {
            method: options.method || "GET",
            credentials: "include",
            headers: { ...(options.headers || {}) },
          };
          if (options.body !== undefined) {
            config.headers["Content-Type"] = "application/json";
            config.body = JSON.stringify(options.body);
          }
          const response = await fetch(url, config);
          if (response.status === 204) return null;
          const raw = await response.text();
          const data = raw ? JSON.parse(raw) : null;
          if (!response.ok) {
            const detail = data && data.detail ? String(data.detail) : `Error ${response.status}`;
            throw new Error(detail);
          }
          return data;
        };

        const normalizeText = (value) =>
          String(value || "")
            .trim()
            .replace(/\s+/g, " ");

        const snapshotDraftState = () => ({
          view: state.view,
          selectedHistoryId: state.selectedHistoryId ? String(state.selectedHistoryId) : null,
          editingHistoryId: state.editingHistoryId ? String(state.editingHistoryId) : null,
          compraActual: {
            supermercado: normalizeText(state.compraActual?.supermercado || ""),
            items: Array.isArray(state.compraActual?.items)
              ? state.compraActual.items.map((item) => ({
                  id: String(item?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`),
                  producto: normalizeText(item?.producto || ""),
                  precio: Math.max(0, Number(item?.precio || 0) || 0),
                  cantidad: Math.max(0, Number(item?.cantidad || 0) || 0),
                }))
              : [],
          },
          form: {
            supermercado: refs.inputSupermercado?.value || "",
            producto: refs.inputProducto?.value || "",
            precio: refs.inputPrecio?.value || "",
            cantidad: refs.inputCantidad?.value || "",
          },
        });

        const persistDraftState = () => {
          const storage = safeLocalStorage();
          if (!storage) return;
          try {
            storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshotDraftState()));
          } catch (_error) {
            // Ignore localStorage availability/quota errors.
          }
        };

        const loadDraftState = () => {
          const storage = safeLocalStorage();
          if (!storage) return { view: "inicio", selectedHistoryId: null };
          try {
            const raw = storage.getItem(DRAFT_STORAGE_KEY);
            if (!raw) return { view: "inicio", selectedHistoryId: null };
            const draft = JSON.parse(raw);
            const draftCompra = draft?.compraActual || {};
            const restoredItems = Array.isArray(draftCompra.items)
              ? draftCompra.items
                  .map((item) => ({
                    id: String(item?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`),
                    producto: normalizeText(item?.producto || ""),
                    precio: Math.max(0, Number(item?.precio || 0) || 0),
                    cantidad: Math.max(0, Number(item?.cantidad || 0) || 0),
                  }))
                  .filter((item) => item.producto)
              : [];
            state.compraActual = {
              supermercado: normalizeText(draftCompra.supermercado || ""),
              items: restoredItems,
            };
            const draftForm = draft?.form || {};
            if (refs.inputSupermercado) refs.inputSupermercado.value = String(draftForm.supermercado || "");
            if (refs.inputProducto) refs.inputProducto.value = String(draftForm.producto || "");
            if (refs.inputPrecio) refs.inputPrecio.value = String(draftForm.precio || "");
            if (refs.inputCantidad) refs.inputCantidad.value = String(draftForm.cantidad || "");
            state.editingHistoryId = draft?.editingHistoryId ? String(draft.editingHistoryId) : null;
            const restoredView = VALID_VIEWS.has(draft?.view) ? draft.view : "inicio";
            const restoredHistoryId = draft?.selectedHistoryId ? String(draft.selectedHistoryId) : null;
            state.selectedHistoryId = restoredHistoryId;
            return { view: restoredView, selectedHistoryId: restoredHistoryId };
          } catch (_error) {
            return { view: "inicio", selectedHistoryId: null };
          }
        };

        const findCatalogValue = (catalog, value) => {
          const normalized = normalizeText(value).toLowerCase();
          if (!normalized) return "";
          return catalog.find((entry) => normalizeText(entry).toLowerCase() === normalized) || "";
        };

        const applyCatalogos = (payload) => {
          const productos = Array.isArray(payload?.productos)
            ? payload.productos.map((item) => normalizeText(item)).filter(Boolean)
            : [];
          const supermercados = Array.isArray(payload?.supermercados)
            ? payload.supermercados.map((item) => normalizeText(item)).filter(Boolean)
            : [];
          productos.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
          supermercados.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
          state.catalogoProductos.splice(0, state.catalogoProductos.length, ...productos);
          state.catalogoSupermercados.splice(0, state.catalogoSupermercados.length, ...supermercados);
        };

        const mapCompraFromApi = (entry) => ({
          id: String(entry?.id ?? ""),
          fecha: entry?.fecha || entry?.creado_en || new Date().toISOString(),
          supermercado: normalizeText(entry?.supermercado || ""),
          totalGeneral: Number(entry?.total_general ?? entry?.totalGeneral ?? 0) || 0,
          items: Array.isArray(entry?.items)
            ? entry.items.map((item) => ({
                id: String(item?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`),
                producto: normalizeText(item?.producto || ""),
                precio: Number(item?.precio || 0) || 0,
                cantidad: Number(item?.cantidad || 1) || 1,
                totalItem:
                  Number(item?.total_item ?? item?.totalItem ?? 0) ||
                  Math.round((Number(item?.precio || 0) || 0) * (Number(item?.cantidad || 1) || 1)),
                ticketValidado: Boolean(item?.ticket_validado ?? item?.ticketValidado ?? false),
              }))
            : [],
        });

        const syncRemoteData = async () => {
          const [catalogos, historicos] = await Promise.all([
            apiRequest(API.catalogos),
            apiRequest(API.historicos),
          ]);
          applyCatalogos(catalogos || {});
          state.historicosCompras = Array.isArray(historicos) ? historicos.map(mapCompraFromApi) : [];
        };

        const formatGs = (value) => {
          const amount = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
          return `Gs. ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(amount)}`;
        };

        const formatGsNumber = (value) =>
          new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(
            Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0
          );

        const parseMoney = (value) => {
          const clean = String(value || "").replace(/[^\d]/g, "");
          return clean ? Number(clean) : 0;
        };

        const formatPriceInput = (value) => {
          const clean = String(value || "").replace(/[^\d]/g, "");
          if (!clean) return "";
          return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Number(clean));
        };

        const latestKnownPriceForProduct = (supermercadoValue, productoValue, options = {}) => {
          const supermercadoKey = normalizeText(supermercadoValue).toLowerCase();
          const productoKey = normalizeText(productoValue).toLowerCase();
          const excludeHistoryId = options?.excludeHistoryId ? String(options.excludeHistoryId) : null;
          if (!supermercadoKey || !productoKey) return null;
          let bestTimestamp = -1;
          let bestPrice = null;
          state.historicosCompras.forEach((entry) => {
            if (excludeHistoryId && String(entry?.id || "") === excludeHistoryId) return;
            if (normalizeText(entry?.supermercado).toLowerCase() !== supermercadoKey) return;
            const ts = new Date(entry?.fecha || "").getTime();
            const validTs = Number.isFinite(ts) ? ts : -1;
            (entry?.items || []).forEach((item) => {
              if (normalizeText(item?.producto).toLowerCase() !== productoKey) return;
              const price = Math.max(0, Number(item?.precio || 0) || 0);
              if (price <= 0) return;
              if (validTs >= bestTimestamp) {
                bestTimestamp = validTs;
                bestPrice = price;
              }
            });
          });
          return bestPrice;
        };

        const previousPriceForHistoryItem = (historyEntry, itemEntry) => {
          const supermercadoKey = normalizeText(historyEntry?.supermercado).toLowerCase();
          const productoKey = normalizeText(itemEntry?.producto).toLowerCase();
          if (!supermercadoKey || !productoKey) return null;
          const currentTsRaw = new Date(historyEntry?.fecha || "").getTime();
          const currentTs = Number.isFinite(currentTsRaw) ? currentTsRaw : Number.POSITIVE_INFINITY;
          const currentId = Number(historyEntry?.id || 0) || 0;
          let bestTs = -1;
          let bestId = -1;
          let bestPrice = null;
          state.historicosCompras.forEach((entry) => {
            if (String(entry?.id || "") === String(historyEntry?.id || "")) return;
            if (normalizeText(entry?.supermercado).toLowerCase() !== supermercadoKey) return;
            const entryTsRaw = new Date(entry?.fecha || "").getTime();
            const entryTs = Number.isFinite(entryTsRaw) ? entryTsRaw : -1;
            const entryId = Number(entry?.id || 0) || 0;
            const isOlder = entryTs < currentTs || (entryTs === currentTs && entryId < currentId);
            if (!isOlder) return;
            (entry?.items || []).forEach((pastItem) => {
              if (normalizeText(pastItem?.producto).toLowerCase() !== productoKey) return;
              const price = Math.max(0, Number(pastItem?.precio || 0) || 0);
              if (!price) return;
              if (entryTs > bestTs || (entryTs === bestTs && entryId > bestId)) {
                bestTs = entryTs;
                bestId = entryId;
                bestPrice = price;
              }
            });
          });
          return bestPrice;
        };

        const autofillPriceFromHistory = ({ force = false } = {}) => {
          const supermercado = normalizeText(state.compraActual.supermercado || refs.inputSupermercado.value);
          const producto = normalizeText(refs.inputProducto.value);
          if (!supermercado || !producto) return false;
          const suggestedPrice = latestKnownPriceForProduct(supermercado, producto);
          if (!suggestedPrice) return false;
          const currentHasPrice = parseMoney(refs.inputPrecio.value) > 0;
          if (!force && currentHasPrice) return false;
          refs.inputPrecio.value = formatPriceInput(String(Math.round(suggestedPrice)));
          renderPreviewItemTotal();
          persistDraftState();
          return true;
        };

        const parseQuantity = (value) => {
          const raw = String(value || "").trim();
          if (!raw) return 0;
          const safe = raw.replace(/\s+/g, "").replace(/[^0-9,.\-]/g, "");
          const lastComma = safe.lastIndexOf(",");
          const lastDot = safe.lastIndexOf(".");
          let normalized = safe;
          if (lastComma !== -1 || lastDot !== -1) {
            const sepIndex = Math.max(lastComma, lastDot);
            const whole = safe.slice(0, sepIndex).replace(/[.,]/g, "");
            const decimal = safe.slice(sepIndex + 1).replace(/[.,]/g, "");
            normalized = `${whole}.${decimal}`;
          } else {
            normalized = safe.replace(/[.,]/g, "");
          }
          const n = Number(normalized);
          return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const formatQuantity = (value) =>
          new Intl.NumberFormat("es-PY", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3,
          }).format(Number.isFinite(Number(value)) ? Number(value) : 0);

        const itemTotal = (item) =>
          Math.round(Math.max(0, Number(item.precio || 0)) * Math.max(0, Number(item.cantidad || 0)));
        const totalGeneral = () => state.compraActual.items.reduce((sum, item) => sum + itemTotal(item), 0);

        const formatDateTime = (iso) => {
          const dt = new Date(iso);
          if (Number.isNaN(dt.getTime())) return "-";
          return dt.toLocaleString("es-PY", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        };

        const toDateInputValue = (date) => {
          const dt = new Date(date);
          if (Number.isNaN(dt.getTime())) return "";
          const year = dt.getFullYear();
          const month = String(dt.getMonth() + 1).padStart(2, "0");
          const day = String(dt.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        };

        const parseDateStart = (value) => {
          if (!value) return null;
          const date = new Date(`${value}T00:00:00`);
          return Number.isNaN(date.getTime()) ? null : date;
        };

        const parseDateEnd = (value) => {
          if (!value) return null;
          const date = new Date(`${value}T23:59:59.999`);
          return Number.isNaN(date.getTime()) ? null : date;
        };

        const getEntriesByDateRange = (fromValue, toValue) => {
          const from = parseDateStart(fromValue);
          const to = parseDateEnd(toValue);
          return state.historicosCompras.filter((entry) => {
            const dt = new Date(entry.fecha);
            if (Number.isNaN(dt.getTime())) return false;
            if (from && dt < from) return false;
            if (to && dt > to) return false;
            return true;
          });
        };

        const buildColorPalette = (size) => {
          const base = [
            "#0d6efd",
            "#20c997",
            "#fd7e14",
            "#6f42c1",
            "#dc3545",
            "#0dcaf0",
            "#198754",
            "#ffc107",
            "#6610f2",
            "#adb5bd",
          ];
          return Array.from({ length: size }, (_, idx) => base[idx % base.length]);
        };

        const destroyChart = (chartRef) => {
          if (chartRef && typeof chartRef.destroy === "function") {
            chartRef.destroy();
          }
        };

        const renderBarChart = (canvasEl, chartKey, labels, values, label, horizontal = false) => {
          if (!canvasEl || !(window.Chart && canvasEl.getContext)) return;
          destroyChart(reportCharts[chartKey]);
          if (!labels.length) {
            reportCharts[chartKey] = new Chart(canvasEl.getContext("2d"), {
              type: "bar",
              data: {
                labels: ["Sin datos"],
                datasets: [{ label, data: [0], backgroundColor: ["#adb5bd"] }],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: horizontal ? "y" : "x",
                plugins: { legend: { display: false } },
              },
            });
            return;
          }
          reportCharts[chartKey] = new Chart(canvasEl.getContext("2d"), {
            type: "bar",
            data: {
              labels,
              datasets: [
                {
                  label,
                  data: values,
                  backgroundColor: buildColorPalette(labels.length),
                  borderWidth: 0,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: horizontal ? "y" : "x",
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${formatGs(ctx.parsed.x ?? ctx.parsed.y ?? 0)}`,
                  },
                },
              },
              scales: {
                y: horizontal ? {} : { ticks: { callback: (value) => formatGs(value) } },
                x: horizontal ? { ticks: { callback: (value) => formatGs(value) } } : {},
              },
            },
          });
        };

        const getUniqueProductsFromHistory = () => {
          const unique = new Map();
          state.historicosCompras.forEach((entry) => {
            (entry.items || []).forEach((item) => {
              const name = normalizeText(item.producto);
              if (!name) return;
              const key = name.toLowerCase();
              if (!unique.has(key)) unique.set(key, name);
            });
          });
          return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
        };

        const setDefaultReportDates = () => {
          const now = new Date();
          const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const today = toDateInputValue(now);
          const first = toDateInputValue(firstDayMonth);
          if (refs.reportDesde && !refs.reportDesde.value) refs.reportDesde.value = first;
          if (refs.reportHasta && !refs.reportHasta.value) refs.reportHasta.value = today;
          if (refs.reportProductoDesde && !refs.reportProductoDesde.value) refs.reportProductoDesde.value = first;
          if (refs.reportProductoHasta && !refs.reportProductoHasta.value) refs.reportProductoHasta.value = today;
        };

        const renderReportProductSelector = () => {
          if (!refs.reportProductoSelect) return;
          const current = refs.reportProductoSelect.value;
          const products = getUniqueProductsFromHistory();
          if (!products.length) {
            refs.reportProductoSelect.innerHTML = '<option value="">Sin productos</option>';
            return;
          }
          refs.reportProductoSelect.innerHTML = products
            .map((product) => `<option value="${encodeURIComponent(product)}">${product}</option>`)
            .join("");
          const currentDecoded = decodeURIComponent(current || "");
          const hasCurrent = products.some(
            (entry) => normalizeText(entry).toLowerCase() === normalizeText(currentDecoded).toLowerCase()
          );
          if (hasCurrent) {
            const found = products.find(
              (entry) => normalizeText(entry).toLowerCase() === normalizeText(currentDecoded).toLowerCase()
            );
            refs.reportProductoSelect.value = encodeURIComponent(found || "");
          } else {
            refs.reportProductoSelect.selectedIndex = 0;
          }
        };

        const renderReportesGenerales = () => {
          const entries = getEntriesByDateRange(refs.reportDesde?.value || "", refs.reportHasta?.value || "");
          const supermarketMap = new Map();
          const productMap = new Map();

          entries.forEach((entry) => {
            const supermarket = normalizeText(entry.supermercado) || "Sin supermercado";
            supermarketMap.set(supermarket, (supermarketMap.get(supermarket) || 0) + Number(entry.totalGeneral || 0));
            (entry.items || []).forEach((item) => {
              const product = normalizeText(item.producto) || "Sin producto";
              productMap.set(product, (productMap.get(product) || 0) + itemTotal(item));
            });
          });

          const supermarkets = Array.from(supermarketMap.entries()).sort((a, b) => b[1] - a[1]);
          const products = Array.from(productMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);

          renderBarChart(
            refs.chartGastoSupermercado,
            "supermarkets",
            supermarkets.map((item) => item[0]),
            supermarkets.map((item) => item[1]),
            "Gasto",
            true
          );
          renderBarChart(
            refs.chartGastoProducto,
            "products",
            products.map((item) => item[0]),
            products.map((item) => item[1]),
            "Gasto",
            true
          );
        };

        const getProductVariationRows = (productName, fromValue, toValue) => {
          if (!productName) return [];
          const entries = getEntriesByDateRange(fromValue, toValue);
          const productKey = normalizeText(productName).toLowerCase();
          const rows = [];
          entries.forEach((entry) => {
            (entry.items || []).forEach((item) => {
              if (normalizeText(item.producto).toLowerCase() !== productKey) return;
              rows.push({
                fecha: entry.fecha,
                supermercado: entry.supermercado,
                precio: Number(item.precio || 0) || 0,
                cantidad: Number(item.cantidad || 0) || 0,
                total: itemTotal(item),
              });
            });
          });
          rows.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
          return rows;
        };

        const renderProductVariation = () => {
          if (!refs.reportProductoSelect || !refs.reportProductoTableBody) return;
          const selected = decodeURIComponent(refs.reportProductoSelect.value || "");
          const rows = getProductVariationRows(
            selected,
            refs.reportProductoDesde?.value || "",
            refs.reportProductoHasta?.value || ""
          );

          if (!rows.length) {
            refs.reportProductoTableBody.innerHTML = `
              <tr>
                <td colspan="5" class="text-center text-muted">Sin datos para el producto y rango seleccionado.</td>
              </tr>
            `;
          } else {
            refs.reportProductoTableBody.innerHTML = rows
              .map(
                (row) => `
                  <tr>
                    <td>${formatDateTime(row.fecha)}</td>
                    <td>${row.supermercado || "-"}</td>
                    <td class="text-end">${formatGs(row.precio)}</td>
                    <td class="text-end">${formatQuantity(row.cantidad)}</td>
                    <td class="text-end fw-semibold">${formatGs(row.total)}</td>
                  </tr>
                `
              )
              .join("");
          }

          if (!refs.chartVariacionProducto || !(window.Chart && refs.chartVariacionProducto.getContext)) return;
          destroyChart(reportCharts.variation);
          reportCharts.variation = new Chart(refs.chartVariacionProducto.getContext("2d"), {
            type: "line",
            data: {
              labels: rows.length ? rows.map((row) => formatDateTime(row.fecha)) : ["Sin datos"],
              datasets: [
                {
                  label: "Precio",
                  data: rows.length ? rows.map((row) => row.precio) : [0],
                  borderColor: "#0d6efd",
                  backgroundColor: "rgba(13,110,253,0.2)",
                  borderWidth: 2,
                  fill: true,
                  tension: 0.2,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: true },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${formatGs(ctx.parsed.y ?? 0)}`,
                  },
                },
              },
              scales: {
                y: {
                  ticks: {
                    callback: (value) => formatGs(value),
                  },
                },
              },
            },
          });
        };

        const renderReportes = () => {
          setDefaultReportDates();
          renderReportProductSelector();
          renderReportesGenerales();
          renderProductVariation();
        };

        const setSubmitMode = () => {
          if (!refs.btnFinalizar) return;
          refs.btnFinalizar.textContent = state.editingHistoryId ? "Actualizar compra" : "Finalizar compra";
        };

        const updateTotalHeader = () => {
          refs.totalGeneral.textContent = formatGs(totalGeneral());
          setSubmitMode();
          refs.btnFinalizar.disabled = !(state.compraActual.supermercado && state.compraActual.items.length > 0);
        };

        const switchView = (viewName) => {
          state.view = viewName;
          Object.entries(refs.views).forEach(([key, el]) => {
            if (!el) return;
            el.classList.toggle("d-none", key !== viewName);
          });
          persistDraftState();
        };

        const renderInicioResumen = () => {
          if (!refs.resumenUltimaCompra) return;
          const last = state.historicosCompras[0];
          if (!last) {
            refs.resumenUltimaCompra.innerHTML = `
              <div class="card-body">
                <h3 class="h6 mb-2">Ultima compra</h3>
                <p class="text-muted mb-0">Aun no hay compras registradas.</p>
              </div>
            `;
            return;
          }
          refs.resumenUltimaCompra.innerHTML = `
            <div class="card-body">
              <h3 class="h6 mb-2">Ultima compra</h3>
              <p class="mb-1"><strong>${last.supermercado}</strong></p>
              <p class="mb-1 text-muted">${formatDateTime(last.fecha)}</p>
              <p class="mb-0 fw-semibold">${formatGs(last.totalGeneral || 0)}</p>
            </div>
          `;
        };

        const setSupermercadoSeleccionado = (value) => {
          state.compraActual.supermercado = normalizeText(value);
          refs.supermercadoSeleccionado.textContent = state.compraActual.supermercado || "Sin seleccionar";
          if (state.compraActual.supermercado) {
            refs.supermercadoError.textContent = "";
          }
          updateTotalHeader();
          persistDraftState();
        };

        const renderSuggestions = (container, items, onPick) => {
          if (!container) return;
          container.innerHTML = "";
          if (!items.length) {
            container.classList.add("d-none");
            return;
          }
          items.slice(0, 8).forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "autocomplete-item";
            button.textContent = item;
            button.addEventListener("click", () => {
              onPick(item);
              container.classList.add("d-none");
            });
            container.appendChild(button);
          });
          container.classList.remove("d-none");
        };

        const filteredSuggestions = (catalog, term) => {
          const q = normalizeText(term).toLowerCase();
          if (!q) return catalog.slice(0, 8);
          return catalog.filter((entry) => normalizeText(entry).toLowerCase().includes(q)).slice(0, 8);
        };

        const confirmSupermercadoInput = async () => {
          const value = normalizeText(refs.inputSupermercado.value);
          if (!value) {
            refs.supermercadoError.textContent = "Supermercado obligatorio.";
            return false;
          }
          try {
            const payload = await apiRequest(API.supermercados, {
              method: "POST",
              body: { nombre: value },
            });
            applyCatalogos(payload || {});
            const selected = findCatalogValue(state.catalogoSupermercados, value) || value;
            setSupermercadoSeleccionado(selected);
            refs.inputSupermercado.value = selected;
            refs.supermercadoSuggestions.classList.add("d-none");
            refs.supermercadoError.textContent = "";
            return true;
          } catch (error) {
            refs.supermercadoError.textContent = error?.message || "No se pudo guardar el supermercado.";
            return false;
          }
        };

        const ensureSupermercadoSeleccionado = async () => {
          if (state.compraActual.supermercado) return true;
          if (await confirmSupermercadoInput()) return true;
          refs.supermercadoError.textContent = "Debes seleccionar un supermercado.";
          return false;
        };

        const renderPreviewItemTotal = () => {
          const precio = parseMoney(refs.inputPrecio.value);
          const cantidad = parseQuantity(refs.inputCantidad.value);
          refs.totalItemPreview.textContent = formatGs(precio * cantidad);
        };

        const clearItemForm = () => {
          refs.inputProducto.value = "";
          refs.inputPrecio.value = "";
          refs.inputCantidad.value = "";
          refs.formItemError.textContent = "";
          refs.productoSuggestions.classList.add("d-none");
          renderPreviewItemTotal();
          persistDraftState();
        };

        const replaceProductInCurrentItems = (fromName, toName) => {
          state.compraActual.items = state.compraActual.items.map((item) => {
            if (normalizeText(item.producto).toLowerCase() === normalizeText(fromName).toLowerCase()) {
              return { ...item, producto: toName };
            }
            return item;
          });
        };

        const renderCatalogoProductos = () => {
          if (!refs.catalogoProductosLista) return;
          if (!state.catalogoProductos.length) {
            refs.catalogoProductosLista.innerHTML =
              '<div class="compras-list-empty">No hay productos en el catalogo.</div>';
            return;
          }
          refs.catalogoProductosLista.innerHTML = state.catalogoProductos
            .map(
              (product, idx) => `
                <div class="catalogo-producto-item d-flex justify-content-between align-items-center gap-2 mb-2">
                  <span class="text-truncate">${idx + 1}. ${product}</span>
                  <div class="d-flex gap-1">
                    <button type="button" class="btn btn-outline-secondary btn-sm js-edit-catalog-product" data-product="${encodeURIComponent(product)}" aria-label="Editar">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-sm js-delete-catalog-product" data-product="${encodeURIComponent(product)}" aria-label="Eliminar">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              `
            )
            .join("");
        };

        const addCatalogoProducto = async () => {
          const value = normalizeText(refs.catalogoProductoInput.value);
          if (!value) {
            refs.catalogoProductoError.textContent = "Debes ingresar un producto.";
            return;
          }
          try {
            const payload = await apiRequest(API.productos, {
              method: "POST",
              body: { nombre: value },
            });
            applyCatalogos(payload || {});
            refs.catalogoProductoInput.value = "";
            refs.catalogoProductoError.textContent = "";
            renderCatalogoProductos();
          } catch (error) {
            refs.catalogoProductoError.textContent = error?.message || "No se pudo guardar el producto.";
          }
        };

        const editCatalogoProducto = async (currentProduct) => {
          const current = normalizeText(currentProduct);
          if (!current) return;
          const newValue = normalizeText(window.prompt("Editar producto", current) || "");
          if (!newValue || newValue.toLowerCase() === current.toLowerCase()) return;
          try {
            const payload = await apiRequest(API.productos, {
              method: "PUT",
              body: { anterior: current, nuevo: newValue },
            });
            applyCatalogos(payload || {});
            replaceProductInCurrentItems(current, newValue);
            if (normalizeText(refs.inputProducto.value).toLowerCase() === current.toLowerCase()) {
              refs.inputProducto.value = newValue;
            }
            if (normalizeText(refs.editProducto.value).toLowerCase() === current.toLowerCase()) {
              refs.editProducto.value = newValue;
            }
            refs.catalogoProductoError.textContent = "";
            renderItems();
            renderCatalogoProductos();
          } catch (error) {
            refs.catalogoProductoError.textContent = error?.message || "No se pudo editar el producto.";
          }
        };

        const deleteCatalogoProducto = async (productToDelete) => {
          const product = normalizeText(productToDelete);
          if (!product) return;
          if (!window.confirm(`¿Eliminar "${product}" del catalogo?`)) return;
          try {
            const payload = await apiRequest(`${API.productos}?nombre=${encodeURIComponent(product)}`, {
              method: "DELETE",
            });
            applyCatalogos(payload || {});
            refs.catalogoProductoError.textContent = "";
            if (normalizeText(refs.inputProducto.value).toLowerCase() === product.toLowerCase()) {
              refs.inputProducto.value = "";
            }
            renderCatalogoProductos();
          } catch (error) {
            refs.catalogoProductoError.textContent = error?.message || "No se pudo eliminar el producto.";
          }
        };

        const renderCatalogoSupermercados = () => {
          if (!refs.catalogoSupermercadosLista) return;
          if (!state.catalogoSupermercados.length) {
            refs.catalogoSupermercadosLista.innerHTML =
              '<div class="compras-list-empty">No hay supermercados en el catalogo.</div>';
            return;
          }
          refs.catalogoSupermercadosLista.innerHTML = state.catalogoSupermercados
            .map(
              (store, idx) => `
                <div class="catalogo-producto-item d-flex justify-content-between align-items-center gap-2 mb-2">
                  <span class="text-truncate">${idx + 1}. ${store}</span>
                  <div class="d-flex gap-1">
                    <button type="button" class="btn btn-outline-secondary btn-sm js-edit-catalog-supermarket" data-store="${encodeURIComponent(store)}" aria-label="Editar">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-sm js-delete-catalog-supermarket" data-store="${encodeURIComponent(store)}" aria-label="Eliminar">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              `
            )
            .join("");
        };

        const addCatalogoSupermercado = async () => {
          const value = normalizeText(refs.catalogoSupermercadoInput.value);
          if (!value) {
            refs.catalogoSupermercadoError.textContent = "Debes ingresar un supermercado.";
            return;
          }
          try {
            const payload = await apiRequest(API.supermercados, {
              method: "POST",
              body: { nombre: value },
            });
            applyCatalogos(payload || {});
            refs.catalogoSupermercadoInput.value = "";
            refs.catalogoSupermercadoError.textContent = "";
            renderCatalogoSupermercados();
          } catch (error) {
            refs.catalogoSupermercadoError.textContent =
              error?.message || "No se pudo guardar el supermercado.";
          }
        };

        const editCatalogoSupermercado = async (currentStore) => {
          const current = normalizeText(currentStore);
          if (!current) return;
          const newValue = normalizeText(window.prompt("Editar supermercado", current) || "");
          if (!newValue || newValue.toLowerCase() === current.toLowerCase()) return;
          try {
            const payload = await apiRequest(API.supermercados, {
              method: "PUT",
              body: { anterior: current, nuevo: newValue },
            });
            applyCatalogos(payload || {});
            if (normalizeText(refs.inputSupermercado.value).toLowerCase() === current.toLowerCase()) {
              refs.inputSupermercado.value = newValue;
              setSupermercadoSeleccionado(newValue);
            }
            refs.catalogoSupermercadoError.textContent = "";
            renderCatalogoSupermercados();
          } catch (error) {
            refs.catalogoSupermercadoError.textContent =
              error?.message || "No se pudo editar el supermercado.";
          }
        };

        const deleteCatalogoSupermercado = async (storeToDelete) => {
          const store = normalizeText(storeToDelete);
          if (!store) return;
          if (!window.confirm(`¿Eliminar "${store}" del catalogo?`)) return;
          try {
            const payload = await apiRequest(`${API.supermercados}?nombre=${encodeURIComponent(store)}`, {
              method: "DELETE",
            });
            applyCatalogos(payload || {});
            refs.catalogoSupermercadoError.textContent = "";
            if (normalizeText(refs.inputSupermercado.value).toLowerCase() === store.toLowerCase()) {
              refs.inputSupermercado.value = "";
              setSupermercadoSeleccionado("");
            }
            renderCatalogoSupermercados();
          } catch (error) {
            refs.catalogoSupermercadoError.textContent =
              error?.message || "No se pudo eliminar el supermercado.";
          }
        };

        const renderItems = () => {
          const items = state.compraActual.items;
          refs.itemsCount.textContent = String(items.length);
          if (!items.length) {
            refs.lastItemLoaded.textContent = "Ultimo producto: -";
            refs.listaItems.innerHTML = '<div class="compras-list-empty">Aun no agregaste productos.</div>';
            updateTotalHeader();
            persistDraftState();
            return;
          }
          const lastItem = items[items.length - 1];
          refs.lastItemLoaded.textContent = `Ultimo producto: ${lastItem?.producto || "-"}`;
          refs.listaItems.innerHTML = [...items]
            .reverse()
            .map((item) => {
              const historyPrice = latestKnownPriceForProduct(
                state.compraActual.supermercado,
                item.producto,
                { excludeHistoryId: state.editingHistoryId }
              );
              const hasHistoryPrice = Number.isFinite(historyPrice) && Number(historyPrice) > 0;
              const delta = hasHistoryPrice ? Math.round(Number(item.precio || 0) - Number(historyPrice || 0)) : 0;
              const deltaClass = delta > 0 ? "text-danger" : "text-success";
              const deltaSign = delta > 0 ? "+" : "-";
              const deltaMarkup = hasHistoryPrice && delta !== 0
                ? `<small class="${deltaClass} fw-semibold d-block">${deltaSign}${formatGsNumber(Math.abs(delta))} Gs</small>`
                : "";
              return `
                <div class="compras-item-card mb-2">
                  <div class="d-flex justify-content-between gap-2">
                    <div>
                      <p class="compras-item-title">${item.producto}</p>
                      <small class="text-muted">${formatGs(item.precio)} x ${formatQuantity(item.cantidad)} = ${formatGs(itemTotal(item))}</small>
                      ${deltaMarkup}
                    </div>
                    <div class="d-flex align-items-start gap-1">
                      <button type="button" class="btn btn-outline-secondary btn-sm js-edit-item" data-id="${item.id}" aria-label="Editar">
                        <i class="bi bi-pencil"></i>
                      </button>
                      <button type="button" class="btn btn-outline-danger btn-sm js-delete-item" data-id="${item.id}" aria-label="Eliminar">
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              `
            })
            .join("");
          updateTotalHeader();
          persistDraftState();
        };

        const addItem = async () => {
          refs.formItemError.textContent = "";
          if (!(await ensureSupermercadoSeleccionado())) {
            refs.formItemError.textContent = "Completa el supermercado antes de agregar items.";
            return;
          }
          const productoInput = normalizeText(refs.inputProducto.value);
          if (!productoInput) {
            refs.formItemError.textContent = "Debes ingresar un producto.";
            return;
          }
          autofillPriceFromHistory();
          const precio = parseMoney(refs.inputPrecio.value);
          if (!precio || precio <= 0) {
            refs.formItemError.textContent = "Debes ingresar un precio mayor a 0.";
            return;
          }
          const cantidadRaw = normalizeText(refs.inputCantidad.value);
          if (!cantidadRaw) {
            refs.formItemError.textContent = "Debes ingresar una cantidad.";
            return;
          }
          const cantidad = parseQuantity(refs.inputCantidad.value);
          if (!cantidad || cantidad <= 0) {
            refs.formItemError.textContent = "Cantidad invalida.";
            return;
          }
          try {
            const payload = await apiRequest(API.productos, {
              method: "POST",
              body: { nombre: productoInput },
            });
            applyCatalogos(payload || {});
          } catch (error) {
            refs.formItemError.textContent = error?.message || "No se pudo guardar el producto.";
            return;
          }
          const producto = findCatalogValue(state.catalogoProductos, productoInput) || productoInput;
          state.compraActual.items.push({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            producto,
            precio,
            cantidad,
          });
          clearItemForm();
          renderItems();
        };

        const openEditItem = (itemId) => {
          const item = state.compraActual.items.find((entry) => entry.id === itemId);
          if (!item || !editModal) return;
          state.editItemId = item.id;
          refs.editProducto.value = item.producto;
          refs.editPrecio.value = formatPriceInput(String(item.precio));
          refs.editCantidad.value = String(item.cantidad);
          refs.editError.textContent = "";
          refs.editTotal.textContent = formatGs(itemTotal(item));
          refs.editProductoSuggestions.classList.add("d-none");
          editModal.show();
        };

        const saveEditedItem = async () => {
          const item = state.compraActual.items.find((entry) => entry.id === state.editItemId);
          if (!item) return;
          refs.editError.textContent = "";
          const productoInput = normalizeText(refs.editProducto.value);
          if (!productoInput) {
            refs.editError.textContent = "Debes ingresar un producto.";
            return;
          }
          const precio = parseMoney(refs.editPrecio.value);
          if (!precio || precio <= 0) {
            refs.editError.textContent = "Debes ingresar un precio mayor a 0.";
            return;
          }
          const cantidadRaw = normalizeText(refs.editCantidad.value);
          if (!cantidadRaw) {
            refs.editError.textContent = "Debes ingresar una cantidad.";
            return;
          }
          const cantidad = parseQuantity(refs.editCantidad.value);
          if (!cantidad || cantidad <= 0) {
            refs.editError.textContent = "Cantidad invalida.";
            return;
          }
          try {
            const payload = await apiRequest(API.productos, {
              method: "POST",
              body: { nombre: productoInput },
            });
            applyCatalogos(payload || {});
          } catch (error) {
            refs.editError.textContent = error?.message || "No se pudo guardar el producto.";
            return;
          }
          const producto = findCatalogValue(state.catalogoProductos, productoInput) || productoInput;
          item.producto = producto;
          item.precio = precio;
          item.cantidad = cantidad;
          renderItems();
          editModal.hide();
        };

        const openDeleteItem = (itemId) => {
          state.deleteItemId = itemId;
          if (deleteModal) deleteModal.show();
        };

        const deleteItem = () => {
          state.compraActual.items = state.compraActual.items.filter((item) => item.id !== state.deleteItemId);
          state.deleteItemId = null;
          renderItems();
          if (deleteModal) deleteModal.hide();
        };

        const finalizarCompra = async () => {
          if (!(await ensureSupermercadoSeleccionado())) return;
          if (!state.compraActual.items.length) {
            refs.formItemError.textContent = "Debes agregar al menos un item para finalizar.";
            return;
          }
          const isEditing = Boolean(state.editingHistoryId);
          const targetUrl = isEditing
            ? `${API.historicos}/${encodeURIComponent(state.editingHistoryId)}`
            : API.historicos;
          const targetMethod = isEditing ? "PUT" : "POST";
          try {
            const payload = await apiRequest(targetUrl, {
              method: targetMethod,
              body: {
                supermercado: state.compraActual.supermercado,
                items: state.compraActual.items.map((item) => ({
                  producto: item.producto,
                  precio: Math.max(0, Math.round(Number(item.precio || 0))),
                  cantidad: Number(item.cantidad || 1),
                })),
              },
            });
            const compra = mapCompraFromApi(payload || {});
            if (isEditing) {
              replaceHistoryEntry(compra);
            } else {
              state.historicosCompras.unshift(compra);
            }
            state.highlightedHistoryId = compra.id;
            await syncRemoteData();
          } catch (error) {
            refs.formItemError.textContent = error?.message || (
              isEditing ? "No se pudo actualizar la compra." : "No se pudo finalizar la compra."
            );
            return;
          }
          state.compraActual = { supermercado: "", items: [] };
          state.editingHistoryId = null;
          refs.inputSupermercado.value = "";
          setSupermercadoSeleccionado("");
          clearItemForm();
          renderItems();
          renderHistoricos();
          renderInicioResumen();
          switchView("historicos");
        };

        const deleteHistory = async (historyId) => {
          try {
            await apiRequest(`${API.historicos}/${encodeURIComponent(historyId)}`, { method: "DELETE" });
          } catch (error) {
            refs.formItemError.textContent = error?.message || "No se pudo eliminar la compra.";
            return;
          }
          state.historicosCompras = state.historicosCompras.filter((entry) => String(entry.id) !== String(historyId));
          renderHistoricos();
          renderInicioResumen();
        };

        const clearAllHistory = async () => {
          try {
            await apiRequest(API.historicos, { method: "DELETE" });
          } catch (error) {
            refs.formItemError.textContent = error?.message || "No se pudo limpiar el historico.";
            return;
          }
          state.historicosCompras = [];
          state.highlightedHistoryId = null;
          renderHistoricos();
          renderInicioResumen();
        };

        const repeatHistory = (historyId) => {
          const entry = state.historicosCompras.find((item) => String(item.id) === String(historyId));
          if (!entry) return;
          state.editingHistoryId = String(entry.id);
          state.compraActual.supermercado = entry.supermercado;
          state.compraActual.items = (entry.items || []).map((item) => ({
            ...item,
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          }));
          refs.inputSupermercado.value = entry.supermercado;
          setSupermercadoSeleccionado(entry.supermercado);
          renderItems();
          switchView("nueva");
        };

        const replaceHistoryEntry = (updatedEntry) => {
          const mapped = mapCompraFromApi(updatedEntry || {});
          const idx = state.historicosCompras.findIndex((item) => String(item.id) === String(mapped.id));
          if (idx >= 0) {
            state.historicosCompras[idx] = mapped;
          } else {
            state.historicosCompras.unshift(mapped);
          }
        };

        let historicosDataTable = null;
        const destroyHistoricosDataTable = () => {
          if (!(window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable)) return;
          const table = document.getElementById("historicos-table");
          if (table && window.jQuery.fn.DataTable.isDataTable(table)) {
            window.jQuery(table).DataTable().destroy();
          }
          historicosDataTable = null;
        };

        const initHistoricosDataTable = () => {
          const table = document.getElementById("historicos-table");
          if (!table) return;
          if (!(window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable)) return;
          const $table = window.jQuery(table);
          if (window.jQuery.fn.DataTable.isDataTable(table)) {
            $table.DataTable().destroy();
          }
          historicosDataTable = $table.DataTable({
            pageLength: 10,
            lengthMenu: [[10, 20, 50, -1], [10, 20, 50, "Todos"]],
            order: [[0, "desc"]],
            columnDefs: [{ orderable: false, targets: [4] }],
            language: {
              lengthMenu: "Mostrar _MENU_ compras",
              search: "Buscar:",
              info: "Mostrando _START_ a _END_ de _TOTAL_ compras",
              infoEmpty: "Mostrando 0 a 0 de 0 compras",
              zeroRecords: "Sin compras",
              paginate: {
                first: "Primero",
                last: "Ultimo",
                next: "Siguiente",
                previous: "Anterior",
              },
            },
          });
        };

        const updateHistoryItemCheck = async (historyId, itemId, checked) => {
          try {
            const updated = await apiRequest(
              `${API.historicos}/${encodeURIComponent(historyId)}/items/${encodeURIComponent(itemId)}/check`,
              {
                method: "PUT",
                body: { ticket_validado: Boolean(checked) },
              }
            );
            replaceHistoryEntry(updated);
            renderHistoricos();
            if (state.view === "detalle" && String(state.selectedHistoryId) === String(historyId)) {
              openHistoryDetail(historyId);
            }
          } catch (error) {
            refs.formItemError.textContent = error?.message || "No se pudo actualizar el check del item.";
          }
        };

        const openHistoryDetail = (historyId) => {
          state.selectedHistoryId = historyId;
          const entry = state.historicosCompras.find((item) => String(item.id) === String(historyId));
          if (!entry) {
            refs.detalleCompra.innerHTML = '<p class="text-muted mb-0">Compra no encontrada.</p>';
            switchView("detalle");
            return;
          }
          refs.detalleCompra.innerHTML = `
            <p class="mb-1"><strong>Supermercado:</strong> ${entry.supermercado}</p>
            <p class="mb-3 text-muted"><strong>Fecha:</strong> ${formatDateTime(entry.fecha)}</p>
            <div class="table-responsive mb-3">
              <table class="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="text-end">Detalle</th>
                    <th class="text-end">Variacion precio</th>
                    <th class="text-center">Check ticket</th>
                  </tr>
                </thead>
                <tbody>
                  ${(entry.items || [])
                    .map((item) => {
                      const previousPrice = previousPriceForHistoryItem(entry, item);
                      const hasPreviousPrice = Number.isFinite(previousPrice) && Number(previousPrice) > 0;
                      const delta = hasPreviousPrice
                        ? Math.round(Number(item?.precio || 0) - Number(previousPrice || 0))
                        : 0;
                      const deltaClass = delta > 0 ? "text-danger" : delta < 0 ? "text-success" : "text-muted";
                      const deltaPrefix = delta > 0 ? "+" : delta < 0 ? "-" : "";
                      const deltaLabel = hasPreviousPrice
                        ? `${deltaPrefix}${formatGsNumber(Math.abs(delta))} Gs`
                        : "-";
                      return `
                        <tr>
                          <td>${item.producto}</td>
                          <td class="text-end">${formatGs(item.precio)} x ${formatQuantity(item.cantidad)} = ${formatGs(itemTotal(item))}</td>
                          <td class="text-end ${deltaClass} fw-semibold">${deltaLabel}</td>
                          <td class="text-center">
                            <div class="form-check d-inline-flex align-items-center gap-1">
                              <input
                                class="form-check-input js-check-ticket-item"
                                type="checkbox"
                                data-history-id="${entry.id}"
                                data-item-id="${item.id}"
                                ${item.ticketValidado ? "checked" : ""}
                              />
                              <span class="badge ${item.ticketValidado ? "text-bg-success" : "text-bg-secondary"}">
                                ${item.ticketValidado ? "OK" : "Pend."}
                              </span>
                            </div>
                          </td>
                        </tr>
                      `
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
            <h4 class="h6 mb-0">Total: ${formatGs(entry.totalGeneral || 0)}</h4>
          `;
          switchView("detalle");
        };

        const renderHistoricos = () => {
          if (!state.historicosCompras.length) {
            destroyHistoricosDataTable();
            refs.historicosLista.innerHTML = '<div class="compras-list-empty">No hay compras registradas.</div>';
            return;
          }
          const rows = state.historicosCompras
            .map((entry) => {
              const totalItems = Array.isArray(entry.items) ? entry.items.length : 0;
              const checkedItems = Array.isArray(entry.items)
                ? entry.items.filter((item) => Boolean(item.ticketValidado)).length
                : 0;
              const isAllChecked = totalItems > 0 && checkedItems === totalItems;
              const statusClass = isAllChecked ? "text-success" : "text-warning";
              const statusIcon = isAllChecked ? "bi-check-circle-fill" : "bi-hourglass-split";
              const statusText = isAllChecked ? "Validado" : "Pendiente";
              const rowClass = state.highlightedHistoryId === entry.id ? "compras-history-highlight" : "";
              return `
                <tr class="${rowClass}">
                  <td data-order="${entry.fecha || ""}">${formatDateTime(entry.fecha)}</td>
                  <td>${entry.supermercado || "-"}</td>
                  <td class="text-end fw-semibold">${formatGs(entry.totalGeneral || 0)}</td>
                  <td>
                    <span class="${statusClass}">
                      <i class="bi ${statusIcon} me-1"></i>${statusText} ${checkedItems}/${totalItems}
                    </span>
                  </td>
                  <td>
                    <div class="historicos-actions">
                      <button class="btn btn-outline-primary btn-sm js-ver-detalle" data-id="${entry.id}" type="button" aria-label="Ver detalle" title="Ver detalle">
                        <i class="bi bi-eye"></i>
                      </button>
                      <button class="btn btn-outline-secondary btn-sm js-editar-compra" data-id="${entry.id}" type="button" aria-label="Editar compra" title="Editar compra">
                        <i class="bi bi-pencil-square"></i>
                      </button>
                      <button class="btn btn-outline-danger btn-sm js-eliminar-compra" data-id="${entry.id}" type="button" aria-label="Eliminar compra" title="Eliminar compra">
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("");
          refs.historicosLista.innerHTML = `
            <div class="card">
              <div class="card-body">
                <div class="table-responsive">
                  <table class="table table-striped table-hover align-middle w-100" id="historicos-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Supermercado</th>
                        <th class="text-end">Total</th>
                        <th>Validacion</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
          initHistoricosDataTable();
        };

        const bindAutocomplete = (inputEl, listEl, catalog, onPick, onConfirm) => {
          if (!inputEl || !listEl) return;
          inputEl.addEventListener("input", () => {
            renderSuggestions(listEl, filteredSuggestions(catalog, inputEl.value), onPick);
          });
          inputEl.addEventListener("focus", () => {
            renderSuggestions(listEl, filteredSuggestions(catalog, inputEl.value), onPick);
          });
          inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (typeof onConfirm === "function") onConfirm();
            }
          });
        };

        const bootstrapData = async () => {
          await syncRemoteData();
        };

        const bindEvents = () => {
          refs.btnNueva.addEventListener("click", () => {
            state.highlightedHistoryId = null;
            state.editingHistoryId = null;
            updateTotalHeader();
            switchView("nueva");
          });
          refs.btnHistoricos.addEventListener("click", async () => {
            try {
              await syncRemoteData();
              renderHistoricos();
              renderInicioResumen();
            } catch (error) {
              refs.formItemError.textContent = error?.message || "No se pudieron cargar los historicos.";
            }
            switchView("historicos");
          });
          refs.btnReportes.addEventListener("click", async () => {
            try {
              await syncRemoteData();
              renderReportes();
            } catch (error) {
              refs.formItemError.textContent = error?.message || "No se pudieron cargar los reportes.";
            }
            switchView("reportes");
          });
          refs.btnProductos.addEventListener("click", () => {
            refs.catalogoProductoError.textContent = "";
            refs.catalogoSupermercadoError.textContent = "";
            renderCatalogoProductos();
            renderCatalogoSupermercados();
            switchView("productos");
          });
          refs.btnSupermercados.addEventListener("click", () => {
            refs.catalogoProductoError.textContent = "";
            refs.catalogoSupermercadoError.textContent = "";
            renderCatalogoProductos();
            renderCatalogoSupermercados();
            switchView("productos");
            refs.catalogoSupermercadoInput?.focus();
          });
          refs.btnVolverInicio.addEventListener("click", () => switchView("inicio"));
          refs.btnVolverNuevaProductos.addEventListener("click", () => switchView("nueva"));
          refs.btnVolverInicioHistoricos.addEventListener("click", () => switchView("inicio"));
          refs.btnVolverInicioReportes.addEventListener("click", () => switchView("inicio"));
          refs.btnVolverHistoricos.addEventListener("click", () => switchView("historicos"));
          refs.btnReportAplicarRango.addEventListener("click", () => {
            renderReportesGenerales();
            persistDraftState();
          });
          refs.btnReportProductoAplicar.addEventListener("click", () => {
            renderProductVariation();
            persistDraftState();
          });
          refs.reportProductoSelect.addEventListener("change", () => {
            renderProductVariation();
            persistDraftState();
          });
          refs.reportProductoDesde.addEventListener("change", () => {
            renderProductVariation();
            persistDraftState();
          });
          refs.reportProductoHasta.addEventListener("change", () => {
            renderProductVariation();
            persistDraftState();
          });
          refs.reportDesde.addEventListener("change", () => {
            renderReportesGenerales();
            persistDraftState();
          });
          refs.reportHasta.addEventListener("change", () => {
            renderReportesGenerales();
            persistDraftState();
          });
          refs.btnLimpiarHistorico.addEventListener("click", async () => {
            if (!state.historicosCompras.length) return;
            if (!window.confirm("¿Eliminar todo el historico?")) return;
            await clearAllHistory();
          });

          bindAutocomplete(
            refs.inputSupermercado,
            refs.supermercadoSuggestions,
            state.catalogoSupermercados,
            (value) => {
              refs.inputSupermercado.value = value;
              setSupermercadoSeleccionado(value);
              autofillPriceFromHistory();
            },
            () => {
              void confirmSupermercadoInput();
            }
          );
          refs.btnUsarSupermercado.addEventListener("click", async () => {
            const ok = await confirmSupermercadoInput();
            if (ok) autofillPriceFromHistory();
          });
          refs.inputSupermercado.addEventListener("input", () => {
            refs.supermercadoError.textContent = "";
            persistDraftState();
          });

          bindAutocomplete(
            refs.inputProducto,
            refs.productoSuggestions,
            state.catalogoProductos,
            (value) => {
              refs.inputProducto.value = value;
              refs.productoSuggestions.classList.add("d-none");
              autofillPriceFromHistory({ force: true });
            },
            () => refs.btnAgregarItem.click()
          );
          refs.inputProducto.addEventListener("blur", () => {
            autofillPriceFromHistory();
          });

          refs.inputPrecio.addEventListener("input", () => {
            refs.inputPrecio.value = formatPriceInput(refs.inputPrecio.value);
            renderPreviewItemTotal();
          });
          refs.inputCantidad.addEventListener("input", () => {
            renderPreviewItemTotal();
            persistDraftState();
          });
          refs.inputProducto.addEventListener("input", () => {
            refs.formItemError.textContent = "";
            persistDraftState();
          });
          refs.inputPrecio.addEventListener("input", () => {
            refs.formItemError.textContent = "";
            persistDraftState();
          });
          refs.inputCantidad.addEventListener("input", () => {
            refs.formItemError.textContent = "";
            persistDraftState();
          });
          refs.btnAgregarItem.addEventListener("click", async () => {
            await addItem();
          });
          refs.btnFinalizar.addEventListener("click", async () => {
            await finalizarCompra();
          });
          refs.catalogoProductoAgregar.addEventListener("click", async () => {
            await addCatalogoProducto();
          });
          refs.catalogoProductoInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addCatalogoProducto();
            }
          });
          refs.catalogoProductosLista.addEventListener("click", (event) => {
            const editBtn = event.target.closest(".js-edit-catalog-product");
            if (editBtn) {
              void editCatalogoProducto(decodeURIComponent(editBtn.dataset.product || ""));
              return;
            }
            const deleteBtn = event.target.closest(".js-delete-catalog-product");
            if (deleteBtn) {
              void deleteCatalogoProducto(decodeURIComponent(deleteBtn.dataset.product || ""));
            }
          });
          refs.catalogoSupermercadoAgregar.addEventListener("click", async () => {
            await addCatalogoSupermercado();
          });
          refs.catalogoSupermercadoInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addCatalogoSupermercado();
            }
          });
          refs.catalogoSupermercadosLista.addEventListener("click", (event) => {
            const editBtn = event.target.closest(".js-edit-catalog-supermarket");
            if (editBtn) {
              void editCatalogoSupermercado(decodeURIComponent(editBtn.dataset.store || ""));
              return;
            }
            const deleteBtn = event.target.closest(".js-delete-catalog-supermarket");
            if (deleteBtn) {
              void deleteCatalogoSupermercado(decodeURIComponent(deleteBtn.dataset.store || ""));
            }
          });

          refs.listaItems.addEventListener("click", (event) => {
            const editBtn = event.target.closest(".js-edit-item");
            if (editBtn) {
              openEditItem(editBtn.dataset.id);
              return;
            }
            const deleteBtn = event.target.closest(".js-delete-item");
            if (deleteBtn) {
              openDeleteItem(deleteBtn.dataset.id);
            }
          });

          bindAutocomplete(
            refs.editProducto,
            refs.editProductoSuggestions,
            state.catalogoProductos,
            (value) => {
              refs.editProducto.value = value;
              refs.editProductoSuggestions.classList.add("d-none");
            },
            () => {
              void saveEditedItem();
            }
          );
          refs.editPrecio.addEventListener("input", () => {
            refs.editPrecio.value = formatPriceInput(refs.editPrecio.value);
            refs.editTotal.textContent = formatGs(parseMoney(refs.editPrecio.value) * parseQuantity(refs.editCantidad.value));
          });
          refs.editCantidad.addEventListener("input", () => {
            refs.editTotal.textContent = formatGs(parseMoney(refs.editPrecio.value) * parseQuantity(refs.editCantidad.value));
          });
          refs.btnGuardarEdicion.addEventListener("click", async () => {
            await saveEditedItem();
          });
          refs.btnConfirmarEliminar.addEventListener("click", deleteItem);

          refs.historicosLista.addEventListener("click", (event) => {
            const detailBtn = event.target.closest(".js-ver-detalle");
            if (detailBtn) {
              openHistoryDetail(detailBtn.dataset.id);
              return;
            }
            const editBtn = event.target.closest(".js-editar-compra");
            if (editBtn) {
              repeatHistory(editBtn.dataset.id);
              return;
            }
            const deleteBtn = event.target.closest(".js-eliminar-compra");
            if (deleteBtn && window.confirm("¿Eliminar esta compra del historico?")) {
              void deleteHistory(deleteBtn.dataset.id);
            }
          });

          refs.detalleCompra.addEventListener("change", (event) => {
            const checkbox = event.target.closest(".js-check-ticket-item");
            if (!checkbox) return;
            const historyId = checkbox.dataset.historyId;
            const itemId = checkbox.dataset.itemId;
            if (!historyId || !itemId) return;
            void updateHistoryItemCheck(historyId, itemId, checkbox.checked);
          });

          document.addEventListener("click", (event) => {
            if (!event.target.closest(".autocomplete-wrap")) {
              refs.supermercadoSuggestions.classList.add("d-none");
              refs.productoSuggestions.classList.add("d-none");
              refs.editProductoSuggestions.classList.add("d-none");
            }
          });
        };

        const init = async () => {
          const restoredDraft = loadDraftState();
          try {
            await bootstrapData();
          } catch (error) {
            refs.formItemError.textContent = error?.message || "No se pudieron cargar datos de compras.";
          }
          bindEvents();
          renderInicioResumen();
          renderPreviewItemTotal();
          renderItems();
          renderCatalogoProductos();
          renderCatalogoSupermercados();
          renderHistoricos();
          if (refs.inputSupermercado.value && !state.compraActual.supermercado) {
            setSupermercadoSeleccionado(refs.inputSupermercado.value);
          } else {
            setSupermercadoSeleccionado(state.compraActual.supermercado || "");
          }
          if (restoredDraft.view === "reportes") {
            renderReportes();
            switchView("reportes");
          } else if (restoredDraft.view === "detalle" && restoredDraft.selectedHistoryId) {
            openHistoryDetail(restoredDraft.selectedHistoryId);
          } else if (VALID_VIEWS.has(restoredDraft.view)) {
            switchView(restoredDraft.view);
          } else {
            switchView("inicio");
          }
          persistDraftState();
        };

        void init();
      })();
