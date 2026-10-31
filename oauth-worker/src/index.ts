interface Env {
  GITHUB_OAUTH_ID: string;
  GITHUB_OAUTH_SECRET: string;
  CMS_ORIGIN: string;
  CMS_ORIGINS?: string;
}

const STATE_COOKIE = "decap_oauth_state";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  return headers;
}

function htmlResponse(html: string, status = 200, extra: HeadersInit = {}): Response {
  const headers = secureHeaders(extra);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { status, headers });
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function cookie(value: string, maxAge: number): string {
  return `${STATE_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/callback; Max-Age=${maxAge}`;
}

function allowedCmsOrigins(env: Env): Set<string> {
  const configured = env.CMS_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  if (configured.length === 0 && env.CMS_ORIGIN) configured.push(env.CMS_ORIGIN);

  const origins = new Set<string>();
  for (const value of configured) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.origin === value) origins.add(url.origin);
    } catch {
      // Ignore malformed entries; only exact HTTPS origins are accepted.
    }
  }
  return origins;
}

function resolveCmsOrigin(request: Request, env: Env): string | null {
  const allowed = allowedCmsOrigins(env);
  const source = request.headers.get("Origin") ?? request.headers.get("Referer");

  // Older/non-browser callers may omit both headers; retain the production default.
  if (!source) {
    const fallback = env.CMS_ORIGIN;
    return fallback && allowed.has(fallback) ? fallback : null;
  }

  try {
    const origin = new URL(source).origin;
    return allowed.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

function originFromStateCookie(savedState: string, env: Env): { state: string; origin: string } | null {
  const separator = savedState.indexOf(".");
  const state = separator === -1 ? savedState : savedState.slice(0, separator);
  const encodedOrigin = separator === -1 ? null : savedState.slice(separator + 1);
  let origin = env.CMS_ORIGIN;

  if (encodedOrigin) {
    try {
      origin = decodeURIComponent(encodedOrigin);
    } catch {
      return null;
    }
  }

  if (!origin || !allowedCmsOrigins(env).has(origin)) return null;
  return { state, origin };
}

function callbackPage(
  cmsOrigin: string,
  status: "success" | "error",
  payload: { token?: string; message?: string },
  extraHeaders: HeadersInit = {},
): Response {
  // Escape characters that could terminate the inline script context.
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const messageType = status === "success" ? "success" : "error";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Decap authorization</title></head>
<body>
  <p>Returning to Decap CMS…</p>
  <script>
    (() => {
      const targetOrigin = ${JSON.stringify(cmsOrigin)};
      const payload = ${payloadJson};
      const message = "authorization:github:${messageType}:" + JSON.stringify(payload);
      const opener = window.opener;
      if (!opener) {
        document.body.textContent = "Please close this window and try signing in again.";
        return;
      }
      const receiveMessage = (event) => {
        if (event.origin !== targetOrigin || event.source !== opener) return;
        opener.postMessage(message, targetOrigin);
        window.removeEventListener("message", receiveMessage, false);
        window.close();
      };
      window.addEventListener("message", receiveMessage, false);
      opener.postMessage("authorizing:github", targetOrigin);
    })();
  </script>
</body>
</html>`;
  const headers = new Headers(extraHeaders);
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  );
  return htmlResponse(html, 200, headers);
}

function errorPage(message: string, status = 400, extra: HeadersInit = {}): Response {
  const safeMessage = message.replace(/[<>&"']/g, "");
  return htmlResponse(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>OAuth error</title><body><p>${safeMessage}</p></body></html>`,
    status,
    extra,
  );
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const cmsOrigin = resolveCmsOrigin(request, env);
  if (!cmsOrigin) {
    return new Response("This CMS origin is not allowed.", {
      status: 403,
      headers: secureHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
    });
  }

  const state = randomHex(32);
  const redirectUri = `${new URL(request.url).origin}/callback`;
  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GITHUB_OAUTH_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "public_repo,user");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("allow_signup", "false");

  return new Response(null, {
    status: 302,
    headers: secureHeaders({
      Location: authorizeUrl.toString(),
      "Set-Cookie": cookie(`${state}.${encodeURIComponent(cmsOrigin)}`, 600),
    }),
  });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const savedStateValue = readCookie(request, STATE_COOKIE);
  const savedState = savedStateValue ? originFromStateCookie(savedStateValue, env) : null;
  const clearState = cookie("", 0);

  if (!state || !savedState || state !== savedState.state) {
    return errorPage("OAuth state validation failed. Please close this window and try again.", 400, {
      "Set-Cookie": clearState,
    });
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return callbackPage(savedState.origin, "error", {
      message: "GitHub authorization was not completed.",
    }, { "Set-Cookie": clearState });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return errorPage("Missing authorization code.", 400, { "Set-Cookie": clearState });
  }

  const redirectUri = `${url.origin}/callback`;
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_ID,
      client_secret: env.GITHUB_OAUTH_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    return errorPage("GitHub token exchange failed. Please try again.", 502, {
      "Set-Cookie": clearState,
    });
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenData.access_token) {
    return errorPage("GitHub did not return an access token.", 502, {
      "Set-Cookie": clearState,
    });
  }

  return callbackPage(savedState.origin, "success", { token: tokenData.access_token }, {
    "Set-Cookie": clearState,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: secureHeaders({ Allow: "GET" }),
      });
    }

    if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET || allowedCmsOrigins(env).size === 0) {
      return new Response("OAuth Worker is not configured.", {
        status: 503,
        headers: secureHeaders(),
      });
    }

    if (url.pathname === "/auth") return handleAuth(request, env);
    if (url.pathname === "/callback") return handleCallback(request, env);
    if (url.pathname === "/health") {
      return new Response("ok", { headers: secureHeaders({ "Content-Type": "text/plain; charset=utf-8" }) });
    }

    return new Response("Decap OAuth proxy", { headers: secureHeaders() });
  },
};
