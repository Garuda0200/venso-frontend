import React from "react";
import "./ReportChart.scss";

const ReportChart = ({ data }) => {
  // Preparar datos para gráfico de barras por moneda
  const chartDataMoneda = [
    {
      name: "Soles",
      ingresos: data.totalesPorMoneda.soles.ingresos,
      egresos: data.totalesPorMoneda.soles.egresos,
      balance:
        data.totalesPorMoneda.soles.ingresos -
        data.totalesPorMoneda.soles.egresos,
    },
    {
      name: "Dólares",
      ingresos: data.totalesPorMoneda.dolares.ingresos,
      egresos: data.totalesPorMoneda.dolares.egresos,
      balance:
        data.totalesPorMoneda.dolares.ingresos -
        data.totalesPorMoneda.dolares.egresos,
    },
  ];

  // Preparar datos para gráfico de distribución por tipo de cuenta
  const totalEfectivo =
    data.totalesPorTipo.efectivo.ingresos +
    data.totalesPorTipo.efectivo.egresos;
  const totalCuenta =
    data.totalesPorTipo.cuenta.ingresos + data.totalesPorTipo.cuenta.egresos;
  const totalGeneral = totalEfectivo + totalCuenta;

  const porcentajeEfectivo =
    totalGeneral > 0 ? (totalEfectivo / totalGeneral) * 100 : 0;
  const porcentajeCuenta =
    totalGeneral > 0 ? (totalCuenta / totalGeneral) * 100 : 0;

  // Encontrar el valor máximo para normalizar las barras
  const maxValue = Math.max(
    ...chartDataMoneda.flatMap((item) => [
      Math.abs(item.ingresos),
      Math.abs(item.egresos),
      Math.abs(item.balance),
    ]),
  );

  const formatMonto = (monto) => {
    return `S/ ${Math.abs(monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
  };

  const getBarHeight = (value) => {
    if (maxValue === 0) return 0;
    return (Math.abs(value) / maxValue) * 100;
  };

  return (
    <div className="report-charts">
      <div className="charts-grid">
        {/* Gráfico de Barras - Ingresos vs Egresos por Moneda */}
        <div className="chart-container">
          <div className="chart-header">
            <h3>Ingresos vs Egresos por Moneda</h3>
            <p>Comparación de movimientos financieros</p>
          </div>

          <div className="bar-chart">
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-color ingresos"></span>
                <span>Ingresos</span>
              </div>
              <div className="legend-item">
                <span className="legend-color egresos"></span>
                <span>Egresos</span>
              </div>
              <div className="legend-item">
                <span className="legend-color balance"></span>
                <span>Balance</span>
              </div>
            </div>

            <div className="bars-container">
              {chartDataMoneda.map((item, index) => (
                <div key={index} className="bar-group">
                  <div className="bar-group-label">{item.name}</div>
                  <div className="bars">
                    <div className="bar-item">
                      <div
                        className="bar ingresos"
                        style={{ height: `${getBarHeight(item.ingresos)}%` }}
                        title={`Ingresos: ${formatMonto(item.ingresos)}`}
                      >
                        <span className="bar-value">
                          {formatMonto(item.ingresos)}
                        </span>
                      </div>
                    </div>
                    <div className="bar-item">
                      <div
                        className="bar egresos"
                        style={{ height: `${getBarHeight(item.egresos)}%` }}
                        title={`Egresos: ${formatMonto(item.egresos)}`}
                      >
                        <span className="bar-value">
                          {formatMonto(item.egresos)}
                        </span>
                      </div>
                    </div>
                    <div className="bar-item">
                      <div
                        className={`bar balance ${item.balance >= 0 ? "positive" : "negative"}`}
                        style={{ height: `${getBarHeight(item.balance)}%` }}
                        title={`Balance: ${item.balance >= 0 ? "+" : "-"}${formatMonto(item.balance)}`}
                      >
                        <span className="bar-value">
                          {item.balance >= 0 ? "+" : "-"}
                          {formatMonto(item.balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gráfico de Distribución por Tipo de Cuenta */}
        <div className="chart-container">
          <div className="chart-header">
            <h3>Distribución por Tipo de Cuenta</h3>
            <p>Porcentaje de movimientos por cuenta</p>
          </div>

          <div className="pie-chart">
            <div className="pie-chart-visual">
              <div className="pie-slice-container">
                <div
                  className="pie-slice efectivo"
                  style={{
                    "--percentage": porcentajeEfectivo,
                    "--color": "#667eea",
                  }}
                ></div>
                <div
                  className="pie-slice cuenta"
                  style={{
                    "--percentage": porcentajeCuenta,
                    "--color": "#764ba2",
                    "--rotation": porcentajeEfectivo * 3.6,
                  }}
                ></div>
              </div>
              <div className="pie-center">
                <div className="pie-total">
                  <span className="pie-total-label">Total</span>
                  <span className="pie-total-value">
                    {formatMonto(totalGeneral)}
                  </span>
                </div>
              </div>
            </div>

            <div className="pie-legend">
              <div className="pie-legend-item">
                <span
                  className="pie-legend-color"
                  style={{ backgroundColor: "#667eea" }}
                ></span>
                <div className="pie-legend-info">
                  <span className="pie-legend-label">Efectivo</span>
                  <span className="pie-legend-value">
                    {formatMonto(totalEfectivo)}
                  </span>
                  <span className="pie-legend-percentage">
                    ({porcentajeEfectivo.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div className="pie-legend-item">
                <span
                  className="pie-legend-color"
                  style={{ backgroundColor: "#764ba2" }}
                ></span>
                <div className="pie-legend-info">
                  <span className="pie-legend-label">Cuenta Bancaria</span>
                  <span className="pie-legend-value">
                    {formatMonto(totalCuenta)}
                  </span>
                  <span className="pie-legend-percentage">
                    ({porcentajeCuenta.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen de Totales */}
        <div className="chart-container summary-chart">
          <div className="chart-header">
            <h3>Resumen de Totales</h3>
            <p>Comparativo general por moneda y tipo</p>
          </div>

          <div className="summary-grid">
            <div className="summary-card soles">
              <h4>Soles (S/)</h4>
              <div className="summary-item">
                <span>Ingresos:</span>
                <span className="amount positive">
                  +
                  {data.totalesPorMoneda.soles.ingresos.toLocaleString(
                    "es-PE",
                    { minimumFractionDigits: 2 },
                  )}
                </span>
              </div>
              <div className="summary-item">
                <span>Egresos:</span>
                <span className="amount negative">
                  -
                  {data.totalesPorMoneda.soles.egresos.toLocaleString("es-PE", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="summary-item total">
                <span>Balance:</span>
                <span
                  className={`amount ${data.totalesPorMoneda.soles.ingresos - data.totalesPorMoneda.soles.egresos >= 0 ? "positive" : "negative"}`}
                >
                  {data.totalesPorMoneda.soles.ingresos -
                    data.totalesPorMoneda.soles.egresos >=
                  0
                    ? "+"
                    : ""}
                  {(
                    data.totalesPorMoneda.soles.ingresos -
                    data.totalesPorMoneda.soles.egresos
                  ).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="summary-card dolares">
              <h4>Dólares (US$)</h4>
              <div className="summary-item">
                <span>Ingresos:</span>
                <span className="amount positive">
                  +
                  {data.totalesPorMoneda.dolares.ingresos.toLocaleString(
                    "es-PE",
                    { minimumFractionDigits: 2 },
                  )}
                </span>
              </div>
              <div className="summary-item">
                <span>Egresos:</span>
                <span className="amount negative">
                  -
                  {data.totalesPorMoneda.dolares.egresos.toLocaleString(
                    "es-PE",
                    { minimumFractionDigits: 2 },
                  )}
                </span>
              </div>
              <div className="summary-item total">
                <span>Balance:</span>
                <span
                  className={`amount ${data.totalesPorMoneda.dolares.ingresos - data.totalesPorMoneda.dolares.egresos >= 0 ? "positive" : "negative"}`}
                >
                  {data.totalesPorMoneda.dolares.ingresos -
                    data.totalesPorMoneda.dolares.egresos >=
                  0
                    ? "+"
                    : ""}
                  {(
                    data.totalesPorMoneda.dolares.ingresos -
                    data.totalesPorMoneda.dolares.egresos
                  ).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportChart;
