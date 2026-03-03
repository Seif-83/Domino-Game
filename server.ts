import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = Number(process.env.PORT) || 3000;

// Game Rooms State
interface Room {
  id: string;
  players: { id: string; name: string; socketId: string }[];
  gameState: any;
}

const rooms = new Map<string, Room>();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, playerName }) => {
    let room = rooms.get(roomId);

    if (!room) {
      room = { id: roomId, players: [], gameState: null };
      rooms.set(roomId, room);
    }

    if (room.players.length >= 2) {
      socket.emit("error", "Room is full");
      return;
    }

    const player = { id: socket.id, name: playerName, socketId: socket.id };
    room.players.push(player);
    socket.join(roomId);

    console.log(`Player ${playerName} joined room ${roomId}`);

    io.to(roomId).emit("room-update", {
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      roomId
    });

    if (room.players.length === 2) {
      io.to(roomId).emit("start-game", {
        hostId: room.players[0].id
      });
    }
  });

  socket.on("game-move", ({ roomId, move }) => {
    socket.to(roomId).emit("opponent-move", move);
  });

  socket.on("sync-state", ({ roomId, state }) => {
    socket.to(roomId).emit("state-synced", state);
  });

  socket.on("chat-message", ({ roomId, message, sender }) => {
    io.to(roomId).emit("chat-message", { message, sender });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit("player-left");
          room.gameState = null;
        }
      }
    });
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
