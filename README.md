# Transit.sh

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/quacksire/transit.sh)

A Cloudflare Workers-compatible fork of [Transit.sh](https://github.com/codeSamuraii/transit.sh). Files stream from sender to receiver through memory.

**Workers · Durable Objects · Static Assets**

[Open the app](https://transit-sh.quacksire.workers.dev)

## Send a file

Drop a file into the app and share the link. Keep the sender tab open until the download finishes.

Or upload from your terminal:

```bash
curl --fail-with-body -T "./app.aab" \
  https://transit-sh.quacksire.workers.dev/my-transfer/
```

Leave curl running. Open [the transfer link](https://transit-sh.quacksire.workers.dev/my-transfer/) in a browser and click **Download File**.

Keep the trailing slash on the upload URL. Use a fresh ID for each transfer; each transfer accepts one receiver.

To download from another terminal:

```bash
curl --fail-with-body -JLO \
  https://transit-sh.quacksire.workers.dev/my-transfer/
```

## Run locally

```bash
git clone https://github.com/quacksire/transit.sh.git
cd transit.sh
npm ci
npm run dev
```

## Deploy

Use the button above, or:

```bash
npx wrangler login
npx wrangler deploy
```

Replace the example hostname with your deployment's URL.

## Check

```bash
npm run check
TRANSIT_URL=http://localhost:8787 node tests/workers-e2e.mjs
```

Run the transfer test while the local server is running, or set `TRANSIT_URL` to a deployed instance.

## Under the hood

| Component | Role |
| --- | --- |
| Workers | HTTP and WebSocket endpoints |
| Durable Objects | One coordinator per transfer; metadata and status in object storage |
| Static Assets | Web interface and download templates |

File bytes stay in memory. Both clients must remain connected. The original Python backend is also included; the Workers entry point is `worker/index.ts`.

## License

[Original project](https://github.com/codeSamuraii/transit.sh) · [Custom license](LICENSE) · Non-commercial use
