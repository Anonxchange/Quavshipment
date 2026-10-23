export {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EmailDraft = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  updated_at: string;
};

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
    return jsonResponse({ error: "Use POST to send a saved email draft." }, 405);
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
    return jsonResponse({ error: "Sign in as an administrator to send this draft." }, 401);
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

  let body: { draftId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const draftId = String(body.draftId ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftId)) {
    return jsonResponse({ error: "A valid saved draft ID is required." }, 400);
  }

  const draftUrl = new URL(`${supabaseUrl}/rest/v1/email_drafts`);
  draftUrl.searchParams.set("select", "id,recipient,subject,body,updated_at");
  draftUrl.searchParams.set("id", `eq.${draftId}`);
  draftUrl.searchParams.set("limit", "1");

  const draftResponse = await fetch(draftUrl, {
    headers: serviceHeaders(supabaseAnonKey, authorization),
  }).catch(() => null);
  if (!draftResponse?.ok) {
    return jsonResponse({ error: "The saved draft could not be loaded." }, 502);
  }

  const drafts = await draftResponse.json().catch(() => null);
  const draft = (Array.isArray(drafts) ? drafts[0] : null) as EmailDraft | undefined;
  if (!draft) {
    return jsonResponse({ error: "No saved draft was found." }, 404);
  }

  const recipient = draft.recipient.trim();
  const subject = draft.subject.trim().replace(/[\r\n]+/g, " ").slice(0, 200);
  const text = draft.body.trim();
  if (
    !recipient ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
    !subject ||
    !text
  ) {
    return jsonResponse(
      { error: "The saved draft needs a valid recipient, subject, and message." },
      422,
    );
  }

  const safeText = escapeHtml(text).replace(/\r?\n/g, "<br>");
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `qelvaron-draft-${draft.id}-${draft.updated_at}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [recipient],
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${safeText}</div>`,
    }),
  }).catch(() => null);

  if (!resendResponse?.ok) {
    return jsonResponse({ error: "Resend could not accept the email." }, 502);
  }

  const result = await resendResponse.json().catch(() => ({}));
  return jsonResponse({
    ok: true,
    emailId: typeof result.id === "string" ? result.id : null,
  });
});
