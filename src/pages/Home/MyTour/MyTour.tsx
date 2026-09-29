import React from "react";
import {
  FaGlobeAmericas,
  FaAward,
  FaTicketAlt,
  FaArrowRight,
  FaMapMarkerAlt,
  FaMoon,
} from "react-icons/fa";
import styles from "./MyTour.module.scss";

const bgImage = "/assets/Humantay_lake.webp";

export function MyTour() {
  return (
    <div
      className={styles.MyTourContainer}
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      <div className={styles.overlay}></div>
      <div className={styles.contentWrapper}>
        <div className={styles.myTourHeader}>
          <div className={styles.headerTitleContainer}>
            <FaGlobeAmericas className={styles.myTourIcon} />
            <h1>My Tour</h1>
          </div>
          <p className={styles.headerSubtitle}>VENSO TOURS</p>
        </div>

        <div className={styles.myTourCard}>
          <h3 className={styles.greenText}>
            Experiencias mágicas en Perú | Operador turístico
          </h3>
          <p className={styles.exploreText}>
            ¡Explora lo mejor de Perú con nuestro operador turístico! Disfruta
            de una experiencia única y personalizada, donde cada detalle está
            cuidadosamente diseñado para que te sumerjas en la cultura, la
            historia y la belleza de nuestro país. ¡Tu aventura en Perú comienza
            aquí!
          </p>

          <div className={styles.voucherSection}>
            <p className={styles.itineraryDescription}>
              Revisa tu itinerario ingresando el número de voucher:
            </p>
            <div className={styles.inputWithIcon}>
              <FaTicketAlt className={styles.iconLeft} />
              <input
                type="text"
                className={styles.voucherInput}
                placeholder="EJ: VCH-2024-XXXX"
              />
            </div>
            <div className={styles.itineraryButtonContainer}>
              <button className={styles.itineraryButton}>
                Ver Mi Itinerario <FaArrowRight className={styles.arrowIcon} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.footerContainer}>
        <div className={styles.footerPill}>
          <FaMapMarkerAlt className={styles.pillIcon} />{" "}
          <span>Cusco, Perú</span>
        </div>
        <div className={styles.footerPill}>
          <FaAward className={styles.pillIcon} />{" "}
          <span>PREMIOS TRAVELLERS' CHOICE 2024</span>
        </div>
      </div>

      <button className={styles.darkModePill}>
        <FaMoon className={styles.moonIcon} />
      </button>
    </div>
  );
}

export default MyTour;
