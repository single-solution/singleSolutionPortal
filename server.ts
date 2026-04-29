import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { verifySocketSession, SOCKET_CORS_ORIGINS } from "./lib/socketAuth";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    cors: { origin: SOCKET_CORS_ORIGINS, credentials: true },
  });

  (global as Record<string, unknown>).__io = io;

  io.on("connection", async (socket) => {
    const userId = await verifySocketSession(socket.handshake.headers.cookie);
    if (!userId) { socket.disconnect(true); return; }
    socket.join(`user:${userId}`);

    socket.on("join-presence", () => {
      socket.join("presence");
    });
  });

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (Socket.IO enabled)`);
  });
});
