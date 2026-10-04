# Transit.sh — Cloudflare Workers Fork

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/quacksire/transit.sh)
[![License](https://img.shields.io/badge/license-Custom-lightgrey.svg)](LICENSE)

A **Cloudflare Workers-compatible fork** of [codeSamuraii/transit.sh](https://github.com/codeSamuraii/transit.sh), originally created by Rémi Héneault. Transfer files from sender to receiver through a streaming relay, using the browser or curl, without storing file contents on disk.

This fork uses **Cloudflare Workers, Durable Objects, and Workers Static Assets**, with a TypeScript backend and Wrangler for development and deployment. The Workers deployment does not require Python, Redis, or a separate server.

Try it at [transit-sh.quacksire.workers.dev](https://transit-sh.quacksire.workers.dev).

## Cloudflare Stack

- **Workers** handles HTTP routes, WebSocket upgrades, and download responses.
- **Durable Objects** coordinate the sender and receiver in one object per transfer ID. Object storage holds transfer metadata and status; file bytes pass through memory.
- **Workers Static Assets** serves the original web interface, CSS, JavaScript, and page templates through the `ASSETS` binding.
- **Wrangler** runs the app locally and deploys the Worker, assets, and Durable Object binding.

File contents are not written to R2, KV, D1, or Durable Object storage. Both clients must remain connected during the transfer. This is a live relay, not a file-hosting service.

## Usage

### Browser

1. Open your deployed instance and select or drop a file.
2. Copy the generated link and send it to the receiver.
3. Keep the sender tab open while the receiver opens the link and clicks **Download File**.

### Terminal upload → browser download

```bash
curl --fail-with-body -T "/path/to/app.aab" \
  https://transit-sh.quacksire.workers.dev/my-transfer/
```

Keep curl running, then open [the download page](https://transit-sh.quacksire.workers.dev/my-transfer/) in a browser and click **Download File**. Replace the hostname with your own deployment when self-hosting.

Use HTTPS and keep the trailing slash on the upload URL: curl appends the filename, producing `/<transfer-id>/<filename>`. Choose a fresh transfer ID for each upload using letters, numbers, and hyphens. Only one receiver can download a transfer.

To receive from another terminal instead:

```bash
curl --fail-with-body -JLO \
  https://transit-sh.quacksire.workers.dev/my-transfer/
```

## Development and Deployment

Use the **Deploy to Cloudflare Workers** button above, or deploy with Wrangler. You will need Node.js/npm and a Cloudflare account for deployment.

```bash
git clone https://github.com/quacksire/transit.sh.git
cd transit.sh
npm ci
npm run dev
```

Wrangler prints the local URL. To check types and deploy:

```bash
npm run check
npx wrangler login
npx wrangler deploy
```

`wrangler.toml` configures the `TRANSFERS` Durable Object binding, its SQLite-backed class migration, and the `ASSETS` binding. Worker-first routing ensures browser visits to transfer links reach the download handler rather than a static homepage fallback.

### Transfer regression test

With the local development server running:

```bash
TRANSIT_URL=http://localhost:8787 node tests/workers-e2e.mjs
```

Set `TRANSIT_URL` to your deployed URL to test a live instance. The test creates its own transfer, requests the original download page with browser navigation headers, and compares the downloaded bytes with a 2 MiB random payload.

## Original Python Backend

The original FastAPI/Redis implementation remains in `app.py`, `views/`, and `lib/` for self-hosting. It is separate from the Workers entry point in `worker/index.ts`. Its dependencies are listed in `pyproject.toml`; the Cloudflare deployment uses `package.json` and does not run the Python backend.

## Contributing

Issues and pull requests are welcome at [quacksire/transit.sh](https://github.com/quacksire/transit.sh). Please include reproduction steps and whether the issue affects the Workers or Python backend.

## License and Attribution

This fork retains the original project's [custom license](LICENSE) and attribution to Rémi Héneault. The license allows non-commercial use and forks under the same terms; commercial use is prohibited. See the license for the full terms.

Original project: [codeSamuraii/transit.sh](https://github.com/codeSamuraii/transit.sh), inspired by [transfer.sh](https://github.com/dutchcoders/transfer.sh) and [JustBeamIt](https://www.justbeamit.com/).
