import React, { useState, useEffect, useMemo } from "react";
import {
  MdClose,
  MdFileUpload,
  MdFileDownload,
  MdSearch,
  MdCheckCircle,
  MdCalendarToday,
  MdRoom,
  MdStar,
} from "react-icons/md";
import "./PackageImportModal.scss";
import axios from "../../../../../../utils/axiosInstance";
import { getProxyUrl } from "../../../../../../services/presignedUrlService";

const PackageImportModal = ({
  onClose,
  onImport,
  onExport,
  currentItinerary,
  currentPackageType = "compartido",
  adultCount = 1, // Cantidad de adultos en la cotización actual
  currentFee = null,
}) => {
  const [activeTab, setActiveTab] = useState("import");
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [exportDetails, setExportDetails] = useState({
    nombre: "",
    descripcion: "",
    packagetype: currentPackageType, // Initialize with the current package type
    fee: currentFee ?? "",
  });

  // Estadísticas del itinerario actual para exportar
  const [itinerarySummary, setItinerarySummary] = useState({
    totalDays: 0,
    totalServices: 0,
    servicesByCategory: {},
    estimatedValue: 0,
  });

  // Update export details when currentPackageType changes
  useEffect(() => {
    setExportDetails((prev) => ({
      ...prev,
      packagetype: currentPackageType,
      fee: prev.fee === "" && currentFee != null ? currentFee : prev.fee,
    }));
  }, [currentPackageType, currentFee]);

  useEffect(() => {
    if (activeTab === "import") {
      fetchPackages();
    } else if (activeTab === "export" && currentItinerary) {
      generateItinerarySummary();
    }
  }, [activeTab, currentItinerary]);

  // Función para generar un resumen conciso del itinerario
  const generateItinerarySummary = () => {
    if (
      !currentItinerary ||
      !Array.isArray(currentItinerary) ||
      currentItinerary.length === 0
    ) {
      setItinerarySummary({
        totalDays: 0,
        totalServices: 0,
        servicesByCategory: {},
        estimatedValue: 0,
        hotelServicesExcluded: 0,
      });
      return;
    }

    // Contar días y servicios
    const totalDays = currentItinerary.length;
    let totalServices = 0;
    let estimatedValue = 0;
    let hotelServicesExcluded = 0;
    const servicesByCategory = {};

    // Procesar cada día para obtener estadísticas
    currentItinerary.forEach((day) => {
      if (day.servicios && Array.isArray(day.servicios)) {
        day.servicios.forEach((service) => {
          const categoria = (
            service.parentService?.typeService ||
            service.typeService ||
            "Sin categoría"
          ).toLowerCase();

          // Excluir hoteles del conteo
          if (categoria === "hoteles") {
            hotelServicesExcluded++;
            return;
          }

          totalServices++;
          const precio_original = parseFloat(
            service.tariff?.precio_original || service.tariff?.precio || 0,
          );
          estimatedValue += precio_original;

          // Agrupar por categoría
          if (!servicesByCategory[categoria]) {
            servicesByCategory[categoria] = 0;
          }
          servicesByCategory[categoria]++;
        });
      }
    });

    setItinerarySummary({
      totalDays,
      totalServices,
      servicesByCategory,
      estimatedValue,
      hotelServicesExcluded,
    });
  };

  const fetchPackages = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get("/turismo/paquetes-turisticos");
      if (response.data && response.data.success) {
        setPackages(response.data.data || []);
      }
    } catch (err) {
      setError(
        "Error al cargar paquetes: " + (err.message || "Error desconocido"),
      );
      console.error("Error fetching packages:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (selectedPackage) {
      onImport(selectedPackage);
    }
  };

  const handleExport = () => {
    if (!exportDetails.nombre) {
      setError("Se requiere un nombre para el paquete");
      return;
    }

    // Make sure we're passing the current packageType
    const exportData = {
      ...exportDetails,
      packagetype: exportDetails.packagetype || currentPackageType,
    };

    onExport(exportData);
  };

  const filteredPackages = searchTerm
    ? packages.filter(
        (pkg) =>
          pkg.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pkg.packagetype?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : packages;

  return (
    <div className="package-import-modal-overlay">
      <div className="package-import-modal">
        <div className="modal-header">
          <h2>
            {activeTab === "import"
              ? "Importar Paquete"
              : "Exportar Itinerario"}
          </h2>
          <button className="close-button" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-button ${activeTab === "import" ? "active" : ""}`}
            onClick={() => setActiveTab("import")}
          >
            <MdFileUpload /> Importar
          </button>
          <button
            className={`tab-button ${activeTab === "export" ? "active" : ""}`}
            onClick={() => setActiveTab("export")}
          >
            <MdFileDownload /> Exportar
          </button>
        </div>

        <div className="modal-content">
          {error && <div className="error-message">{error}</div>}

          {activeTab === "import" && (
            <div className="import-content">
              {/* Info sobre ajuste de pasajeros */}
              <div
                className="import-info-banner"
                style={{
                  background: "#e8f5e9",
                  border: "1px solid #a5d6a7",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "12px",
                  fontSize: "0.85rem",
                  color: "#2e7d32",
                }}
              >
                <strong> Nota:</strong> Los paquetes contienen precios base (1
                persona). Al importar, los costos se ajustarán a los{" "}
                <strong>{adultCount} adulto(s)</strong> de esta cotización:
                transportes y guías se dividen entre pasajeros; trenes, vuelos,
                tickets y restaurantes se multiplican. Los servicios de hotel no
                se incluyen (se gestionan por separado).
              </div>
              <div className="search-container">
                <MdSearch className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar paquetes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>

              <div className="packages-list">
                {loading ? (
                  <div className="loading-spinner">Cargando paquetes...</div>
                ) : filteredPackages.length === 0 ? (
                  <div className="no-packages">
                    {searchTerm
                      ? "No se encontraron paquetes que coincidan con la búsqueda"
                      : "No hay paquetes disponibles"}
                  </div>
                ) : (
                  filteredPackages.map((pkg) => {
                    // Contar servicios excluyendo hoteles
                    const itinerario = pkg.itinerario || [];
                    const totalDays = itinerario.length;
                    const serviceCategories = {};
                    let totalServices = 0;

                    itinerario.forEach((day) => {
                      (day.servicios || []).forEach((s) => {
                        const ts = (
                          s?.parentService?.typeService ||
                          s?.typeService ||
                          ""
                        ).toLowerCase();
                        if (ts === "hoteles") return;
                        totalServices++;
                        serviceCategories[ts] =
                          (serviceCategories[ts] || 0) + 1;
                      });
                    });

                    const categoryLabels = Object.entries(serviceCategories)
                      .map(([cat, count]) => `${count} ${cat}`)
                      .join(" · ");

                    const imgSrc = pkg.imagen ? getProxyUrl(pkg.imagen) : null;

                    return (
                      <div
                        key={pkg.id}
                        className={`package-item ${selectedPackage?.id === pkg.id ? "selected" : ""}`}
                        onClick={() => setSelectedPackage(pkg)}
                      >
                        {imgSrc ? (
                          <div className="package-thumb">
                            <img src={imgSrc} alt={pkg.nombre} loading="lazy" />
                          </div>
                        ) : (
                          <div className="package-thumb package-thumb--empty">
                            <MdRoom />
                          </div>
                        )}
                        <div className="package-info">
                          <h3>{pkg.nombre}</h3>
                          <div className="package-meta">
                            <span className={`package-type ${pkg.packagetype}`}>
                              {pkg.packagetype === "privado"
                                ? "Privado"
                                : "Compartido"}
                            </span>
                            {pkg.fee != null && Number.isFinite(Number(pkg.fee)) && (
                              <span className="package-stat">Fee {Number(pkg.fee)}%</span>
                            )}
                            {pkg.destacado && (
                              <span className="package-badge package-badge--featured">
                                <MdStar /> Destacado
                              </span>
                            )}
                            <span className="package-stat">
                              <MdCalendarToday /> {totalDays}{" "}
                              {totalDays === 1 ? "día" : "días"}
                            </span>
                            <span className="package-stat">
                              {totalServices} servicio
                              {totalServices !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {categoryLabels && (
                            <p className="package-categories">
                              {categoryLabels}
                            </p>
                          )}
                          {pkg.descripcion && (
                            <p className="package-description">
                              {pkg.descripcion}
                            </p>
                          )}
                        </div>
                        {selectedPackage?.id === pkg.id && (
                          <div className="selected-indicator">
                            <MdCheckCircle />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === "export" && (
            <div className="export-content">
              <div className="form-group">
                <label htmlFor="nombre">Nombre del paquete *</label>
                <input
                  type="text"
                  id="nombre"
                  value={exportDetails.nombre}
                  onChange={(e) =>
                    setExportDetails({
                      ...exportDetails,
                      nombre: e.target.value,
                    })
                  }
                  placeholder="Nombre del paquete turístico"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="descripcion">Descripción</label>
                <textarea
                  id="descripcion"
                  value={exportDetails.descripcion}
                  onChange={(e) =>
                    setExportDetails({
                      ...exportDetails,
                      descripcion: e.target.value,
                    })
                  }
                  placeholder="Descripción breve del paquete"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label htmlFor="packagetype">Tipo de Paquete</label>
                <select
                  id="packagetype"
                  value={exportDetails.packagetype}
                  onChange={(e) =>
                    setExportDetails({
                      ...exportDetails,
                      packagetype: e.target.value,
                    })
                  }
                >
                  <option value="compartido">Compartido</option>
                  <option value="privado">Privado</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="fee">Fee del paquete (%)</label>
                <input
                  type="number"
                  id="fee"
                  min="0"
                  max="100"
                  step="0.1"
                  value={exportDetails.fee ?? ""}
                  onChange={(e) =>
                    setExportDetails({ ...exportDetails, fee: e.target.value })
                  }
                  placeholder="Vacío = sin fee propio"
                />
              </div>

              {/* Resumen conciso del itinerario a exportar */}
              <div className="itinerary-summary">
                <h3>Resumen del Itinerario a Exportar</h3>

                {itinerarySummary.totalDays > 0 ? (
                  <div className="summary-content">
                    <div className="summary-item">
                      <div className="summary-label">Días:</div>
                      <div className="summary-value">
                        {itinerarySummary.totalDays}
                      </div>
                    </div>

                    <div className="summary-item">
                      <div className="summary-label">Servicios:</div>
                      <div className="summary-value">
                        {itinerarySummary.totalServices}
                      </div>
                    </div>

                    <div className="summary-item">
                      <div className="summary-label">Valor estimado:</div>
                      <div className="summary-value">
                        ${itinerarySummary.estimatedValue.toFixed(2)}
                      </div>
                    </div>

                    {/* Mostrar servicios por categoría */}
                    {Object.keys(itinerarySummary.servicesByCategory).length >
                      0 && (
                      <div className="categories-summary">
                        <h4>Servicios por categoría</h4>
                        <ul>
                          {Object.entries(
                            itinerarySummary.servicesByCategory,
                          ).map(([category, count]) => (
                            <li key={category}>
                              <span className="category-name">{category}:</span>
                              <span className="category-count">{count}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="no-itinerary">
                    No hay itinerario para exportar o el itinerario está vacío
                  </p>
                )}

                {/* Aviso sobre exclusión de hoteles */}
                {itinerarySummary.hotelServicesExcluded > 0 && (
                  <div
                    style={{
                      background: "#fff3e0",
                      border: "1px solid #ffcc80",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      marginTop: "12px",
                      fontSize: "0.83rem",
                      color: "#e65100",
                    }}
                  >
                    <strong></strong> Se excluirán{" "}
                    <strong>{itinerarySummary.hotelServicesExcluded}</strong>{" "}
                    servicio(s) de hotel. Los paquetes turísticos no incluyen
                    hoteles (se gestionan por separado en cada cotización).
                  </div>
                )}

                <div
                  style={{
                    background: "#e3f2fd",
                    border: "1px solid #90caf9",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    marginTop: "8px",
                    fontSize: "0.83rem",
                    color: "#1565c0",
                  }}
                >
                  <strong></strong> Los precios se normalizarán a base
                  individual (1 persona): transportes y guías conservan su costo
                  total de grupo; servicios por persona guardan su precio
                  unitario.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancelar
          </button>
          {activeTab === "import" ? (
            <button
              className="confirm-button"
              onClick={handleImport}
              disabled={!selectedPackage}
            >
              Importar
            </button>
          ) : (
            <button
              className="confirm-button"
              onClick={handleExport}
              disabled={
                !exportDetails.nombre || itinerarySummary.totalDays === 0
              }
            >
              Exportar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackageImportModal;
