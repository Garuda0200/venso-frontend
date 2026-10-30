/** Synthetic catalogue identities; all money is calculated by production modules. */
import { createCotizacion } from "../../pages/Ventas/Cotizaciones/hooks/cotizacionService";
import { hydrateItinerarioFromDB, cleanItinerarioForDB } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import { buildQuotationPricingSnapshotFromCotizacion } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/quotationPricingSnapshot";
import { resolveQuotationSavePricing } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/quotationSavePricing";

interface Catalog {
  agency: number;
  transport: { provider: number; service: number };
  ticket: number;
  tours: {provider: number; service: number}[];
}
import { prepareImportedPackageItinerary } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/packageImportPreparation";
import { repriceItineraryForPassengerContext } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerAwareServiceRepricing";
import { buildImportedPackageFeeState } from "../../utils/packageFeeUtils";

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const quoteFor = (catalog: Catalog, mode: "compartido" | "privado", fee: string, freeAdult: boolean, smallerSecondDay: boolean) => {
  const adults = [{ id: "adult:0:101" }, { id: "adult:1:102" }];
  const children = [{ id: "child:0:201", precio: 7.31 }, { id: "child:1:202", precio: 0 }];
  const transport = {
    typeService: "transportes", parentService: { typeService: "transportes", id_transporte: catalog.transport.provider },
    childService: { id_movilidad: catalog.transport.service, nro_pasajeros: 4 },
    tipoPrecio: mode, packageType: mode, precioServicio: freeAdult ? 0 : mode === "compartido" ? 60 : 30,
    moneda: "dolares", beneficiariosAdultos: adults,
    beneficiariosNinos: children.map(child => ({ ...child, precio: freeAdult ? child.precio : 5 })),
  };
  const ticket = {
    typeService: "tickets", parentService: { typeService: "tickets" },
    childService: { id_ticket: catalog.ticket, entrada: "FLOW Entrada", procedencia: "nacional", tipo_usuario: "adulto" },
    tipoPrecio: "privado", packageType: "privado", precioServicio: freeAdult ? 0 : 20,
    moneda: "dolares", beneficiariosAdultos: adults,
    beneficiariosNinos: copy(children), ticketChildPricingMode: "manual",
  };
  const first = { numero: 1, titulo: "Día contractual", tipoServicio: mode, servicios: [transport, ticket] };
  const days: any[] = [first];
  if (smallerSecondDay) days.push({ numero: 2, titulo: "Menos participantes", tipoServicio: "compartido", servicios: [{
    ...copy(ticket), beneficiariosAdultos: [adults[0]], beneficiariosNinos: [children[0]],
  }] });
  return {
    titulo: "Contrato sintético de cotización", voucher_code: "CONTRACT", cantidadpersonas: 4,
    packagetype: mode, agency_id: catalog.agency, tariff_type: "externa",
    peopleDetails: { adults: [{ id: 101, nacionalidad: "Perú" }, { id: 102, nacionalidad: "Italia" }],
      children: [{ id: 201, age: 8, nacionalidad: "Perú" }, { id: 202, age: 10, nacionalidad: "Italia" }] },
    peopleCount: { adults: 2, children: 2 },
    itinerario: hydrateItinerarioFromDB(days), itinerario_externo: [],
    additionalCosts: { fee, feeMode: "percentage" }, fechainicio: "2026-09-01",
    fechafin: smallerSecondDay ? "2026-09-02" : "2026-09-01", tasa_cambio: 3,
  };
};

/** Capture the exact body used by cotizacionService, including its reconciliation. */
export async function quotationFrontendContractCases(catalog: Catalog) {
  if (![catalog.agency, catalog.transport?.provider, catalog.transport?.service, catalog.ticket,
    ...(catalog.tours || []).flatMap(tour=>[tour.provider,tour.service])]
    .every(value => Number.isSafeInteger(value) && value > 0) || catalog.tours?.length !== 2) throw new Error("Catálogo sintético inválido");
  const inputs: {name: string; input: any}[] = [];
  for (const mode of ["compartido", "privado"] as const) {
    for (const fee of ["0", "0.1", "25"]) for (const freeAdult of [false, true]) {
      for (const smaller of [false, true]) inputs.push({
        name: `${mode}-fee-${fee}-adult-${freeAdult ? "free" : "priced"}-days-${smaller ? 2 : 1}`,
        input: quoteFor(catalog,mode,fee,freeAdult,smaller),
      });
    }
  }
  const twoTours: any = quoteFor(catalog,"privado","25",false,false);
  twoTours.itinerario[0].titulo = "Tour de mañana, tour de tarde";
  twoTours.itinerario[0].tipoServicio="mixto";
  twoTours.itinerario[0].servicios=catalog.tours.map((tour,index)=>({
    typeService:"endoses",parentService:{typeService:"endoses",id_endose:tour.provider},
    childService:{id_tipotour:tour.service,capacidad:4},moneda:"dolares",
    tipoPrecio:index===0?"compartido":"privado",precioServicio:index===0?60:20,
    beneficiariosAdultos:[{id:"adult:0:101"},{id:"adult:1:102"}],
    beneficiariosNinos:[{id:"child:0:201",precio:7.31},{id:"child:1:202",precio:0}],
  }));
  twoTours.itinerario=hydrateItinerarioFromDB(twoTours.itinerario);
  inputs.push({name:"two-tours-one-day",input:twoTours});
  const external: any = quoteFor(catalog,"privado","25",false,false);
  external.itinerario_externo = [{numero:1,titulo:"Servicio sin fee",servicios:[copy(external.itinerario[0].servicios[0])]}];
  inputs.push({name:"external-without-fee",input:external});
  const onlyChildren: any = quoteFor(catalog,"privado","25",true,false);
  onlyChildren.peopleDetails.adults=[];
  onlyChildren.peopleCount.adults=0;
  onlyChildren.cantidadpersonas=2;
  const childOnlyFlat=cleanItinerarioForDB(onlyChildren.itinerario);
  for(const day of childOnlyFlat) for(const service of day.servicios) service.beneficiariosAdultos=[];
  onlyChildren.itinerario=hydrateItinerarioFromDB(childOnlyFlat);
  inputs.push({name:"children-only-own-prices",input:onlyChildren});
  const zero: any = quoteFor(catalog,"privado","0",true,false);
  zero.itinerario=hydrateItinerarioFromDB([{numero:1,titulo:"Cortesía explícita",tipoServicio:"privado",servicios:[{
    typeService:"transportes",parentService:{typeService:"transportes",id_transporte:catalog.transport.provider},
    childService:{id_movilidad:catalog.transport.service},precioServicio:0,tipoPrecio:"privado",moneda:"dolares",
    beneficiariosAdultos:[{id:"adult:0:101"},{id:"adult:1:102"}],
    beneficiariosNinos:[{id:"child:0:201",precio:0},{id:"child:1:202",precio:0}],
  }]}]);
  inputs.push({name:"manual-zero-entire-service",input:zero});
  const imported: any = quoteFor(catalog,"privado","25",false,false);
  imported.itinerario = repriceItineraryForPassengerContext(
    prepareImportedPackageItinerary(cleanItinerarioForDB(imported.itinerario)),
    imported.peopleDetails,{preserveExistingSelection:false},
  );
  imported.additionalCosts=buildImportedPackageFeeState({},"0.1");
  inputs.push({name:"package-import-current-roster-and-fee",input:imported});

  const cases: any[]=[];
  for (const {name,input} of inputs) {
    const snapshot=buildQuotationPricingSnapshotFromCotizacion(input);
    const average=(audience:string,field:string)=>{
      const count=audience==="adult"?input.peopleCount.adults:input.peopleCount.children;
      return count ? round(snapshot.parts.filter(part=>part.audience===audience&&!part.isServiceCharge)
        .reduce((sum,part)=>sum+Number(part[field]??0)*Number(part.beneficiaries),0)/count):0;
    };
    const prepared={
      ...input,precio_it_adulto:average("adult","services"),precio_it_ninos:average("child","services"),
      precio_it_ext_adulto:average("adult","external"),precio_it_ext_ninos:average("child","external"),
      itinerario:cleanItinerarioForDB(input.itinerario),
      itinerario_externo:cleanItinerarioForDB(input.itinerario_externo),
      ...resolveQuotationSavePricing(input),
    };
    const payload=await createCotizacion(prepared);
    const reopened={...prepared,itinerario:hydrateItinerarioFromDB(payload.itinerario),
      itinerario_externo:hydrateItinerarioFromDB(payload.itinerario_externo)};
    delete (reopened as any).pricing_snapshot;
    cases.push({name,payload,expected:{total:payload.total_final,subtotal:payload.subtotal_final},
      reopenedPricing:resolveQuotationSavePricing(reopened),people:input.peopleDetails,
      scope:"Production package preparation/repricing, hydration, cleanup, summary snapshot and cotizacionService; mocked HTTP boundary. Browser flows are deferred."});
  }
  return cases;
}
