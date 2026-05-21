function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = origin || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function textResponse(request, body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    if (request.method !== "GET") {
      return textResponse(request, "Method not allowed", 405, {
        Allow: "GET, OPTIONS",
      });
    }

    const expectedToken = String(env.ACCESS_TOKEN || "").trim();
    const calendarUrl = String(env.ICS_URL || "").trim();

    if (!expectedToken || !calendarUrl) {
      return textResponse(request, "Worker is not configured", 500);
    }

    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${expectedToken}`) {
      return textResponse(request, "Unauthorized", 401);
    }

    let calendarResponse;
    try {
      calendarResponse = await fetch(calendarUrl, {
        headers: {
          Accept: "text/calendar, text/plain, */*",
        },
      });
    } catch (err) {
      return textResponse(request, "Calendar fetch failed", 502);
    }

    if (!calendarResponse.ok) {
      return textResponse(request, "Calendar fetch failed", 502);
    }

    const icsText = await calendarResponse.text();
    if (!icsText.includes("BEGIN:VCALENDAR")) {
      return textResponse(request, "Calendar response was not ICS", 502);
    }

    return textResponse(request, icsText, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    });
  },
};
