# Transit.sh

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/quacksire/transit.sh)

A Cloudflare Workers-compatible fork of Transit.sh. Stream files between clients without storing them on disk.

## Usage

Drop a file into the browser and share the generated link, or upload with curl:

```bash
curl --fail-with-body -T "./file.zip" https://your-worker.workers.dev/my-transfer/
```

Keep the sender connected. Open `/my-transfer/` in a browser and click **Download File**. Keep the trailing slash in the upload command and use a fresh transfer ID each time.

## Development

```bash
npm ci
npm run dev
```

## Deploy

```bash
npx wrangler deploy
```

## Under the hood

- Workers handles HTTP and WebSocket connections.
- Durable Objects coordinates each transfer and stores metadata.
- Static Assets serves the web interface.

File bytes pass through memory.

## License

[Original project](https://github.com/codeSamuraii/transit.sh) · [Custom license](LICENSE) · Non-commercial use
