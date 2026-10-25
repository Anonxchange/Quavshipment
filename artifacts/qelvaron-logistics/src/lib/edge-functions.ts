import {
  supabase,
  supabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./supabase";

const trackingMapFunction =
  import.meta.env.VITE_SUPABASE_MAPBOX_FUNCTION_NAME?.trim() || "shipment-map";
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

export async function fetchShipmentMap(trackingReference: string): Promise<Blob> {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to load the shipment map.",
    );
  }

  const endpoint = new URL(
    `/functions/v1/${encodeURIComponent(trackingMapFunction)}`,
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
