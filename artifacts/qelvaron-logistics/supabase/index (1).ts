export {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Coordinates = [number, number];

type TrackingUpdate = {
  status?: string;
  location?: string;
  timestamp?: string;
};

type PublicShipment = {
  tracking_number: string;
  status: string;
  origin_city: string;
  origin_country: string;
  destination_city: string;
  destination_country: string;
  updates: TrackingUpdate[] | null;
};

const allowedThemes = new Set(["streets-v12", "light-v11", "dark-v11"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanPlace(city: string | null | undefined, country: string | null | undefined) {
  return [city, country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

async function geocode(place: string, accessToken: string): Promise<Coordinates | null> {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(place)}.json`,
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "place,locality,region,country");

  const response = await fetch(url);
  if (!response.ok) return null;

  const result = await response.json();
  const center = result?.features?.[0]?.center;
  if (
    !Array.isArray(center) ||
    typeof center[0] !== "number" ||
    typeof center[1] !== "number" ||
    center[0] < -180 ||
    center[0] > 180 ||
    center[1] < -90 ||
    center[1] > 90
  ) {
    return null;
  }

  return [center[0], center[1]];
}

function routeOverlay(color: string, points: Coordinates[]) {
  if (points.length < 2) return null;
  const coordinates = points.map(([longitude, latitude]) => `${longitude},${latitude}`).join(",");
  return `path-4+${color}-0.85(${coordinates})`;
}

function markerOverlay(size: "s" | "l", color: string, [longitude, latitude]: Coordinates) {
  return `pin-${size}+${color}(${longitude},${latitude})`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST to request a shipment map." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN");
  if (!supabaseUrl || !supabaseAnonKey || !mapboxToken) {
    return jsonResponse({ error: "Map tracking is not configured." }, 503);
  }

  let body: { trackingReference?: unknown; theme?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const trackingReference = String(body.trackingReference ?? "").trim().toUpperCase();
  if (
    !trackingReference ||
    trackingReference.length > 50 ||
    /[\u0000-\u001f]/.test(trackingReference)
  ) {
    return jsonResponse({ error: "Enter a valid tracking reference." }, 400);
  }

  const lookupResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/lookup_shipment`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_reference: trackingReference }),
  }).catch(() => null);

  if (!lookupResponse?.ok) {
    return jsonResponse({ error: "Shipment details could not be loaded." }, 502);
  }

  const rows = await lookupResponse.json().catch(() => null);
  const shipment = (Array.isArray(rows) ? rows[0] : null) as PublicShipment | undefined;
  if (!shipment) {
    return jsonResponse({ error: "No shipment was found for that reference." }, 404);
  }

  const originPlace = cleanPlace(shipment.origin_city, shipment.origin_country);
  const destinationPlace = cleanPlace(
    shipment.destination_city,
    shipment.destination_country,
  );
  if (!originPlace || !destinationPlace) {
    return jsonResponse({ error: "The shipment route is incomplete." }, 422);
  }

  const updates = Array.isArray(shipment.updates) ? shipment.updates : [];
  const latestUpdate = [...updates].sort(
    (a, b) => Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? ""),
  )[0];
  const currentPlace = latestUpdate?.location?.trim() ?? "";

  const [origin, destination, reportedCurrent] = await Promise.all([
    geocode(originPlace, mapboxToken),
    geocode(destinationPlace, mapboxToken),
    currentPlace ? geocode(currentPlace, mapboxToken) : Promise.resolve(null),
  ]);

  if (!origin || !destination) {
    return jsonResponse(
      { error: "Mapbox could not locate the shipment's origin or destination." },
      422,
    );
  }

  const current =
    shipment.status.toLowerCase() === "delivered"
      ? destination
      : reportedCurrent;
  const sameCoordinates = (a: Coordinates, b: Coordinates) =>
    a[0] === b[0] && a[1] === b[1];

  const overlays: string[] = [];
  if (current && !sameCoordinates(current, origin) && !sameCoordinates(current, destination)) {
    const completedRoute = routeOverlay("16a34a", [origin, current]);
    const remainingRoute = routeOverlay("7c3aed", [current, destination]);
    if (completedRoute) overlays.push(completedRoute);
    if (remainingRoute) overlays.push(remainingRoute);
  } else {
    const fullRoute = routeOverlay(
      shipment.status.toLowerCase() === "delivered" ? "16a34a" : "7c3aed",
      [origin, destination],
    );
    if (fullRoute) overlays.push(fullRoute);
  }

  overlays.push(markerOverlay("s", "16a34a", origin));
  overlays.push(markerOverlay("s", "7c3aed", destination));
  if (current && !sameCoordinates(current, origin) && !sameCoordinates(current, destination)) {
    overlays.push(markerOverlay("l", "2563eb", current));
  }

  const requestedTheme = String(body.theme ?? "");
  const theme = allowedThemes.has(requestedTheme) ? requestedTheme : "streets-v12";
  const encodedOverlays = overlays.map(encodeURIComponent).join(",");
  const imageUrl = new URL(
    `https://api.mapbox.com/styles/v1/mapbox/${theme}/static/${encodedOverlays}/auto/1000x520`,
  );
  imageUrl.searchParams.set("access_token", mapboxToken);
  imageUrl.searchParams.set("padding", "56");

  const mapResponse = await fetch(imageUrl).catch(() => null);
  const contentType = mapResponse?.headers.get("content-type") ?? "";
  if (!mapResponse?.ok || !contentType.startsWith("image/")) {
    return jsonResponse({ error: "Mapbox could not render this shipment route." }, 502);
  }

  return new Response(mapResponse.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
