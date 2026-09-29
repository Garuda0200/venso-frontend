import { BIBLIA_EMPTY_VALUE, BibliaActivity } from "./bibliaActivityMapper";

const usefulText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text && text !== BIBLIA_EMPTY_VALUE ? text : "";
};

export const buildBibliaQuotationCreationDraft = (activity: BibliaActivity) => ({
  voucherCode: usefulText(activity.file),
  title: usefulText(activity.reservationName) || usefulText(activity.excursion),
});

export const canCreateQuotationFromBiblia = ({
  activity,
  voucherCode,
  submittingActivityId,
}: {
  activity: BibliaActivity;
  voucherCode: string;
  submittingActivityId: string | null;
}) =>
  activity.sourceType === "standalone" &&
  Boolean(activity.standaloneRecordId) &&
  Boolean(voucherCode.trim()) &&
  submittingActivityId === null;
