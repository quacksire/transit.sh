export interface Env {
  ASSETS: Fetcher;
  TRANSFERS: DurableObjectNamespace;
}

type Metadata = { name: string; size: number; type: string };

function validUid(uid: string) {
  return /^[A-Za-z0-9-]+$/.test(uid) && uid.length <= 128;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ status: "ok" });

    const sendMatch = url.pathname.match(/^\/send\/([^/]+)$/);
    if (sendMatch && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (!validUid(sendMatch[1])) return new Response("Invalid transfer ID", { status: 400 });
      return env.TRANSFERS.get(env.TRANSFERS.idFromName(sendMatch[1])).fetch(request);
    }

    const uploadMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)$/);
    if (request.method === "PUT" && uploadMatch && validUid(uploadMatch[1])) {
      return env.TRANSFERS.get(env.TRANSFERS.idFromName(uploadMatch[1])).fetch(request);
    }

    const uid = url.pathname.match(/^\/([^/]+)\/?$/)?.[1];
    if (request.method === "GET" && uid && validUid(uid)) {
      return env.TRANSFERS.get(env.TRANSFERS.idFromName(uid)).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export class Transfer implements DurableObject {
  private metadata?: Metadata;
  private sender?: WebSocket;
  private receiver?: ReadableStreamDefaultController<Uint8Array>;
  private receiverConnected = false;
  private complete = false;

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    state.blockConcurrencyWhile(async () => {
      this.metadata = await state.storage.get<Metadata>("metadata");
      this.complete = (await state.storage.get<boolean>("complete")) ?? false;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") return this.websocket(request);
    if (request.method === "PUT") return this.upload(request);
    if (request.method === "GET") return this.download(request);
    return new Response("Method not allowed", { status: 405 });
  }

  private async websocket(request: Request) {
    if (this.sender || this.metadata) return new Response("Transfer ID is already used.", { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.sender = server;
    server.accept();
    server.addEventListener("message", async (event) => {
      if (!this.metadata) {
        try {
          const value = JSON.parse(String(event.data));
          const name = String(value.file_name ?? value.name ?? "file").slice(0, 255);
          const size = Number(value.file_size ?? value.size);
          if (!name || !Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid file metadata");
          this.metadata = { name, size, type: String(value.file_type ?? value.type ?? "application/octet-stream") };
          await this.state.storage.put("metadata", this.metadata);
          return;
        } catch {
          server.send("Error: Invalid file metadata");
          server.close();
          return;
        }
      }
      if (this.receiverConnected && event.data instanceof ArrayBuffer) this.receiver?.enqueue(new Uint8Array(event.data));
    });
    server.addEventListener("close", () => this.receiver?.error(new Error("Sender disconnected")));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async upload(request: Request) {
    if (this.metadata || !request.body) return new Response("Transfer ID is already used.", { status: 409 });
    const name = decodeURIComponent(new URL(request.url).pathname.split("/").pop() || "file").slice(0, 255);
    const size = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(size) || size <= 0) return new Response("Content-Length is required", { status: 400 });
    this.metadata = { name, size, type: request.headers.get("content-type") || "application/octet-stream" };
    await this.state.storage.put("metadata", this.metadata);
    await this.waitForReceiver();
    return this.relay(request.body, new Response("Transfer complete."));
  }

  private async download(request: Request) {
    if (!this.metadata) return new Response("Transfer not found.", { status: 404 });
    const agent = request.headers.get("user-agent")?.toLowerCase() ?? "";
    const preview = /whatsapp|facebookexternalhit|twitterbot|slackbot-linkexpanding|discordbot|googlebot|bingbot|linkedinbot|pinterestbot|telegrambot/.test(agent);
    if (preview || (!new URL(request.url).searchParams.get("download") && !agent.includes("curl"))) {
      const templateUrl = new URL(`/templates/${preview ? "preview" : "download"}.html`, request.url);
      const template = await this.env.ASSETS.fetch(new Request(templateUrl));
      const values: Record<string, string> = {
        file_name: this.metadata.name,
        file_size: `${this.metadata.size.toLocaleString("en-US")} bytes`,
        file_type: this.metadata.type,
        "receiver_connected | tojson": String(this.receiverConnected),
      };
      const html = (await template.text()).replace(/{{\s*(.*?)\s*}}/g, (_, key: string) =>
        (values[key] ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!),
      );
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (this.receiverConnected) return new Response("A client is already downloading this file.", { status: 409 });
    this.receiverConnected = true;
    const stream = new ReadableStream<Uint8Array>({ start: controller => { this.receiver = controller; } });
    await this.state.storage.put("receiverConnected", true);
    this.sender?.send("Go for file chunks");
    return new Response(stream, { headers: { "content-type": this.metadata.type, "content-length": String(this.metadata.size), "content-disposition": `attachment; filename="${this.metadata.name.replace(/[\"\r\n]/g, "_")}"` } });
  }

  private async waitForReceiver() {
    const deadline = Date.now() + 300_000;
    while (!this.receiverConnected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
    if (!this.receiverConnected) throw new Error("Receiver did not connect in time");
  }

  private async relay(body: ReadableStream<Uint8Array>, response: Response) {
    const reader = body.getReader();
    let uploaded = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        uploaded += value.byteLength;
        if (this.receiver) this.receiver.enqueue(value);
        else this.sender?.send(value);
      }
      if (this.metadata && uploaded !== this.metadata.size) throw new Error("Received less data than expected");
      this.complete = true;
      await this.state.storage.put("complete", true);
      this.receiver?.close();
      this.sender?.close(1000, "Transfer complete");
      return response;
    } catch (error) {
      this.receiver?.error(error);
      return new Response(String(error), { status: 400 });
    }
  }
}
