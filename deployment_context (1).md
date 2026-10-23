# Deployment Context — attach to any POC

The single reference for deploying a POC on the astrikos.xyz server. Two ports per
POC, two nginx files, done. Give the frontend + backend port; everything else is
derived. Section 10 is the **prompt** to paste alongside this file in a POC.

---

## 1. Port convention

Two ports per POC. Both are **odd**, stepping by 2, and share the **last two digits**:

| Tier | Band | 1st POC | 2nd | 3rd | … |
| --- | --- | --- | --- | --- | --- |
| **Frontend** | `33XX` | 3301 | 3303 | 3305 | … |
| **Backend** (API **+** socket, one port) | `43XX` | 4301 | 4303 | 4305 | … |

Frontend `33NN` pairs with backend `43NN` (same `NN`). One glance at a port → you
know the tier (`33`=front, `43`=back) and which POC (`NN`).

## 2. One backend, one port, one block

**All backend traffic — REST API and websockets — goes through a single port and a
single nginx block in `astriverse.conf`.** That block uses the websocket-upgrade
shape, which serves plain HTTP *and* socket upgrades transparently. There is **no
separate api port, no separate socket port, and no `fastapi` file** anymore.

> If a POC's backend is physically two processes (e.g. a Python API + a Node
> socket server), keep the **one public subdomain/port** and route by path inside
> the single block (`location /socket.io/ { … node }`, `location / { … api }`) to
> their internal ports. Still one public backend port. (DSO example in §7.)

## 3. Two nginx files — one concern each

| File | Path | Holds | Cloudflare |
| --- | --- | --- | --- |
| `astrikos.conf` | `/etc/nginx/conf/astrikos.conf` | every **frontend** (plain block) | Orange |
| `astriverse.conf` | `/etc/nginx/conf/astriverse.conf` | every **backend** (block + WS upgrade) | **Gray** |

Backend subdomains are **Gray** in Cloudflare (DNS-only) because they carry
websockets; frontends are **Orange** (proxied).

## 4. Everything is derivable — compute, don't invent

Given `<poc>` and its two ports `<fport>` / `<bport>`:

| Thing | Value | DSO (3301 / 4301) |
| --- | --- | --- |
| Frontend subdomain | `<poc>.astrikos.xyz` | dso.astrikos.xyz |
| Backend subdomain | `<poc>-api.astrikos.xyz` | dso-api.astrikos.xyz |
| pm2 frontend name | `<poc>_<fport>` | dso_3301 |
| pm2 backend name | `<poc>_be_<bport>` | dso_be_4301 |

## 5. Env discipline (never hardcode)

Every cross-service URL lives in `.env.production` — no host/IP/port literals in
source. One backend now means **one** URL:

```
VITE_API_URL=https://<poc>-api.astrikos.xyz:8443
VITE_SOCKET_URL=https://<poc>-api.astrikos.xyz:8443   # same host — one backend
```
Backend listen port is passed inline on the pm2 command (reads `process.env.PORT`).

---

## 6. Port registry — single source of truth

Append one row per POC **before** deploying, so you never reuse a pair.

| POC | Frontend | Backend | Status |
| --- | --- | --- | --- |
| dso | 3301 | 4301 | live |
| _next_ | 3303 | 4303 | — |

---

## 7. Deploy — fill `<...>`, run

```bash
# ── Frontend (static SPA) ─────────────────────────────────────────
cd <frontend-dir>
npm install && npm run build                       # → dist/
pm2 start serve --name "<poc>_<fport>" -- ./dist -s -p <fport>

# ── Backend (API + socket, single port) ───────────────────────────
cd <backend-dir>
PORT=<bport> pm2 start <entry> --name "<poc>_be_<bport>"

pm2 save
```

### nginx blocks

`astrikos.conf` — frontend:
```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name <poc>.astrikos.xyz;
    location / {
        add_header 'Access-Control-Allow-Origin' '*' always;
        proxy_pass http://127.0.0.1:<fport>;
    }
}
```

`astriverse.conf` — backend (needs `map $http_upgrade $connection_upgrade {…}` once at top of file):
```nginx
server {
    listen 8443 ssl;
    ssl_certificate     /etc/certs/astrikos.xyz/fullchain.pem;
    ssl_certificate_key /etc/certs/astrikos.xyz/privkey.pem;
    server_name <poc>-api.astrikos.xyz;
    location / {
        proxy_pass http://127.0.0.1:<bport>;
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

> **Two-process backend variant** (e.g. DSO = Python API + Node socket). Same one
> public port/subdomain; route by path to internal ports:
> ```nginx
>     location /socket.io/ { proxy_pass http://127.0.0.1:<node_port>; proxy_http_version 1.1;
>         proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;
>         proxy_set_header Host $host; proxy_read_timeout 7d; proxy_buffering off; }
>     location /         { proxy_pass http://127.0.0.1:<python_port>; proxy_set_header Host $host; }
> ```

Apply: `sudo nginx -t && sudo systemctl reload nginx`

### Cloudflare DNS
- `<poc>.astrikos.xyz` → **Orange**
- `<poc>-api.astrikos.xyz` → **Gray** (DNS-only)

### Verify
```bash
curl -k https://<poc>.astrikos.xyz:8443           # SPA HTML
curl -k https://<poc>-api.astrikos.xyz:8443/      # backend responds (REST + WS on same host)
```

---

## 8. New POC checklist

1. Add a row to the **registry** (§6) → next odd pair `33NN` / `43NN`.
2. Attach this file + the **prompt** (§10), give the two ports → Claude rewrites
   the code and writes `DEPLOY.md`.
3. Build + `pm2 start` both (§7). `pm2 save`.
4. Add the two nginx blocks. `nginx -t && reload`.
5. Cloudflare: frontend Orange, backend Gray. Verify with the curls.

---

## 9. What "deployment-ready" means

- No hardcoded hosts/IPs/ports in source — all via `.env.production`.
- Frontend build output confirmed (`dist/`) and served on `<fport>`.
- Backend reads `PORT` from env and listens on `<bport>`; serves REST **and** WS.
- Both nginx blocks written; Cloudflare colors correct.
- `DEPLOY.md` present with exact commands for this POC's two ports.

---

## 10. Prompt to paste in a POC (with this file attached)

> Copy this, fill the three angle-bracket values, attach `deployment_context.md`.

```
You are preparing THIS repo for deployment on the astrikos.xyz server. The
attached deployment_context.md is the authoritative convention — follow it exactly.

Inputs:
- POC name:      <poc>
- Frontend port: <fport>   (33XX)
- Backend port:  <bport>   (43XX, single port for BOTH REST API and websocket)

Do everything below in one pass, then summarize:

1. DETECT the stack: the frontend build tool + output dir; the backend process(es)
   and how each reads its listen port; and EVERY file where source references a
   backend / socket / API host, IP, or port.

2. ENV: create/update .env.production (and .env) so all cross-service URLs are
   env-driven and point at the derived subdomains:
     VITE_API_URL=https://<poc>-api.astrikos.xyz:8443
     VITE_SOCKET_URL=https://<poc>-api.astrikos.xyz:8443
   Ensure the backend listens on <bport> (via process.env.PORT).

3. CODE: replace EVERY hardcoded host/IP/localhost/port for the backend, socket,
   or API with the env var. No literal LAN IPs (e.g. 192.168.x.x) or :PORT left in
   shipped source. List each file you changed and the before/after.

4. NGINX: output the exact server blocks to paste —
     - astrikos.conf: frontend block, server_name <poc>.astrikos.xyz, proxy to
       127.0.0.1:<fport>.
     - astriverse.conf: ONE backend block, server_name <poc>-api.astrikos.xyz,
       proxy to 127.0.0.1:<bport>, WITH the websocket upgrade headers so the same
       block serves REST and sockets. Use the wildcard cert paths from the context.
   Do NOT create any extra port, subdomain, or a fastapi file. Only the two ports
   given. If the backend is two processes, keep ONE public subdomain/port and route
   by path (location /socket.io/ → node, location / → api) to internal ports, and
   tell me those internal ports.

5. CREATE DEPLOY.md containing: a process table (ports, subdomains, pm2 names
   derived per the context), exact `npm run build` + `pm2 start` commands for both
   processes, the two nginx blocks, Cloudflare settings (frontend Orange, backend
   Gray), and the verify curls.

Finish with a short summary: files CHANGED, files CREATED, and the two nginx blocks
ready to paste.
```
