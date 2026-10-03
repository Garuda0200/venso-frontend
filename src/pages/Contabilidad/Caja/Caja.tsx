import React, { useCallback, useState } from "react";
import { FaCashRegister, FaExchangeAlt } from "react-icons/fa";
import { MdCurrencyExchange } from "react-icons/md";
import SaldosOverview from "../../../components/Contabilidad/SaldosOverview";
import TransferenciasHistorial from "../../../components/Contabilidad/TransferenciasHistorial";
import ExchangeRatesManager from "../../../components/Contabilidad/ExchangeRatesManager";
import PendingPaymentsAccess from "../../../components/Contabilidad/PendingPaymentsAccess";
import "./Caja.scss";

/** Las cuentas y los movimientos son superficies separadas de Contabilidad. */
export function Caja() {
  const [activeTab, setActiveTab] = useState("cuentas");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refreshData = useCallback(() => setRefreshTrigger((current) => current + 1), []);

  return (
    <div className="caja-page caja-page--accounts">
      <header className="page-header caja-accounts-header">
        <div>
          <span className="caja-accounts-eyebrow">Contabilidad</span>
          <h1 className="page-title">Cuentas</h1>
          <p>Disponibilidad, transferencias internas y tipo de cambio.</p>
        </div>
        <PendingPaymentsAccess onPaymentSaved={refreshData} />
        <div className="main-tabs" role="tablist" aria-label="Secciones de cuentas">
          <button className={`main-tab ${activeTab === "cuentas" ? "active" : ""}`} onClick={() => setActiveTab("cuentas")} type="button"><FaCashRegister /> Resumen de cuentas</button>
          <button className={`main-tab ${activeTab === "tasas" ? "active" : ""}`} onClick={() => setActiveTab("tasas")} type="button"><MdCurrencyExchange /> Tasas de cambio</button>
        </div>
      </header>

      {activeTab === "cuentas" ? (
        <>
          <section className="section-saldos"><SaldosOverview refreshTrigger={refreshTrigger} refreshData={refreshData} /></section>
          <section className="section-transferencias">
            <div className="caja-section-heading"><div><span className="caja-accounts-eyebrow">Flujo interno</span><h2><FaExchangeAlt /> Transferencias</h2></div></div>
            <TransferenciasHistorial refreshTrigger={refreshTrigger} />
          </section>
        </>
      ) : <section className="section-tasas"><ExchangeRatesManager refreshTrigger={refreshTrigger} /></section>}
    </div>
  );
}
