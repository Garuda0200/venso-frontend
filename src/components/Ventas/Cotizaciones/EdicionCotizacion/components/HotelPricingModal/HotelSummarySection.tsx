import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MdFileDownload } from "react-icons/md";
import { formatCurrency } from "../../utils/formatters";

export const CAT_LABELS = {
  2: "2 Estrellas",
  3: "3 Estrellas",
  "3s": "3 Estrellas Superior",
  4: "4 Estrellas",
  5: "5 Estrellas",
};

export const normalizeCat = (cat) =>
  cat == null
    ? null
    : (() => {
        const normalized = String(cat)
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        if (!normalized) return null;
        if (/^[2-5]s?$/.test(normalized)) return normalized;

        // Count Unicode star U+2B50 when hotel.categoria stores stars.
        const starCount = (String(cat).match(/\u2B50/g) || []).length;
        if (starCount >= 2 && starCount <= 5) {
          if (
            starCount === 3 &&
            (normalized.includes("superior") ||
              normalized.includes("sup") ||
              String(cat).trim().endsWith("*"))
          )
            return "3s";
          return String(starCount);
        }

        if (
          normalized.includes("3") &&
          (normalized.includes("superior") || normalized.includes("sup"))
        ) {
          return "3s";
        }

        const digitMatch = normalized.match(/[2-5]/);
        return digitMatch ? digitMatch[0] : normalized;
      })();

export const buildItineraryRows = (days = [], fechaInicio = null) =>
  (days || []).map((day, idx) => {
    let fecha = "—";
    if (fechaInicio) {
      const d = new Date(fechaInicio.replace(/-/g, "/"));
      d.setDate(d.getDate() + idx);
      fecha = d.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }

    let destino = Array.isArray(day?.ciudades)
      ? day.ciudades.filter(Boolean).join(", ")
      : "";

    if (!destino) {
      const zones = new Set();
      (day?.servicios || []).forEach((s) => {
        const zona = s?.parentService?.zona || s?.zona || "";
        if (zona) zones.add(zona.trim());
      });
      destino = [...zones].join(", ");
    }

    let vuelosCost = 0;
    (day?.servicios || []).forEach((s) => {
      const ts = (
        s?.parentService?.typeService ||
        s?.typeService ||
        ""
      ).toLowerCase();
      const precio = parseFloat(s?.tariff?.precio || s?.precioServicio || 0);
      if (ts === "vuelos") vuelosCost += precio;
    });

    return {
      idx,
      dia: idx + 1,
      destino: destino || "—",
      fecha,
      titulo: day?.titulo || `Día ${idx + 1}`,
      vuelosCost,
    };
  });

const LOCKED_SELECTOR = '[data-preview-locked="true"]';

const isInsideLockedZone = (node, root) => {
  let current = node || null;

  while (current && current !== root) {
    if (current?.nodeType === 1 && current.matches?.(LOCKED_SELECTOR)) {
      return true;
    }
    current = current.parentNode;
  }

  return false;
};

const applyLockedNodes = (root) => {
  if (!root) return;
  root.querySelectorAll(LOCKED_SELECTOR).forEach((el) => {
    el.setAttribute("contenteditable", "false");
    el.setAttribute("spellcheck", "false");
  });
};

const HotelSummarySection = forwardRef(function HotelSummarySection(
  {
    previewHtml,
    itineraryRows,
    categoryRows,
    selectedCat,
    summaryRef,

    editableExcelPreview = false,
    onPreviewHtmlChange,
    previewClassName = "",
  },
  ref,
) {
  const previewRef = useRef(null);
  const lastCommittedHtmlRef = useRef(previewHtml || "");
  const draftHtmlRef = useRef(previewHtml || "");
  const skipBlurCommitRef = useRef(false);

  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [editablePreviewHtml, setEditablePreviewHtml] = useState(
    previewHtml || "",
  );

  useEffect(() => {
    if (isEditingPreview) return;

    const nextHtml = previewHtml || "";
    setEditablePreviewHtml(nextHtml);
    lastCommittedHtmlRef.current = nextHtml;
    draftHtmlRef.current = nextHtml;
  }, [previewHtml, isEditingPreview]);

  useEffect(() => {
    applyLockedNodes(previewRef.current);
  }, [editablePreviewHtml, isEditingPreview]);

  const focusEditablePreview = useCallback(() => {
    if (typeof window === "undefined") return;

    const el = previewRef.current;
    if (!el) return;

    el.focus();

    const selection = window.getSelection?.();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  useEffect(() => {
    if (!isEditingPreview) return;

    const raf = window.requestAnimationFrame(() => {
      focusEditablePreview();
      applyLockedNodes(previewRef.current);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [isEditingPreview, focusEditablePreview]);

  const commitPreviewHtml = useCallback(
    (nextHtml) => {
      const normalized = nextHtml || "";
      setEditablePreviewHtml(normalized);
      lastCommittedHtmlRef.current = normalized;
      draftHtmlRef.current = normalized;
      onPreviewHtmlChange?.(normalized);
    },
    [onPreviewHtmlChange],
  );

  const startPreviewEdit = useCallback(
    (e) => {
      if (!editableExcelPreview) return;
      if (!editablePreviewHtml) return;

      if (isInsideLockedZone(e?.target, previewRef.current)) {
        return;
      }

      lastCommittedHtmlRef.current = editablePreviewHtml || "";
      draftHtmlRef.current = editablePreviewHtml || "";
      setIsEditingPreview(true);
    },
    [editableExcelPreview, editablePreviewHtml],
  );

  const cancelPreviewEdit = useCallback(() => {
    const rollbackHtml = lastCommittedHtmlRef.current || "";
    draftHtmlRef.current = rollbackHtml;
    setEditablePreviewHtml(rollbackHtml);

    if (previewRef.current) {
      previewRef.current.innerHTML = rollbackHtml;
      applyLockedNodes(previewRef.current);
    }

    skipBlurCommitRef.current = true;
    setIsEditingPreview(false);

    if (previewRef.current) {
      previewRef.current.blur();
    }
  }, []);

  const handlePreviewInput = useCallback((e) => {
    draftHtmlRef.current = e.currentTarget.innerHTML || "";
  }, []);

  const handlePreviewBlur = useCallback(() => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }

    const currentHtml =
      previewRef.current?.innerHTML || draftHtmlRef.current || "";
    commitPreviewHtml(currentHtml);
    setIsEditingPreview(false);
  }, [commitPreviewHtml]);

  const handlePreviewKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPreviewEdit();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();

        const currentHtml =
          previewRef.current?.innerHTML || draftHtmlRef.current || "";

        commitPreviewHtml(currentHtml);
        setIsEditingPreview(false);

        if (previewRef.current) {
          previewRef.current.blur();
        }
      }
    },
    [cancelPreviewEdit, commitPreviewHtml],
  );

  const handlePreviewBeforeInput = useCallback(
    (e) => {
      if (!isEditingPreview) return;

      const selection = window.getSelection?.();
      const anchorNode = selection?.anchorNode || e.target;
      const focusNode = selection?.focusNode || e.target;

      if (
        isInsideLockedZone(anchorNode, previewRef.current) ||
        isInsideLockedZone(focusNode, previewRef.current)
      ) {
        e.preventDefault();
      }
    },
    [isEditingPreview],
  );

  useImperativeHandle(
    ref,
    () => ({
      startEdit: () => startPreviewEdit(null),
      cancelEdit: cancelPreviewEdit,
      commitDraftHtml: () => {
        const html =
          previewRef.current?.innerHTML || draftHtmlRef.current || "";
        skipBlurCommitRef.current = true;
        commitPreviewHtml(html);
        setIsEditingPreview(false);
        if (previewRef.current) previewRef.current.blur();
      },
      getCurrentHtml: () =>
        previewRef.current?.innerHTML || draftHtmlRef.current || "",
      get isEditing() {
        return isEditingPreview;
      },
    }),
    [startPreviewEdit, cancelPreviewEdit, commitPreviewHtml, isEditingPreview],
  );

  return (
    <div className="hpm-summary" ref={summaryRef}>
      <div className="hpm-summary-block">
        <div className="hpm-summary-title">Vista previa</div>

        <div
          ref={previewRef}
          className={`hpm-excel-preview${previewClassName ? ` ${previewClassName}` : ""}${isEditingPreview ? " hpm-excel-preview--editing" : ""}`}
          contentEditable={editableExcelPreview && isEditingPreview}
          suppressContentEditableWarning={true}
          onInput={handlePreviewInput}
          onBlur={handlePreviewBlur}
          onKeyDown={handlePreviewKeyDown}
          onBeforeInput={handlePreviewBeforeInput}
          dangerouslySetInnerHTML={{ __html: editablePreviewHtml }}
        />
      </div>

    </div>
  );
});

export default HotelSummarySection;
