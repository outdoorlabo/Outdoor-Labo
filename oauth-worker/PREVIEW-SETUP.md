# Isolated OAuth preview Worker

This configuration is for the test branch only. It uses the distinct Worker name
`outdoorlabo-decap-auth-preview` and allows only the Cloudflare Pages preview
origin. It does not deploy to or modify the production Worker.

## One-time setup

1. Create a **separate GitHub OAuth App** for the preview environment. Do not reuse
   or change the production OAuth App.
2. Deploy this Worker configuration once:
   ```sh
   cd oauth-worker
   npx wrangler deploy
   ```
3. Copy the deployed `workers.dev` URL from Wrangler's output. Set that URL plus
   `/callback` as the new GitHub OAuth App's Authorization callback URL.
4. Add the new OAuth App credentials as secrets on this preview Worker:
   ```sh
   npx wrangler secret put GITHUB_OAUTH_ID
   npx wrangler secret put GITHUB_OAUTH_SECRET
   ```
   Enter values at the terminal prompt. Never commit them or paste the client
   secret into chat.
5. Point only the preview branch's Decap `backend.base_url` to the deployed
   preview Worker URL. Keep the production site's config and Worker unchanged.

The preview Worker is expected to return `503` until both secrets are configured.
Its `CMS_ORIGIN` and `CMS_ORIGINS` are restricted to the preview Pages origin.
