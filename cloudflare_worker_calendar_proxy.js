const CALENDAR_SNAPSHOT_KEY = "calendar-snapshot";
const CALENDAR_MAX_AGE_MS = 5 * 60 * 1000;

let inFlightRefresh = null;

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = origin || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type",
    "Access-Control-Expose-Headers": "X-Calendar-Cache, X-Calendar-Fetched-At, X-Calendar-Refresh-Ms",
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

function isValidSnapshot(snapshot) {
  return Boolean(
    snapshot
    && typeof snapshot.icsText === "string"
    && snapshot.icsText.includes("BEGIN:VCALENDAR")
    && Number.isFinite(snapshot.fetchedAt)
  );
}

async function readCalendarSnapshot(env) {
  const snapshot = await env.CALENDAR_CACHE.get(CALENDAR_SNAPSHOT_KEY, "json");
  return isValidSnapshot(snapshot) ? snapshot : null;
}

async function fetchAndStoreCalendarSnapshot(env) {
  const calendarUrl = String(env.ICS_URL || "").trim();
  if (!calendarUrl) throw new Error("Worker is not configured");

  const startedAt = Date.now();
  let calendarResponse;
  try {
    calendarResponse = await fetch(calendarUrl, {
      headers: {
        Accept: "text/calendar, text/plain, */*",
      },
    });
  } catch (err) {
    throw new Error("Calendar fetch failed");
  }

  if (!calendarResponse.ok) throw new Error("Calendar fetch failed");

  const icsText = await calendarResponse.text();
  if (!icsText.includes("BEGIN:VCALENDAR")) throw new Error("Calendar response was not ICS");

  const snapshot = { icsText, fetchedAt: Date.now() };
  await env.CALENDAR_CACHE.put(CALENDAR_SNAPSHOT_KEY, JSON.stringify(snapshot));
  return { snapshot, refreshMs: Date.now() - startedAt };
}

async function refreshCalendarSnapshot(env) {
  if (!inFlightRefresh) {
    inFlightRefresh = fetchAndStoreCalendarSnapshot(env).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

function calendarResponse(request, snapshot, cacheStatus, refreshMs = null) {
  const headers = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Calendar-Cache": cacheStatus,
    "X-Calendar-Fetched-At": String(snapshot.fetchedAt),
  };
  if (typeof refreshMs === "number") headers["X-Calendar-Refresh-Ms"] = String(Math.round(refreshMs));
  return textResponse(request, snapshot.icsText, 200, headers);
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
    if (!expectedToken || !String(env.ICS_URL || "").trim() || !env.CALENDAR_CACHE) {
      return textResponse(request, "Worker is not configured", 500);
    }

    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${expectedToken}`) {
      return textResponse(request, "Unauthorized", 401);
    }

    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const snapshot = forceRefresh ? null : await readCalendarSnapshot(env);
    if (snapshot && Date.now() - snapshot.fetchedAt <= CALENDAR_MAX_AGE_MS) {
      return calendarResponse(request, snapshot, "HIT");
    }

    try {
      const refreshed = await refreshCalendarSnapshot(env);
      return calendarResponse(request, refreshed.snapshot, "MISS", refreshed.refreshMs);
    } catch (err) {
      console.error("Calendar refresh failed:", err);
      return textResponse(request, "Calendar refresh failed", 502, {
        "Cache-Control": "no-store",
      });
    }
  },

  async scheduled(controller, env) {
    try {
      await refreshCalendarSnapshot(env);
    } catch (err) {
      console.error("Scheduled calendar refresh failed:", err);
      throw err;
    }
  },
};
