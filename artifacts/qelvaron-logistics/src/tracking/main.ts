import "mapbox-gl/dist/mapbox-gl.css";
import "./tracking-live.css";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  fetchShipmentMap,
  fetchShipmentRoute,
  type ShipmentRoute,
} from "@/lib/edge-functions";

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
  // Optional: shown only if lookup_shipment returns them.
  weight?: number | string | null;
  stopover_city?: string | null;
  stopover_country?: string | null;
  updates: TrackingEvent[];
};

type MapboxGL = typeof import("mapbox-gl").default;

// Public (pk.) Mapbox token, restricted to your site's URL in the Mapbox dashboard.
// Without it the page falls back to the static image from the edge function.
const mapboxPublicToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN?.trim() || "";
const interactiveMap = Boolean(mapboxPublicToken);

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

mapRoot?.classList.add("qelvaron-live-map");

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

function placeLabel(city?: string | null, country?: string | null) {
  return [city, country].filter(Boolean).join(", ");
}

/* ------------------------------------------------------------------ */
/* Icons (inline SVG, static strings only)                             */
/* ------------------------------------------------------------------ */

type IconName =
  | "package"
  | "truck"
  | "plane"
  | "ship"
  | "pin"
  | "delivered"
  | "clock"
  | "alert"
  | "check"
  | "stopover";

const iconMarkup: Record<IconName, string> = {
  package:
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  stopover:
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><circle cx="12" cy="12" r="2"/>',
  truck:
    '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  plane:
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  ship:
    '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  delivered:
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
};

function icon(name: IconName, size = 18) {
  const span = makeElement("span", "qelvaron-live-icon");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconMarkup[name]}</svg>`;
  return span;
}

function transportIcon(mode: string): IconName {
  const value = mode.toLowerCase();
  if (value.includes("air")) return "plane";
  if (/(sea|ocean|ship|vessel|boat)/.test(value)) return "ship";
  return "truck";
}

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

type Stage = {
  label: string;
  title: string;
  blurb: string;
  statuses: string[];
  icon: IconName | "transit";
};

const progressSteps: Stage[] = [
  {
    label: "Order received",
    title: "Order created",
    blurb: "The shipment has been booked and is being prepared.",
    statuses: ["booked", "pending"],
    icon: "clock",
  },
  {
    label: "Picked up",
    title: "Package picked up",
    blurb: "The package has been collected from the sender.",
    statuses: ["picked up"],
    icon: "package",
  },
  {
    label: "In transit",
    title: "In transit",
    blurb: "The package is on its way to the destination.",
    statuses: ["in transit", "stopover", "delayed", "exception"],
    icon: "transit",
  },
  {
    label: "Customs",
    title: "Customs processing",
    blurb: "The package is being processed by customs officials.",
    statuses: ["held by customs"],
    icon: "alert",
  },
  {
    label: "Out for delivery",
    title: "Out for delivery",
    blurb: "The package is out for delivery to the final destination.",
    statuses: ["out for delivery", "failed delivery"],
    icon: "pin",
  },
  {
    label: "Delivered",
    title: "Delivered",
    blurb: "The package has been delivered.",
    statuses: ["delivered"],
    icon: "delivered",
  },
];

const CUSTOMS_INDEX = 3;

function normalizedStatus(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function stageIndexForStatus(status: string) {
  const normalized = normalizedStatus(status);
  return progressSteps.findIndex((step) => step.statuses.includes(normalized));
}

function progressIndex(status: string) {
  const index = stageIndexForStatus(status);
  return index < 0 ? 0 : index;
}

function isDelivered(status: string) {
  return normalizedStatus(status) === "delivered";
}

function stageState(index: number, record: TrackingRecord) {
  if (isDelivered(record.status)) return "complete";
  const current = progressIndex(record.status);
  return index < current ? "complete" : index === current ? "current" : "upcoming";
}

// Has the shipment reached (or already left) its stopover?
function stopoverVisited(record: TrackingRecord) {
  if (isDelivered(record.status) || progressIndex(record.status) >= CUSTOMS_INDEX) return true;
  const events = Array.isArray(record.updates) ? record.updates : [];
  return events.some((event) => normalizedStatus(event.status) === "stopover");
}

function stageIcon(stage: Stage, record: TrackingRecord): IconName {
  return stage.icon === "transit" ? transportIcon(record.mode ?? "") : stage.icon;
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

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
    routeItem("Origin", placeLabel(record.origin_city, record.origin_country)),
    makeElement("span", "qelvaron-track-route-arrow", "→"),
    routeItem("Destination", placeLabel(record.destination_city, record.destination_country)),
    routeItem("Latest location", latestUpdate?.location || "Not recorded yet"),
    routeItem("Estimated delivery", dateLabel(record.estimated_delivery)),
  );

  const progress = makeElement("section", "qelvaron-track-progress-section");
  progress.setAttribute("aria-label", "Shipment progress");
  progress.append(makeElement("h3", "", "Shipment progress"));
  const steps = makeElement("ol", "qelvaron-track-progress");

  progressSteps.forEach((step, index) => {
    const state = stageState(index, record);
    const item = makeElement("li", "qelvaron-track-progress-step");
    item.dataset.state = state;
    if (index === CUSTOMS_INDEX && state === "current") item.dataset.attention = "true";

    const marker = makeElement("span", "qelvaron-track-progress-mark");
    marker.setAttribute("aria-hidden", "true");
    marker.append(icon(state === "complete" ? "check" : stageIcon(step, record), 18));
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

/* ------------------------------------------------------------------ */
/* Timeline (vertical line + progress fill)                            */
/* ------------------------------------------------------------------ */

function renderUpdates(record: TrackingRecord, updates: TrackingEvent[]) {
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
  }

  const byStage: TrackingEvent[][] = progressSteps.map(() => []);
  const other: TrackingEvent[] = [];
  for (const event of updates) {
    const index = stageIndexForStatus(event.status);
    if (index < 0) other.push(event);
    else byStage[index]?.push(event);
  }

  const stopoverName = placeLabel(record.stopover_city, record.stopover_country);
  const atStopover = normalizedStatus(record.status) === "stopover";
  const timeline = makeElement("ol", "qelvaron-live-timeline");

  progressSteps.forEach((stage, index) => {
    const state = stageState(index, record);
    const events = byStage[index] ?? [];
    const latest = events[0];
    const earlier = events.slice(1);

    const item = makeElement("li", "qelvaron-live-stage");
    item.dataset.state = state;
    item.style.setProperty("--stage-index", String(index));
    if (index === progressSteps.length - 1) item.dataset.last = "true";
    if (index === CUSTOMS_INDEX && state === "current") item.dataset.attention = "true";

    const mark = makeElement("span", "qelvaron-live-stage-mark");
    mark.append(icon(stageIcon(stage, record), 22));

    const body = makeElement("div", "qelvaron-live-stage-body");
    const head = makeElement("div", "qelvaron-live-stage-head");
    const titleBlock = makeElement("div", "qelvaron-live-stage-title");
    const title = makeElement("h4", "", stage.title);
    const tag = makeElement(
      "span",
      "qelvaron-live-tag",
      state === "complete" ? "Completed" : state === "current" ? "Current" : "Pending",
    );
    tag.dataset.state = state;
    title.append(tag);
    titleBlock.append(title);

    const place = makeElement("p", "qelvaron-live-stage-place");
    place.append(
      icon("pin", 15),
      makeElement(
        "span",
        "",
        latest?.location ||
          (state === "upcoming" ? "Awaiting update" : "No location recorded yet"),
      ),
    );
    titleBlock.append(place);

    const when = makeElement("time", "qelvaron-live-stage-time");
    if (latest) {
      when.dateTime = latest.timestamp;
      when.textContent = dateTimeLabel(latest.timestamp);
    } else {
      when.textContent = state === "upcoming" ? "Pending" : "Not recorded";
    }
    head.append(titleBlock, when);

    const copy = makeElement(
      "p",
      "qelvaron-live-stage-copy",
      latest?.description || stage.blurb,
    );

    body.append(head, copy);

    if (latest && normalizedStatus(latest.status) !== normalizedStatus(stage.title)) {
      body.append(makeElement("p", "qelvaron-live-stage-status", latest.status));
    }

    if (index === 2 && atStopover && stopoverName) {
      body.append(
        makeElement(
          "p",
          "qelvaron-live-stage-note",
          `Currently at stopover: ${stopoverName}`,
        ),
      );
    }

    if (earlier.length > 0) {
      const history = makeElement("ul", "qelvaron-live-stage-history");
      for (const event of earlier) {
        const row = makeElement("li", "");
        row.append(
          makeElement("span", "", event.location || event.status),
          makeElement("time", "", dateTimeLabel(event.timestamp)),
        );
        history.append(row);
      }
      body.append(history);
    }

    item.append(mark, body);
    timeline.append(item);
  });

  updatesRoot.append(timeline);

  if (other.length > 0) {
    const section = makeElement("section", "qelvaron-live-other");
    section.append(makeElement("h4", "", "Other updates"));
    const list = makeElement("ul", "");
    for (const event of other) {
      const row = makeElement("li", "");
      const text = makeElement("div", "");
      text.append(
        makeElement("strong", "", event.status),
        makeElement("span", "", event.location),
      );
      if (event.description) text.append(makeElement("p", "", event.description));
      row.append(text, makeElement("time", "", dateTimeLabel(event.timestamp)));
      list.append(row);
    }
    section.append(list);
    updatesRoot.append(section);
  }
}

/* ------------------------------------------------------------------ */
/* Stopover and parcel cards (inserted around the timeline)           */
/* ------------------------------------------------------------------ */

let stopoverHolder: HTMLElement | null = null;
let parcelHolder: HTMLElement | null = null;

function ensureHolders() {
  if (!updatesRoot || (stopoverHolder && parcelHolder)) return;
  let anchor: Element = updatesRoot;
  const section = updatesRoot.closest("section");
  if (section && mapRoot && !section.contains(mapRoot)) anchor = section;

  stopoverHolder = makeElement("div", "qelvaron-live-extras");
  parcelHolder = makeElement("div", "qelvaron-live-extras");
  anchor.before(stopoverHolder);
  anchor.after(parcelHolder);
}

function clearExtras() {
  stopoverHolder?.replaceChildren();
  parcelHolder?.replaceChildren();
}

function detailRow(label: string, value: string) {
  const row = makeElement("div", "");
  row.append(makeElement("dt", "", label), makeElement("dd", "", value));
  return row;
}

function renderStopover(record: TrackingRecord) {
  const name = placeLabel(record.stopover_city, record.stopover_country);
  if (!name || !stopoverHolder) return;

  const stateText =
    normalizedStatus(record.status) === "stopover"
      ? "Currently at stopover"
      : stopoverVisited(record)
        ? "Stopover completed"
        : "Stopover planned";

  const card = makeElement("article", "qelvaron-live-card qelvaron-live-stopover");
  const head = makeElement("header", "qelvaron-live-card-head");
  const badge = makeElement("span", "qelvaron-live-stopover-badge");
  badge.append(icon("stopover", 22));
  const titles = makeElement("div", "");
  titles.append(
    makeElement("h3", "", "Stopover point"),
    makeElement("p", "", "Your shipment passes through this intermediate location."),
  );
  head.append(badge, titles);

  const details = makeElement("dl", "qelvaron-live-details");
  if (record.stopover_city) details.append(detailRow("City", record.stopover_city));
  if (record.stopover_country) details.append(detailRow("Country", record.stopover_country));
  details.append(detailRow("Status", stateText));

  card.append(
    head,
    details,
    makeElement(
      "p",
      "qelvaron-live-note",
      "Your shipment is processed at this location on its way to the final destination.",
    ),
  );
  stopoverHolder.replaceChildren(card);
}

function renderParcel(record: TrackingRecord, updates: TrackingEvent[]) {
  if (!parcelHolder) return;

  const card = makeElement("article", "qelvaron-live-card");
  const head = makeElement("header", "qelvaron-live-card-head");
  const badge = makeElement("span", "qelvaron-live-card-icon");
  badge.append(icon("package", 22));
  const titles = makeElement("div", "");
  titles.append(
    makeElement("h3", "", "Parcel information"),
    makeElement("p", "", "Public details about this shipment."),
  );
  head.append(badge, titles);

  const details = makeElement("dl", "qelvaron-live-details");
  details.append(detailRow("Tracking reference", record.tracking_number));
  details.append(detailRow("Status", record.status));
  if (record.mode) details.append(detailRow("Service", record.mode));
  if (record.carrier) details.append(detailRow("Carrier", record.carrier));
  if (record.weight !== undefined && record.weight !== null && record.weight !== "") {
    details.append(detailRow("Weight", `${record.weight} kg`));
  }
  details.append(detailRow("Booked", dateLabel(record.created_at)));
  details.append(detailRow("Picked up", dateLabel(record.pickup_date)));
  details.append(detailRow("Estimated delivery", dateLabel(record.estimated_delivery)));
  details.append(detailRow("Latest location", updates[0]?.location || "Not recorded yet"));

  card.append(head, details);
  parcelHolder.replaceChildren(card);
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

type MapShell = {
  canvas: HTMLDivElement;
  note: HTMLParagraphElement;
  legend: HTMLDivElement;
};

const COMPLETED_SOURCE = "qelvaron-route-completed";
const REMAINING_SOURCE = "qelvaron-route-remaining";
const COMPLETED_CASING = "qelvaron-route-completed-casing";
const COMPLETED_LINE = "qelvaron-route-completed-line";
const REMAINING_LINE = "qelvaron-route-remaining-line";

const dashSequence: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

let mapShell: MapShell | null = null;
let mapboxModule: MapboxGL | null = null;
let mapInstance: MapboxMap | null = null;
let mapReady: Promise<void> | null = null;
let activeMarkers: MapboxMarker[] = [];
let dashFrame = 0;
let resizeObserver: ResizeObserver | null = null;

function ensureMapShell(): MapShell | null {
  if (!mapRoot) return null;
  if (mapShell && mapRoot.contains(mapShell.canvas)) return mapShell;

  const canvas = makeElement("div", "qelvaron-live-map-canvas");
  const note = makeElement("p", "qelvaron-live-map-note");
  const legend = makeElement("div", "qelvaron-live-legend");
  mapRoot.replaceChildren(canvas, note, legend);
  mapShell = { canvas, note, legend };

  // The old shell (and its map) is gone if something replaced mapRoot's children.
  resizeObserver?.disconnect();
  resizeObserver = null;
  mapInstance?.remove();
  mapInstance = null;
  mapReady = null;
  activeMarkers = [];
  return mapShell;
}

function setMapMessage(text: string, kind: "loading" | "error") {
  if (!mapRoot) return;
  if (!interactiveMap) {
    mapRoot.replaceChildren(
      makeElement("p", kind === "error" ? "qelvaron-map-error" : "qelvaron-map-loading", text),
    );
    return;
  }
  const shell = ensureMapShell();
  if (!shell) return;
  shell.note.textContent = text;
  shell.note.dataset.kind = kind;
  shell.note.hidden = false;
  shell.legend.replaceChildren();
}

function hideMapMessage() {
  if (mapShell) mapShell.note.hidden = true;
}

function clearRoute() {
  if (dashFrame) cancelAnimationFrame(dashFrame);
  dashFrame = 0;
  activeMarkers.forEach((marker) => marker.remove());
  activeMarkers = [];
  if (!mapInstance) return;
  for (const layer of [REMAINING_LINE, COMPLETED_LINE, COMPLETED_CASING]) {
    if (mapInstance.getLayer(layer)) mapInstance.removeLayer(layer);
  }
  for (const source of [COMPLETED_SOURCE, REMAINING_SOURCE]) {
    if (mapInstance.getSource(source)) mapInstance.removeSource(source);
  }
}

function resetMap(message: string, kind: "loading" | "error") {
  clearRoute();
  setMapMessage(message, kind);
}

async function loadMapbox() {
  if (!mapboxModule) {
    mapboxModule = (await import("mapbox-gl")).default;
  }
  return mapboxModule;
}

function ensureMap(mapbox: MapboxGL, shell: MapShell) {
  if (mapInstance && mapReady) return { map: mapInstance, ready: mapReady };

  mapbox.accessToken = mapboxPublicToken;
  const map = new mapbox.Map({
    container: shell.canvas,
    style: "mapbox://styles/mapbox/streets-v12",
    center: [0, 20],
    zoom: 1.5,
    projection: "mercator",
  });
  map.addControl(new mapbox.NavigationControl(), "top-right");

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("The map took too long to load.")),
      20000,
    );
    map.once("load", () => {
      window.clearTimeout(timeout);
      resolve();
    });
  });

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => map.resize());
  resizeObserver.observe(shell.canvas);

  mapInstance = map;
  mapReady = ready;
  return { map, ready };
}

function pinElement(kind: string, name: IconName, size = 18) {
  const element = makeElement("div", "qelvaron-live-pin");
  element.dataset.kind = kind;
  element.append(icon(name, size));
  return element;
}

function popupContent(title: string, text: string) {
  const content = makeElement("div", "qelvaron-live-popup");
  content.append(makeElement("strong", "", title), makeElement("span", "", text));
  return content;
}

function legendItem(kind: string, title: string, text: string) {
  const item = makeElement("div", "qelvaron-live-legend-item");
  item.dataset.kind = kind;
  item.append(
    makeElement("span", "qelvaron-live-legend-dot"),
    makeElement("strong", "", title),
    makeElement("span", "", text),
  );
  return item;
}

function sameCoordinates(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}

function drawRoute(
  mapbox: MapboxGL,
  map: MapboxMap,
  shell: MapShell,
  route: ShipmentRoute,
  record: TrackingRecord,
) {
  clearRoute();

  const styles = mapRoot ? getComputedStyle(mapRoot) : null;
  const token = (name: string, fallback: string) =>
    styles?.getPropertyValue(name).trim() || fallback;
  const completeColor = token("--qlive-complete", "#10b981");
  const completeCasing = token("--qlive-complete-casing", "#065f46");
  const remainingColor = token("--qlive-remaining", "#8b5cf6");

  const delivered = isDelivered(record.status);
  const origin = route.origin.coordinates;
  const destination = route.destination.coordinates;
  const stopover = route.stopover?.coordinates ?? null;
  const current =
    route.current && !delivered ? route.current.coordinates : null;

  // Pins ------------------------------------------------------------
  const addPin = (
    kind: string,
    name: IconName,
    coordinates: [number, number],
    title: string,
    text: string,
    size = 18,
  ) => {
    const marker = new mapbox.Marker({ element: pinElement(kind, name, size) })
      .setLngLat(coordinates)
      .setPopup(new mapbox.Popup({ offset: 26 }).setDOMContent(popupContent(title, text)))
      .addTo(map);
    activeMarkers.push(marker);
  };

  addPin("origin", "package", origin, "Origin", route.origin.label);
  if (stopover && route.stopover) {
    addPin("stopover", "stopover", stopover, "Stopover", route.stopover.label);
  }
  addPin(
    delivered ? "delivered" : "destination",
    delivered ? "delivered" : "pin",
    destination,
    delivered ? "Delivered" : "Destination",
    route.destination.label,
  );
  if (current && route.current) {
    const marker = pinElement("current", transportIcon(record.mode ?? ""), 20);
    marker.classList.add("qelvaron-live-pin-pulse");
    activeMarkers.push(
      new mapbox.Marker({ element: marker })
        .setLngLat(current)
        .setPopup(
          new mapbox.Popup({ offset: 26 }).setDOMContent(
            popupContent("Current location", route.current.label),
          ),
        )
        .addTo(map),
    );
  }

  // Route lines -----------------------------------------------------
  // Has the shipment already passed the stopover?
  const stopoverPassed =
    !!stopover &&
    ((!!current && sameCoordinates(current, stopover)) || stopoverVisited(record));

  let completed: [number, number][] = [];
  let remaining: [number, number][] = [];
  if (delivered) {
    completed = [origin, ...(stopover ? [stopover] : []), destination];
  } else if (current) {
    if (stopover && stopoverPassed && !sameCoordinates(current, stopover)) {
      completed = [origin, stopover, current];
      remaining = [current, destination];
    } else if (stopover && !stopoverPassed) {
      completed = [origin, current];
      remaining = [current, stopover, destination];
    } else if (stopover) {
      // Currently at the stopover.
      completed = [origin, stopover];
      remaining = [stopover, destination];
    } else {
      completed = [origin, current];
      remaining = [current, destination];
    }
  } else {
    remaining = [origin, ...(stopover ? [stopover] : []), destination];
  }

  const lineData = (coordinates: [number, number][]) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates },
  });
  const layout = { "line-join": "round" as const, "line-cap": "round" as const };

  if (completed.length > 1) {
    map.addSource(COMPLETED_SOURCE, { type: "geojson", data: lineData(completed) });
    map.addLayer({
      id: COMPLETED_CASING,
      type: "line",
      source: COMPLETED_SOURCE,
      layout,
      paint: { "line-color": completeCasing, "line-width": 7, "line-opacity": 0.35 },
    });
    map.addLayer({
      id: COMPLETED_LINE,
      type: "line",
      source: COMPLETED_SOURCE,
      layout,
      paint: { "line-color": completeColor, "line-width": 4 },
    });
  }

  if (remaining.length > 1) {
    map.addSource(REMAINING_SOURCE, { type: "geojson", data: lineData(remaining) });
    map.addLayer({
      id: REMAINING_LINE,
      type: "line",
      source: REMAINING_SOURCE,
      layout: { "line-join": "round", "line-cap": "butt" },
      paint: {
        "line-color": remainingColor,
        "line-width": 4,
        "line-dasharray": dashSequence[0] ?? [2, 3],
        "line-opacity": 0.85,
      },
    });
    startDashAnimation(map);
  }

  // Fit to everything ----------------------------------------------
  const bounds = new mapbox.LngLatBounds(origin, origin);
  [stopover, current, destination].forEach((point) => {
    if (point) bounds.extend(point);
  });
  map.resize();
  map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 800 });

  // Legend ----------------------------------------------------------
  shell.legend.replaceChildren(
    legendItem("origin", "Origin", route.origin.label),
    ...(route.stopover ? [legendItem("stopover", "Stopover", route.stopover.label)] : []),
    ...(current && route.current ? [legendItem("current", "Current", route.current.label)] : []),
    legendItem(
      delivered ? "delivered" : "destination",
      delivered ? "Delivered" : "Destination",
      route.destination.label,
    ),
  );
}

function startDashAnimation(map: MapboxMap) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let lastStep = -1;
  const tick = (time: number) => {
    if (!map.getLayer(REMAINING_LINE)) {
      dashFrame = 0;
      return;
    }
    const step = Math.floor(time / 70) % dashSequence.length;
    if (step !== lastStep) {
      map.setPaintProperty(REMAINING_LINE, "line-dasharray", dashSequence[step] ?? [2, 3]);
      lastStep = step;
    }
    dashFrame = requestAnimationFrame(tick);
  };
  dashFrame = requestAnimationFrame(tick);
}

async function renderInteractiveMap(
  record: TrackingRecord,
  requestVersion: number,
) {
  if (!mapRoot) return;
  const reference = record.tracking_number;
  resetMap("Loading the shipment route…", "loading");
  mapRoot.setAttribute("aria-label", `Loading route map for shipment ${reference}`);

  try {
    const [route, mapbox] = await Promise.all([
      fetchShipmentRoute(reference),
      loadMapbox(),
    ]);
    if (requestVersion !== mapRequestVersion) return;

    const shell = ensureMapShell();
    if (!shell) return;
    const { map, ready } = ensureMap(mapbox, shell);
    try {
      await ready;
    } catch (error) {
      // Drop the broken map so the next lookup starts a fresh one.
      resizeObserver?.disconnect();
      resizeObserver = null;
      map.remove();
      mapInstance = null;
      mapReady = null;
      throw error;
    }
    if (requestVersion !== mapRequestVersion) return;

    drawRoute(mapbox, map, shell, route, record);
    hideMapMessage();
    mapRoot.setAttribute("aria-label", `Route map for shipment ${reference}`);
  } catch (error) {
    if (requestVersion !== mapRequestVersion) return;
    resetMap(
      error instanceof Error
        ? error.message
        : "The shipment route map is unavailable right now.",
      "error",
    );
    mapRoot.setAttribute("aria-label", "Shipment route map unavailable");
  }
}

async function renderStaticMap(trackingReference: string, requestVersion: number) {
  if (!mapRoot) return;
  if (activeMapObjectUrl) {
    URL.revokeObjectURL(activeMapObjectUrl);
    activeMapObjectUrl = null;
  }
  setMapMessage("Loading the shipment route…", "loading");
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
    setMapMessage(
      error instanceof Error
        ? error.message
        : "The shipment route map is unavailable right now.",
      "error",
    );
    mapRoot.setAttribute("aria-label", "Shipment route map unavailable");
  }
}

/* ------------------------------------------------------------------ */
/* Page states                                                         */
/* ------------------------------------------------------------------ */

function releaseStaticMap() {
  if (activeMapObjectUrl) {
    URL.revokeObjectURL(activeMapObjectUrl);
    activeMapObjectUrl = null;
  }
}

function renderRecord(record: TrackingRecord) {
  const updates = Array.isArray(record.updates)
    ? [...record.updates].sort(
        (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
      )
    : [];

  ensureHolders();
  renderOverview(record, updates);
  renderStopover(record);
  renderUpdates(record, updates);
  renderParcel(record, updates);

  const requestVersion = ++mapRequestVersion;
  if (interactiveMap) void renderInteractiveMap(record, requestVersion);
  else void renderStaticMap(record.tracking_number, requestVersion);
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
  releaseStaticMap();
  clearExtras();
  resetMap("A route map is available after a shipment is found.", "error");
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
  releaseStaticMap();
  clearExtras();
  resetMap("Loading the shipment route…", "loading");
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
  clearExtras();
  resetMap("The shipment route map is unavailable right now.", "error");
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
