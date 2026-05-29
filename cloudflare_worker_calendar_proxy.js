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

const CACHE_TTL_MS = 5 * 60 * 1000;
let calendarCache = null;

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

    const now = Date.now();
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (!forceRefresh && calendarCache && calendarCache.url === calendarUrl && now - calendarCache.fetchedAt < CACHE_TTL_MS) {
      return textResponse(request, calendarCache.body, 200, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "X-Calendar-Cache": "HIT",
      });
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

    calendarCache = {
      url: calendarUrl,
      body: icsText,
      fetchedAt: now,
    };

    return textResponse(request, icsText, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Calendar-Cache": "MISS",
    });
  },
};
