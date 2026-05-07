/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME || "0.0.0.0";

const app = next({
  dev: false,
  hostname: host,
  port,
});

const handle = app.getRequestHandler();
const prisma = new PrismaClient();

let signature = "";
async function emitRealtimeSnapshot(io) {
  const [ticketMax, taskMax, kpiMax] = await Promise.all([
    prisma.ticket.aggregate({ _max: { updatedAt: true } }),
    prisma.taskItem.aggregate({ _max: { updatedAt: true } }),
    prisma.kpiMaintenance.aggregate({ _max: { updatedAt: true } }),
  ]);
  const nextSig = [
    ticketMax._max.updatedAt?.toISOString() ?? "",
    taskMax._max.updatedAt?.toISOString() ?? "",
    kpiMax._max.updatedAt?.toISOString() ?? "",
  ].join("|");
  if (nextSig === signature) return;
  signature = nextSig;
  io.emit("lifecycle:update", {
    ticketUpdatedAt: ticketMax._max.updatedAt?.toISOString() ?? null,
    taskUpdatedAt: taskMax._max.updatedAt?.toISOString() ?? null,
    kpiUpdatedAt: kpiMax._max.updatedAt?.toISOString() ?? null,
    emittedAt: new Date().toISOString(),
  });
}

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      handle(req, res);
    });
    const io = new Server(server, {
      path: "/socket.io",
      cors: { origin: "*" },
    });
    io.on("connection", (socket) => {
      socket.emit("connected", { ok: true, at: new Date().toISOString() });
    });
    const timer = setInterval(() => {
      void emitRealtimeSnapshot(io);
    }, 3000);
    server.listen(port, host, () => {
      // Keep this log minimal: cPanel surfaces startup logs in app logs.
      console.log(`Ticket System listening on http://${host}:${port}`);
    });
    const shutdown = async () => {
      clearInterval(timer);
      await prisma.$disconnect();
      io.close();
      server.close(() => process.exit(0));
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((err) => {
    console.error("Failed to start Next.js server", err);
    process.exit(1);
  });
