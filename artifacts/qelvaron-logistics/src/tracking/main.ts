import { supabase, supabaseConfigured } from "@/lib/supabase";

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
const statusLabels = document.querySelectorAll<HTMLElement>(
  "[data-qelvaron-tracking-status]",
);

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

function renderRecord(record: TrackingRecord) {
  if (!resultRoot) return;

  const card = makeElement("article", "qelvaron-track-result");
  const header = makeElement("header", "qelvaron-track-result-head");
  const titleBlock = makeElement("div", "");
  titleBlock.append(
    makeElement("p", "qelvaron-page-eyebrow", "Tracking reference"),
    makeElement("h2", "", record.tracking_number),
  );
  const badge = makeElement("span", "qelvaron-tracking-status", record.status);
  badge.dataset.state = record.status.toLowerCase().replaceAll(" ", "-");
  header.append(titleBlock, badge);

  const route = makeElement("div", "qelvaron-track-route");
  route.append(
    routeItem("Origin", [record.origin_city, record.origin_country].filter(Boolean).join(", ")),
    makeElement("span", "", "→"),
    routeItem("Destination", [record.destination_city, record.destination_country].filter(Boolean).join(", ")),
    routeItem("Transport", [record.mode, record.carrier].filter(Boolean).join(" · ")),
    routeItem("Estimated delivery", dateLabel(record.estimated_delivery)),
  );

  const history = makeElement("section", "qelvaron-track-history");
  const sectionHeading = makeElement("div", "qelvaron-track-section-head");
  sectionHeading.append(
    makeElement("h3", "", "Shipment updates"),
    makeElement("span", "", `${record.updates.length} recorded ${record.updates.length === 1 ? "update" : "updates"}`),
  );
  history.append(sectionHeading);

  if (record.updates.length === 0) {
    const empty = makeElement("div", "qelvaron-track-result-empty");
    empty.append(
      makeElement("h2", "", record.status),
      makeElement("p", "", "The shipment is on file. No location updates have been posted yet."),
    );
    history.append(empty);
  } else {
    const timeline = makeElement("ol", "qelvaron-track-timeline");
    for (const event of record.updates) {
      const item = makeElement("li", "qelvaron-track-event");
      const copy = makeElement("div", "");
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
    history.append(timeline);
  }

  card.append(header, route, history);
  resultRoot.replaceChildren(card);
  resultRoot.hidden = false;
}

function renderNotFound() {
  if (!resultRoot) return;
  const empty = makeElement("div", "qelvaron-track-result qelvaron-track-result-empty");
  empty.append(
    makeElement("h2", "", "No shipment found"),
    makeElement("p", "", "Check the reference and try again. If it still does not appear, contact Qelvaron for help."),
  );
  resultRoot.replaceChildren(empty);
  resultRoot.hidden = false;
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
  if (resultRoot) resultRoot.hidden = true;

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
  } finally {
    if (button) button.disabled = false;
  }
}

function updatePageCopy() {
  const intro = document.querySelector<HTMLElement>(
    ".qelvaron-tracking-card > div > p",
  );
  if (intro) {
    intro.textContent =
      "Enter your Qelvaron reference to see the latest shipment status and customer-visible updates.";
  }

  const badge = document.querySelector<HTMLElement>(
    ".qelvaron-tracking-card > .qelvaron-tracking-status",
  );
  if (badge) badge.textContent = "Secure lookup";

  const note = document.querySelector<HTMLElement>(".qelvaron-tracking-note");
  if (note) {
    note.textContent =
      "This page shows a limited tracking summary. It does not reveal sender or recipient contact information, payment details, or internal notes.";
  }

  const faqAnswers = document.querySelectorAll<HTMLElement>(
    ".qelvaron-tracking-faq details p",
  );
  const answers = [
    "Use the Qelvaron reference shared with you for this shipment.",
    "Check the reference for typing errors. Public tracking displays only a limited route and status summary.",
    "The page shows updates as soon as an operator records them. Carrier feeds are not connected.",
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
