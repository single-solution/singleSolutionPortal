import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["*"],
      credentials: true,
    },
  });

  (global as Record<string, unknown>).__io = io;

  io.on("connection", (socket) => {
    const userId = socket.handshake.auth?.userId as string | undefined;
    if (userId) socket.join(`user:${userId}`);

    socket.on("join-presence", () => {
      socket.join("presence");
    });
  });

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (Socket.IO enabled)`);
  });
});
