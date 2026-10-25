import {
  supabase,
  supabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./supabase";

// The deployed function is "mapbox" (…/functions/v1/mapbox). Override with
// VITE_SUPABASE_MAPBOX_FUNCTION_NAME only if you rename it.
const mapboxFunction =
  import.meta.env.VITE_SUPABASE_MAPBOX_FUNCTION_NAME?.trim() || "mapbox";
const resendFunction =
  import.meta.env.VITE_SUPABASE_RESEND_FUNCTION_NAME?.trim() || "resend";
export const MAX_EMAIL_IMAGE_BYTES = 4 * 1024 * 1024;
export const EMAIL_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

async function encodeEmailImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return {
    filename: file.name,
    contentType: file.type,
    content: btoa(binary),
  };
}

type FunctionError = {
  error?: unknown;
};

// supabase.functions.invoke hides the function's own error text inside
// error.context (the raw Response). Pull it out so users see a useful message.
async function functionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const failure = (await context.clone().json().catch(() => null)) as
      | FunctionError
      | null;
    if (typeof failure?.error === "string") return failure.error;
  }
  return fallback;
}

export type RoutePoint = {
  label: string;
  coordinates: [number, number]; // [longitude, latitude]
};

export type ShipmentRoute = {
  trackingReference: string;
  status: string;
  origin: RoutePoint;
  destination: RoutePoint;
  stopover: RoutePoint | null;
  current: RoutePoint | null;
};

function isRoutePoint(value: unknown): value is RoutePoint {
  const point = value as RoutePoint | null;
  return (
    !!point &&
    typeof point.label === "string" &&
    Array.isArray(point.coordinates) &&
    point.coordinates.length === 2 &&
    point.coordinates.every((part) => typeof part === "number" && Number.isFinite(part))
  );
}

/**
 * Route points for the interactive Mapbox GL map. Called like the Resend
 * function: through supabase.functions.invoke, so the publishable key and
 * CORS handling come from the Supabase client.
 */
export async function fetchShipmentRoute(
  trackingReference: string,
): Promise<ShipmentRoute> {
  if (!supabaseConfigured || !supabase) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to load the shipment map.",
    );
  }

  const { data, error } = await supabase.functions.invoke(mapboxFunction, {
    body: { trackingReference, format: "json" },
  });

  if (error) {
    throw new Error(
      await functionErrorMessage(error, "The shipment route could not be loaded."),
    );
  }

  const route = data as Partial<ShipmentRoute> | null;
  if (
    !route ||
    !isRoutePoint(route.origin) ||
    !isRoutePoint(route.destination) ||
    (route.stopover != null && !isRoutePoint(route.stopover)) ||
    (route.current != null && !isRoutePoint(route.current))
  ) {
    throw new Error("The map function returned an unexpected response.");
  }

  return {
    trackingReference: route.trackingReference ?? trackingReference,
    status: route.status ?? "",
    origin: route.origin,
    destination: route.destination,
    stopover: route.stopover ?? null,
    current: route.current ?? null,
  };
}

/**
 * Static PNG of the route. Kept as a fallback for when no public Mapbox token
 * is configured in the browser. Uses fetch because supabase.functions.invoke
 * cannot return image bodies as a Blob.
 */
export async function fetchShipmentMap(trackingReference: string): Promise<Blob> {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to load the shipment map.",
    );
  }

  const endpoint = new URL(
    `/functions/v1/${encodeURIComponent(mapboxFunction)}`,
    supabaseUrl,
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${supabasePublishableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trackingReference,
      theme: "streets-v12",
      format: "image",
    }),
  });

  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as
      | FunctionError
      | null;
    const message =
      typeof failure?.error === "string"
        ? failure.error
        : `The shipment map could not be loaded (${response.status}).`;
    throw new Error(message);
  }

  if (!response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("The tracking map function did not return an image.");
  }

  return response.blob();
}

export async function sendSavedEmail(
  emailId: string,
  imageFile?: File,
  trackingReference?: string,
): Promise<{ emailId: string | null }> {
  if (!supabaseConfigured || !supabase) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before sending email.",
    );
  }

  const attachment = imageFile ? await encodeEmailImage(imageFile) : undefined;
  const { data, error } = await supabase.functions.invoke(resendFunction, {
    body: {
      emailId,
      ...(trackingReference ? { tracking: trackingReference } : {}),
      ...(attachment ? { attachment } : {}),
    },
  });

  if (error) {
    throw new Error(error.message || "The Resend function could not be reached.");
  }

  const result = data as { ok?: unknown; emailId?: unknown } | null;
  if (result?.ok !== true) {
    throw new Error("The Resend function did not confirm the email.");
  }
  if (imageFile && (result as { attachmentIncluded?: unknown }).attachmentIncluded !== true) {
    throw new Error("The email service did not confirm the image attachment. The message may have been sent without it.");
  }

  return {
    emailId: typeof result.emailId === "string" ? result.emailId : null,
  };
}
