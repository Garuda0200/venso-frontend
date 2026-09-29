import { MdClose, MdSave } from "react-icons/md";
import DaysEditor from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/DaysEditor";
import PackageTypeSelector from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/PackageTypeSelector/PackageTypeSelector";
import "./ItineraryModal.scss";

const DEFAULT_PEOPLE = {
  adultos: 1,
  ninios: 0,
  infantes: 0,
  total: 1,
  details: [
    {
      nombres: "Pasajero",
      apellidos: "Referencia",
      email: "",
      telefono: "",
      fecha_nacimiento: "",
      documento: "",
      nacionalidad: "extranjero",
    },
  ],
};

const ItineraryModal = ({
  show,
  variant, // 'direct' | 'existing'
  title,
  itineraryTitle,
  onTitleChange,
  packageType,
  onPackageTypeChange,
  currentItinerary,
  onDaysChange,
  onAddService,
  onChangeService,
  onExtrasClick,
  calculateTotalPrice,
  loading,
  onSave,
  onCancel,
}) => {
  if (!show) return null;

  const isDirect = variant === "direct";

  return (
    <div className={`paq__overlay${isDirect ? " paq__overlay--blur" : ""}`}>
      <div className="paq__modal paq__modal--itinerary">
        <div className="paq__modal-head">
          <h2>{title}</h2>
          <button className="paq__modal-close" onClick={onCancel}>
            <MdClose />
          </button>
        </div>
        <div className="paq__modal-body">
          <div className="paq__field">
            <label>{isDirect ? "Título del Paquete" : "Título"}</label>
            <input
              type="text"
              value={itineraryTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={
                isDirect ? "Nombre del paquete" : "Título del itinerario"
              }
            />
          </div>
          <div className="paq__field">
            <PackageTypeSelector
              packageType={packageType}
              setPackageType={onPackageTypeChange}
            />
          </div>
          <DaysEditor
            days={currentItinerary}
            setDays={onDaysChange}
            onAddService={onAddService}
            onChangeService={onChangeService}
            onExtrasClick={onExtrasClick}
            calculateTotalPrice={calculateTotalPrice}
            packageType={packageType}
            adultsCount={1}
            passengers={[]}
            peopleDetails={DEFAULT_PEOPLE}
            hideServiceTotal
          />
        </div>
        <div className="paq__modal-foot">
          <button
            className="paq__btn--ghost"
            onClick={onCancel}
            disabled={!isDirect && loading}
          >
            Cancelar
          </button>
          <button
            className="paq__btn--primary"
            onClick={onSave}
            disabled={!isDirect && loading}
          >
            {!isDirect && loading ? (
              <>
                <div className="paq__spinner--sm" /> Guardando...
              </>
            ) : (
              <>
                <MdSave /> {isDirect ? "Aplicar" : "Guardar"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItineraryModal;
