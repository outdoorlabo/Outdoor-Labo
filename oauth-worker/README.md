# OUTDOOR LABO — Decap OAuth Worker

This Cloudflare Worker is the GitHub OAuth proxy for Decap CMS. It is intentionally deployed on a separate hostname from the website.

## Fixed settings

- CMS origin: `https://outdoorlabo.a-ce.com`
- Worker hostname: `https://decap-auth.a-ce.com`
- GitHub repository: `outdoorlabo/Outdoor-Labo` (public)
- OAuth callback: `https://decap-auth.a-ce.com/callback`

The Decap configuration in `static/admin/config.yml` uses the same Worker hostname. If you choose a different hostname, update both locations before deployment.

## 1. Create the GitHub OAuth App

In GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.

Set:

- Application name: `OUTDOOR LABO CMS`
- Homepage URL: `https://decap-auth.a-ce.com`
- Authorization callback URL: `https://decap-auth.a-ce.com/callback`

Save the Client ID and Client Secret. Do not commit either value or put the Client Secret in chat.

The repository is public, so the Worker requests `public_repo,user` scopes. The OAuth App does not need repository administration permissions.

## 2. Deploy the Worker

From this directory:

```sh
npm install
npx wrangler login
npx wrangler secret put GITHUB_OAUTH_ID
npx wrangler secret put GITHUB_OAUTH_SECRET
npx wrangler deploy
```

Paste the GitHub OAuth App Client ID and Client Secret into the corresponding Wrangler prompts. These become encrypted Worker secrets; they are not stored in this repository.

In Cloudflare, add the Worker custom domain **decap-auth.a-ce.com**. Ensure the domain is in the same Cloudflare account/zone that manages `a-ce.com`. If you deploy to a different hostname, update the GitHub OAuth callback URL and Decap `backend.base_url` to match.

The non-secret `CMS_ORIGIN` is already set in `wrangler.toml`.

## 3. Verify

- Open `https://decap-auth.a-ce.com/health`; it should return `ok`.
- Open `https://outdoorlabo.a-ce.com/admin/` after the Decap CMS branch has been deployed.
- Sign in with the GitHub account that has write access to `outdoorlabo/Outdoor-Labo`.

The Worker validates the OAuth state using a short-lived, HttpOnly, Secure, SameSite=Lax cookie. It exchanges the authorization code server-side and sends the token only to the fixed CMS origin via `window.postMessage`. It does not log OAuth codes or tokens.

## Local development

```sh
npm install
npx wrangler dev
```

Local development uses the production CMS origin in this initial setup. For a full local OAuth round-trip, use a separate test OAuth App and set its callback to the local Worker URL; do not change the production app's callback just for local testing.
