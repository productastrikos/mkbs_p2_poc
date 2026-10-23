# Deploying GreenLight EVP on astrikos.xyz

POC **`mbks-evp`**, frontend **3287**, backend **4287**. Follows `deployment_context.md`: two ports, two nginx blocks.

## Processes

| Tier | Port | Public URL | pm2 name | Runs | Cloudflare |
| --- | --- | --- | --- | --- | --- |
| Frontend | 3287 | https://mbks-evp.astrikos.xyz:8443 | `mbks-evp_3287` | `serve ./build -s` (static SPA) | Orange |
| Backend | 4287 | https://mbks-evp-api.astrikos.xyz:8443 | `mbks-evp_be_4287` | `server/api.js` (LLM API, `/api/llm/*`) | Gray |

Port registry row to add:

```
| mbks-evp | 3287 | 4287 | live |
```

Both tiers run from the same repo checkout. The backend is a single Node process with no websockets. Its nginx block still uses the websocket-upgrade layout from the convention, which also handles plain HTTP and keeps the streamed LLM responses unbuffered.

## Environment

| File | In git | Holds |
| --- | --- | --- |
| `.env.production` | yes | `REACT_APP_API_URL=https://mbks-evp-api.astrikos.xyz:8443` (baked into the bundle at build time) and `CORS_ORIGIN=https://mbks-evp.astrikos.xyz:8443` (read by `server/api.js`) |
| `.env` | yes | `REACT_APP_API_URL=` (empty, same origin) for `npm start` |
| `.env.local` | **no**, create on the server | `ANTHROPIC_API_KEY=sk-ant-...`, optional `EVP_LLM_MODEL` |

- This is a Create React App build, so frontend variables use the `REACT_APP_` prefix (the convention's `VITE_API_URL`). Build output goes to `build/`, not `dist/`.
- There is no `SOCKET_URL` because the app has no socket client.
- The backend port comes from `PORT` on the pm2 command line.
- Without `ANTHROPIC_API_KEY`, the AI Assistant page falls back to offline templates and shows that it has.

## Prerequisites (server)

- Node **≥ 20.12**: the server uses `process.loadEnvFile`.
- `pm2`, plus `serve` installed globally (`npm i -g serve`).

## Deploy

```bash
cd <repo-dir>
git pull
npm install
nano .env.local                 # first deploy only: ANTHROPIC_API_KEY=sk-ant-...
npm run build                   # → build/

# ── Frontend (static SPA) ─────────────────────────────────────────
pm2 start serve --name "mbks-evp_3287" -- ./build -s -p 3287

# ── Backend (API, single port) ────────────────────────────────────
PORT=4287 pm2 start server/api.js --name "mbks-evp_be_4287"

pm2 save
```

### Updating

```bash
cd <repo-dir> && git pull && npm install && npm run build
pm2 restart mbks-evp_be_4287    # needed after changes to server/ or .env.local
```

`serve` reads `build/` from disk, so the frontend shows a new build without a restart. The site is unavailable for the few seconds `npm run build` takes to rewrite `build/`. After editing `.env.production`, rebuild and restart the backend.

## nginx

`/etc/nginx/conf/astrikos.conf` (frontend):

```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name mbks-evp.astrikos.xyz;
    location / {
        add_header 'Access-Control-Allow-Origin' '*' always;
        proxy_pass http://127.0.0.1:3287;
    }
}
```

`/etc/nginx/conf/astriverse.conf` (backend; relies on the `map $http_upgrade $connection_upgrade {…}` already at the top of the file):

```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name mbks-evp-api.astrikos.xyz;
    location / {
        proxy_pass http://127.0.0.1:4287;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        proxy_buffering off;
    }
}
```

CORS is handled by `server/api.js`. Do not add `Access-Control-*` headers to the backend block: a second copy of the header makes browsers reject the response.

Apply: `sudo nginx -t && sudo systemctl reload nginx`

## Cloudflare DNS

- `mbks-evp.astrikos.xyz` → **Orange** (proxied)
- `mbks-evp-api.astrikos.xyz` → **Gray** (DNS only)

## Verify

```bash
# On the server, before nginx
curl -s http://127.0.0.1:3287/ | head -c 120                   # SPA HTML
curl -s http://127.0.0.1:4287/                                  # {"service":"greenlight-evp-api","ok":true}

# Public
curl -k https://mbks-evp.astrikos.xyz:8443                      # SPA HTML
curl -k https://mbks-evp-api.astrikos.xyz:8443/                 # {"service":"greenlight-evp-api","ok":true}
curl -k https://mbks-evp-api.astrikos.xyz:8443/api/llm/status   # {"available":true,...} once the key is set
curl -k -i -X OPTIONS https://mbks-evp-api.astrikos.xyz:8443/api/llm/chat \
  -H "Origin: https://mbks-evp.astrikos.xyz:8443" -H "Access-Control-Request-Method: POST"
                                                                # 204 + Access-Control-Allow-Origin: https://mbks-evp.astrikos.xyz:8443
```

In the browser, open **AI Assistant**. The status badge should read "Claude · claude-opus-5-5", not "Offline templates: LLM server not reachable".

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| AI Assistant badge reads "Offline templates: LLM server not reachable" | The backend is down (`pm2 logs mbks-evp_be_4287`), the bundle was built with the wrong `REACT_APP_API_URL` (fix it and rebuild), or `CORS_ORIGIN` does not exactly match the frontend origin (scheme, host and `:8443`). |
| Badge reads "Offline templates: ANTHROPIC_API_KEY not set" | `.env.local` is missing or the backend was not restarted after it was created. |
| Deep link such as `/junctions/J16` returns 404 | `serve` was started without `-s`. |
| `process.loadEnvFile is not a function` | Node is older than 20.12. |
