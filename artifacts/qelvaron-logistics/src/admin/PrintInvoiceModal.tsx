import type { ReactNode } from "react";
import { Printer, X } from "lucide-react";
import type { Shipment } from "./repository";

export default function PrintInvoiceModal({
  shipment,
  onClose,
  onPrint,
  children,
}: {
  shipment: Shipment;
  onClose: () => void;
  onPrint: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal print-invoice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-invoice-title"
      >
        <div className="modal-head">
          <div>
            <p className="text-size-small admin-kicker">Shipment document</p>
            <h2 id="print-invoice-title">Print shipment record</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close print preview"
            data-testid="button-close-print-preview"
          >
            <X />
          </button>
        </div>
        <div className="modal-body">
          <p className="print-preview-note">
            Review the shipment and payment details before printing. Keep this document private.
          </p>
          <div className="print-invoice-preview" data-testid={`print-preview-${shipment.id}`}>
            {children}
          </div>
          <div className="modal-footer">
            <button className="button" type="button" onClick={onClose}>Close</button>
            <button className="button button-primary" type="button" onClick={onPrint} data-testid="button-print-invoice">
              <Printer size={15} /> Print record
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
