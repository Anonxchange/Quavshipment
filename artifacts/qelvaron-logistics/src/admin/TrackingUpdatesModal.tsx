import { useState, type FormEvent } from "react";
import { Check, Clock, MapPin, X } from "lucide-react";
import type { Shipment, ShipmentStatus, TrackingUpdate } from "./repository";

const statusOptions: ShipmentStatus[] = [
  "Booked",
  "Picked up",
  "In transit",
  "Stopover",
  "Held by Customs",
  "Out for delivery",
  "Delayed",
  "Delivered",
  "Exception",
  "Failed delivery",
];

const statusClass = (status: string) => status.toLowerCase().replaceAll(" ", "-");

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type TrackingUpdateDraft = Pick<TrackingUpdate, "status" | "location" | "description">;

export default function TrackingUpdatesModal({
  shipment,
  updates,
  onClose,
  onSave,
}: {
  shipment: Shipment;
  updates: TrackingUpdate[];
  onClose: () => void;
  onSave: (update: TrackingUpdateDraft) => void;
}) {
  const [status, setStatus] = useState<ShipmentStatus>(shipment.status);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const history = [...updates]
    .filter((update) => update.shipmentId === shipment.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanLocation = location.trim();
    if (!cleanLocation) {
      setError("Enter the location for this tracking update.");
      return;
    }
    onSave({ status, location: cleanLocation, description: description.trim() });
    setLocation("");
    setDescription("");
    setError("");
  }

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal tracking-updates-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-updates-title"
      >
        <div className="modal-head">
          <div>
            <p className="text-size-small admin-kicker">Shipment history</p>
            <h2 id="tracking-updates-title">Tracking updates</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close tracking updates"
            data-testid="button-close-tracking-updates"
          >
            <X />
          </button>
        </div>

        <div className="modal-body">
          <div className="tracking-update-summary">
            <div>
              <span className="detail-item-label">Tracking reference</span>
              <strong className="track">{shipment.tracking}</strong>
            </div>
            <div>
              <span className="detail-item-label">Current status</span>
              <span className={`status ${statusClass(shipment.status)}`}>{shipment.status}</span>
            </div>
          </div>

          <div className="tracking-update-columns">
            <form className="form-section tracking-update-form" onSubmit={submit}>
              <h3>Add location update</h3>
              <p className="panel-note">
                The status you save becomes the shipment’s current status and appears in the local tracking preview.
              </p>
              {error && <div className="notice tracking-update-error" role="alert">{error}</div>}

              <div className="form-field">
                <label htmlFor="tracking-update-status">Status</label>
                <select
                  id="tracking-update-status"
                  className="field-control"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ShipmentStatus)}
                  data-testid="select-update-status"
                >
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="tracking-update-location">Location</label>
                <input
                  id="tracking-update-location"
                  className="field-control"
                  placeholder="e.g. Miami cargo terminal"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  required
                  data-testid="input-update-location"
                />
              </div>
              <div className="form-field">
                <label htmlFor="tracking-update-description">Customer-visible update</label>
                <textarea
                  id="tracking-update-description"
                  className="field-control tracking-update-description"
                  placeholder="Share a brief shipment progress note"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  data-testid="input-update-description"
                />
              </div>
              <div className="modal-footer">
                <button className="button" type="button" onClick={onClose}>Close</button>
                <button className="button button-primary" type="submit" data-testid="button-add-tracking-update">
                  <Check size={15} /> Save update
                </button>
              </div>
            </form>

            <section className="form-section tracking-update-history" aria-labelledby="tracking-history-title">
              <h3 id="tracking-history-title">Recent history</h3>
              {history.length === 0 ? (
                <div className="empty-state tracking-history-empty">
                  <div className="empty-mark"><MapPin size={18} /></div>
                  <p>No location updates have been recorded for this shipment.</p>
                </div>
              ) : (
                <ol className="tracking-history-list">
                  {history.map((update) => (
                    <li className="tracking-history-item" key={update.id}>
                      <span className="tracking-history-mark" aria-hidden="true" />
                      <div className="tracking-history-copy">
                        <div className="tracking-history-title">
                          <span className={`status ${statusClass(update.status)}`}>{update.status}</span>
                          <time dateTime={update.timestamp}>
                            <Clock size={12} /> {formatTimestamp(update.timestamp)}
                          </time>
                        </div>
                        <strong><MapPin size={13} /> {update.location}</strong>
                        {update.description && <p>{update.description}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
