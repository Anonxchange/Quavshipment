import { supabase, supabaseConfigured } from "@/lib/supabase";
import { fetchShipmentMap } from "@/lib/edge-functions";

type TrackingEvent = {
  status: string;
  location: string;
  description: string;
  timestamp: string;
};

type TrackingRecord = {
  tracking_number: string;
  status: string;
  mode: string;
  carrier: string;
  origin_city: string;
  origin_country: string;
  destination_city: string;
  destination_country: string;
  created_at: string;
  pickup_date: string | null;
  estimated_delivery: string | null;
  updates: TrackingEvent[];
};

const resultRoot = document.querySelector<HTMLElement>(
  "[data-qelvaron-tracking-result]",
);
const overviewRoot = document.querySelector<HTMLElement>(
  "[data-qelvaron-tracking-overview]",
);
const mapRoot = document.querySelector<HTMLElement>(
  "[data-qelvaron-tracking-map]",
);
const updatesRoot = document.querySelector<HTMLElement>(
  "[data-qelvaron-tracking-updates]",
);
const statusLabels = document.querySelectorAll<HTMLElement>(
  "[data-qelvaron-tracking-status]",
);
let mapRequestVersion = 0;
let activeMapObjectUrl: string | null = null;

function setStatus(message: string, state?: string) {
  statusLabels.forEach((label) => {
    label.textContent = message;
    if (state) label.dataset.state = state;
    else delete label.dataset.state;
  });
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function dateLabel(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
      }).format(date);
}

function dateTimeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time not available"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function routeItem(label: string, value: string) {
  const item = makeElement("div", "");
  item.append(makeElement("span", "", label), makeElement("strong", "", value || "Not available"));
  return item;
}

const progressSteps = [
  { label: "Order received", statuses: ["booked", "pending"] },
  { label: "Picked up", statuses: ["picked up"] },
  { label: "In transit", statuses: ["in transit", "stopover", "delayed", "exception"] },
  { label: "Customs", statuses: ["held by customs"] },
  { label: "Out for delivery", statuses: ["out for delivery", "failed delivery"] },
  { label: "Delivered", statuses: ["delivered"] },
];

function normalizedStatus(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function progressIndex(status: string) {
  const normalized = normalizedStatus(status);
  const stepIndex = progressSteps.findIndex((step) =>
    step.statuses.includes(normalized),
  );
  return stepIndex < 0 ? 0 : stepIndex;
}

function renderOverview(record: TrackingRecord, updates: TrackingEvent[]) {
  if (!resultRoot) return;

  const overview = makeElement("article", "qelvaron-track-result");
  const header = makeElement("header", "qelvaron-track-result-head");
  const reference = makeElement("div", "qelvaron-track-reference");
  reference.append(
    makeElement("p", "qelvaron-page-eyebrow", "Tracking reference"),
    makeElement("h2", "", record.tracking_number),
  );
  const badge = makeElement("span", "qelvaron-tracking-status", record.status);
  badge.dataset.state = normalizedStatus(record.status).replaceAll(" ", "-");
  header.append(reference, badge);

  const latestUpdate = updates[0];
  const summary = makeElement("div", "qelvaron-track-route");
  summary.append(
    routeItem(
      "Origin",
      [record.origin_city, record.origin_country].filter(Boolean).join(", "),
    ),
    makeElement("span", "qelvaron-track-route-arrow", "→"),
    routeItem(
      "Destination",
      [record.destination_city, record.destination_country].filter(Boolean).join(", "),
    ),
    routeItem(
      "Latest location",
      latestUpdate?.location || "Not recorded yet",
    ),
    routeItem(
      "Estimated delivery",
      dateLabel(record.estimated_delivery),
    ),
  );

  const progress = makeElement("section", "qelvaron-track-progress-section");
  progress.setAttribute("aria-label", "Shipment progress");
  progress.append(makeElement("h3", "", "Shipment progress"));
  const steps = makeElement("ol", "qelvaron-track-progress");
  const currentIndex = progressIndex(record.status);

  progressSteps.forEach((step, index) => {
    const item = makeElement("li", "qelvaron-track-progress-step");
    item.dataset.state =
      index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";

    const marker = makeElement(
      "span",
      "qelvaron-track-progress-mark",
      index < currentIndex ? "✓" : String(index + 1),
    );
    marker.setAttribute("aria-hidden", "true");
    item.append(marker, makeElement("span", "qelvaron-track-progress-label", step.label));
    steps.append(item);
  });

  progress.append(steps);
  overview.append(header, summary, progress);
  resultRoot.replaceChildren(overview);
  resultRoot.hidden = false;
  overviewRoot
    ?.querySelector<HTMLElement>(".qelvaron-tracking-panel-empty")
    ?.setAttribute("hidden", "");
}

function renderUpdates(updates: TrackingEvent[]) {
  if (!updatesRoot) return;
  updatesRoot.replaceChildren();

  if (updates.length === 0) {
    updatesRoot.append(
      makeElement(
        "p",
        "qelvaron-tracking-updates-empty",
        "The shipment is on file. No location updates have been posted yet.",
      ),
    );
    return;
  }

  const timeline = makeElement("ol", "qelvaron-track-timeline");
  for (const event of updates) {
    const item = makeElement("li", "qelvaron-track-event");
    const copy = makeElement("div", "qelvaron-track-event-copy");
    const eventHeading = makeElement("div", "qelvaron-track-event-head");
    eventHeading.append(
      makeElement("strong", "", event.status),
      makeElement("time", "", dateTimeLabel(event.timestamp)),
    );
    copy.append(
      eventHeading,
      makeElement("p", "qelvaron-track-event-location", event.location),
    );
    if (event.description) copy.append(makeElement("p", "", event.description));
    item.append(makeElement("span", "qelvaron-track-event-mark"), copy);
    timeline.append(item);
  }

  updatesRoot.append(timeline);
}

async function renderMap(trackingReference: string, requestVersion: number) {
  if (!mapRoot) return;
  if (activeMapObjectUrl) {
    URL.revokeObjectURL(activeMapObjectUrl);
    activeMapObjectUrl = null;
  }
  mapRoot.replaceChildren(
    makeElement("p", "qelvaron-map-loading", "Loading the shipment route…"),
  );
  mapRoot.setAttribute(
    "aria-label",
    `Loading route map for shipment ${trackingReference}`,
  );

  try {
    const imageBlob = await fetchShipmentMap(trackingReference);
    if (requestVersion !== mapRequestVersion) return;

    const imageUrl = URL.createObjectURL(imageBlob);
    if (activeMapObjectUrl) URL.revokeObjectURL(activeMapObjectUrl);
    activeMapObjectUrl = imageUrl;

    const image = makeElement("img", "qelvaron-tracking-map-image");
    image.src = imageUrl;
    image.alt = `Map showing the route for shipment ${trackingReference}`;
    image.loading = "lazy";
    mapRoot.replaceChildren(image);
    mapRoot.setAttribute(
      "aria-label",
      `Route map for shipment ${trackingReference}`,
    );
  } catch (error) {
    if (requestVersion !== mapRequestVersion) return;
    const message =
      error instanceof Error
        ? error.message
        : "The shipment route map is unavailable right now.";
    mapRoot.replaceChildren(
      makeElement("p", "qelvaron-map-error", message),
    );
    mapRoot.setAttribute("aria-label", "Shipment route map unavailable");
  }
}

function renderRecord(record: TrackingRecord) {
  const updates = Array.isArray(record.updates)
    ? [...record.updates].sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
      )
    : [];

  renderOverview(record, updates);
  renderUpdates(updates);
  const requestVersion = ++mapRequestVersion;
  void renderMap(record.tracking_number, requestVersion);
}

function renderNotFound() {
  if (resultRoot) {
    const empty = makeElement(
      "div",
      "qelvaron-track-result qelvaron-track-result-empty",
    );
    empty.append(
      makeElement("h2", "", "No shipment found"),
      makeElement("p", "", "Check the reference and try again. If it still does not appear, contact Qelvaron for help."),
    );
    resultRoot.replaceChildren(empty);
    resultRoot.hidden = false;
    overviewRoot
      ?.querySelector<HTMLElement>(".qelvaron-tracking-panel-empty")
      ?.setAttribute("hidden", "");
  }

  mapRequestVersion += 1;
  if (activeMapObjectUrl) {
    URL.revokeObjectURL(activeMapObjectUrl);
    activeMapObjectUrl = null;
  }
  mapRoot?.replaceChildren(
    makeElement("p", "qelvaron-map-error", "A route map is available after a shipment is found."),
  );
  updatesRoot?.replaceChildren(
    makeElement("p", "qelvaron-tracking-updates-empty", "No shipment updates are available."),
  );
}

function showTrackingLoading() {
  if (resultRoot) resultRoot.hidden = true;
  const placeholder = overviewRoot?.querySelector<HTMLElement>(
    ".qelvaron-tracking-panel-empty",
  );
  placeholder?.removeAttribute("hidden");
  const placeholderCopy = placeholder?.querySelector("p");
  if (placeholderCopy) {
    placeholderCopy.textContent = "Checking the reference and loading shipment details…";
  }

  mapRequestVersion += 1;
  if (activeMapObjectUrl) {
    URL.revokeObjectURL(activeMapObjectUrl);
    activeMapObjectUrl = null;
  }
  mapRoot?.replaceChildren(
    makeElement("p", "qelvaron-map-loading", "Loading the shipment route…"),
  );
  updatesRoot?.replaceChildren(
    makeElement("p", "qelvaron-tracking-updates-empty", "Loading shipment updates…"),
  );
}

function renderLookupError() {
  if (resultRoot) {
    const errorCard = makeElement("div", "qelvaron-track-result qelvaron-track-result-empty");
    errorCard.append(
      makeElement("h2", "", "Tracking is temporarily unavailable"),
      makeElement("p", "", "Please try again shortly. Your shipment reference has not been changed."),
    );
    resultRoot.replaceChildren(errorCard);
    resultRoot.hidden = false;
    overviewRoot
      ?.querySelector<HTMLElement>(".qelvaron-tracking-panel-empty")
      ?.setAttribute("hidden", "");
  }
  mapRequestVersion += 1;
  mapRoot?.replaceChildren(
    makeElement("p", "qelvaron-map-error", "The shipment route map is unavailable right now."),
  );
  updatesRoot?.replaceChildren(
    makeElement("p", "qelvaron-tracking-updates-empty", "Shipment updates could not be loaded."),
  );
}

async function lookupShipment(reference: string, form?: HTMLFormElement) {
  const normalizedReference = reference.trim().toUpperCase();
  if (!normalizedReference) {
    setStatus("Enter a shipment reference to continue.");
    return;
  }
  if (!supabase) {
    setStatus("Live tracking is not configured yet.");
    return;
  }

  const button = form?.querySelector<HTMLButtonElement>(
    'button[type="submit"], button:not([type])',
  );
  if (button) button.disabled = true;
  setStatus("Checking the shipment reference…");
  showTrackingLoading();

  try {
    const { data, error } = await supabase.rpc("lookup_shipment", {
      p_reference: normalizedReference,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      renderNotFound();
      setStatus("No shipment was found for that reference.");
      return;
    }

    const record = row as TrackingRecord;
    renderRecord(record);
    setStatus(
      `Shipment found · ${record.status}`,
      record.status.toLowerCase().replaceAll(" ", "-"),
    );
  } catch {
    setStatus("We could not check that reference right now. Please try again shortly.");
    renderLookupError();
  } finally {
    if (button) button.disabled = false;
  }
}

function updatePageCopy() {
  const intro = document.querySelector<HTMLElement>(
    ".qelvaron-tracking-card-copy > p:not(.qelvaron-page-eyebrow)",
  );
  if (intro) {
    intro.textContent =
      "Enter your Qelvaron reference to see the latest shipment status and customer-visible updates.";
  }

  const note = document.querySelector<HTMLElement>(".qelvaron-tracking-note");
  if (note) {
    note.textContent =
      "Public tracking shows a limited route and status summary. It does not reveal sender or recipient contact information, payment details, or internal notes.";
  }

  const faqAnswers = document.querySelectorAll<HTMLElement>(
    ".qelvaron-tracking-faq details p",
  );
  const answers = [
    "Use the Qelvaron reference shared with you for this shipment.",
    "Check the reference for typing errors. Public tracking displays only a limited route and status summary.",
    "The page shows updates as soon as an operator records them. Mapbox displays the recorded route and latest reported location; carrier feeds are not connected.",
  ];
  faqAnswers.forEach((answer, index) => {
    if (answers[index]) answer.textContent = answers[index];
  });
}

updatePageCopy();

if (!supabaseConfigured || !supabase) {
  setStatus("Live tracking is not configured yet.");
} else {
  setStatus("Enter a Qelvaron reference to check its latest status.");
}

document
  .querySelectorAll<HTMLFormElement>("[data-qelvaron-tracking-search]")
  .forEach((form) => {
    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const reference = String(
          new FormData(form).get("trackingReference") ?? "",
        )
          .trim()
          .toUpperCase();

        void lookupShipment(reference, form);
      },
      true,
    );
  });

const initialReference = new URLSearchParams(
  window.location.hash.replace(/^#/, ""),
).get("trackingReference");

if (initialReference) {
  const forms = [
    ...document.querySelectorAll<HTMLFormElement>(
      "[data-qelvaron-tracking-search]",
    ),
  ];
  const trackingForm =
    forms.find((form) => form.closest(".qelvaron-tracking-card")) ?? forms[0];

  forms.forEach((form) => {
    const input = form.querySelector<HTMLInputElement>(
      'input[name="trackingReference"]',
    );
    if (input) input.value = initialReference;
  });

  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  void lookupShipment(initialReference, trackingForm);
}
