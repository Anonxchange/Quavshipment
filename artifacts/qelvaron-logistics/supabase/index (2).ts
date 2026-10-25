export {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SavedEmail = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  updated_at: string;
};

type EmailAttachment = {
  filename: string;
  contentType: string;
  content: string;
};

const maxImageBytes = 4 * 1024 * 1024;
const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serviceHeaders(anonKey: string, authorization: string) {
  return {
    apikey: anonKey,
    Authorization: authorization,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST to send a saved customer email." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Supabase is not configured for this function." }, 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return jsonResponse({ error: "Sign in as an administrator to send this email." }, 401);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authorization,
    },
  }).catch(() => null);
  if (!userResponse?.ok) {
    return jsonResponse({ error: "Your administrator session could not be verified." }, 401);
  }

  const adminResponse = await fetch(
    `${supabaseUrl}/rest/v1/rpc/is_qelvaron_admin`,
    {
      method: "POST",
      headers: serviceHeaders(supabaseAnonKey, authorization),
      body: "{}",
    },
  ).catch(() => null);
  if (!adminResponse?.ok) {
    return jsonResponse({ error: "Administrator access could not be checked." }, 503);
  }
  const isAdmin = await adminResponse.json().catch(() => false);
  if (isAdmin !== true) {
    return jsonResponse({ error: "Administrator access is required." }, 403);
  }

  if (!resendApiKey || !fromAddress || /[\r\n]/.test(fromAddress)) {
    return jsonResponse({ error: "Resend is not configured for this function." }, 503);
  }

  let body: { emailId?: unknown; draftId?: unknown; attachment?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "The email request is invalid." }, 400);
  }

  const emailId = String(body.emailId ?? body.draftId ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emailId)) {
    return jsonResponse({ error: "A valid saved email ID is required." }, 400);
  }

  let attachment: EmailAttachment | undefined;
  if (body.attachment !== undefined && body.attachment !== null) {
    if (
      typeof body.attachment !== "object" ||
      Array.isArray(body.attachment)
    ) {
      return jsonResponse({ error: "The image attachment is invalid." }, 400);
    }
    const image = body.attachment as Record<string, unknown>;
    const contentType =
      typeof image.contentType === "string" ? image.contentType.toLowerCase() : "";
    const content = typeof image.content === "string" ? image.content : "";
    const rawFilename = typeof image.filename === "string" ? image.filename : "";
    const filename = rawFilename
      .trim()
      .replace(/[\\/\\r\\n]/g, "_")
      .replace(/[^A-Za-z0-9_.-]/g, "_")
      .slice(0, 120);
    const validBase64 =
      content.length > 0 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content);
    const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
    const decodedBytes = (content.length / 4) * 3 - padding;
    if (
      !filename ||
      !allowedImageTypes.has(contentType) ||
      !validBase64 ||
      decodedBytes <= 0 ||
      decodedBytes > maxImageBytes
    ) {
      return jsonResponse(
        { error: "Choose a valid JPG, PNG, WebP or GIF image up to 4 MB." },
        400,
      );
    }
    attachment = { filename, contentType, content };
  }

  const emailUrl = new URL(`${supabaseUrl}/rest/v1/email_drafts`);
  emailUrl.searchParams.set("select", "id,recipient,subject,body,updated_at");
  emailUrl.searchParams.set("id", `eq.${emailId}`);
  emailUrl.searchParams.set("limit", "1");

  const emailResponse = await fetch(emailUrl, {
    headers: serviceHeaders(supabaseAnonKey, authorization),
  }).catch(() => null);
  if (!emailResponse?.ok) {
    return jsonResponse({ error: "The saved email could not be loaded." }, 502);
  }

  const emails = await emailResponse.json().catch(() => null);
  const email = (Array.isArray(emails) ? emails[0] : null) as SavedEmail | undefined;
  if (!email) {
    return jsonResponse({ error: "No saved email was found." }, 404);
  }

  const recipient = email.recipient.trim();
  const subject = email.subject.trim().replace(/[\r\n]+/g, " ").slice(0, 200);
  const text = email.body.trim();
  if (
    !recipient ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
    !subject ||
    !text
  ) {
    return jsonResponse(
      { error: "The saved email needs a valid recipient, subject, and message." },
      422,
    );
  }

  const safeText = escapeHtml(text).replace(/\r?\n/g, "<br>");
  const attachmentHash = attachment
    ? new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(attachment.content),
        ),
      )
    : null;
  const attachmentKey = attachmentHash
    ? Array.from(attachmentHash, (byte) => byte.toString(16).padStart(2, "0")).join("")
    : "no-image";
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `qelvaron-email-${email.id}-${email.updated_at}-${attachmentKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [recipient],
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${safeText}</div>`,
      ...(attachment ? { attachments: [attachment] } : {}),
    }),
  }).catch(() => null);

  if (!resendResponse?.ok) {
    return jsonResponse({ error: "Resend could not accept the email." }, 502);
  }

  const result = await resendResponse.json().catch(() => ({}));
  return jsonResponse({
    ok: true,
    emailId: typeof result.id === "string" ? result.id : null,
    attachmentIncluded: Boolean(attachment),
  });
});
