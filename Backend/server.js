const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const bookRoutes = require("./routes/books");
const savedBookRoutes = require("./routes/savedBooks");
const LiveSession = require("./models/LiveSession");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/saved-books", savedBookRoutes);

const liveRooms = new Map();

app.get("/", (req, res) => {
    res.json({
        message: "ReadLive Backend is running successfully!"
    });
});

function isObjectId(value) {
    return (
        mongoose.Types.ObjectId.isValid(String(value || "")) &&
        String(new mongoose.Types.ObjectId(String(value))) === String(value)
    );
}

// =============================================
// CREATE LIVE SESSION — SAVE TO MONGODB
// =============================================

app.post("/api/live-sessions", async (req, res) => {
    try {
        const {
            title,
            book,
            bookId,
            description,
            host,
            hostId,
            scheduledDate,
            scheduledTime,
            maxParticipants
        } = req.body || {};

        if (!String(title || "").trim() || !String(host || "").trim()) {
            return res.status(400).json({
                message: "Title and host are required."
            });
        }

        const session = await LiveSession.create({
            title: String(title).trim(),
            book: String(book || "Book Discussion").trim(),
            bookId: bookId ? String(bookId) : null,
            description: String(description || "").trim(),
            host: String(host).trim(),
            hostId: hostId ? String(hostId) : null,
            status: "live",
            scheduledDate: scheduledDate || "",
            scheduledTime: scheduledTime || "",
            participants: 0,
            maxParticipants: Math.max(
                1,
                Math.min(100, Number(maxParticipants) || 10)
            ),
            startedAt: new Date(),
            endedAt: null
        });

        console.log(
            "Live session created:",
            session._id.toString(),
            session.title
        );

        // Notify connected clients.
        io.emit("live-session-created", session);

        return res.status(201).json({
            message: "Live session created successfully.",
            session
        });

    } catch (error) {
        console.error("Create live session error:", error);

        return res.status(500).json({
            message: "Failed to create live session.",
            error: error.message
        });
    }
});

// =============================================
// GET ALL ACTIVE AND UPCOMING SESSIONS
// =============================================

app.get("/api/live-sessions", async (req, res) => {
    try {
        const sessions = await LiveSession.find({
            status: { $in: ["live", "upcoming"] }
        })
            .sort({ createdAt: -1 })
            .lean();

        return res.json(sessions);

    } catch (error) {
        console.error("Get live sessions error:", error);

        return res.status(500).json({
            message: "Failed to load live sessions.",
            error: error.message
        });
    }
});

// =============================================
// GET ONE LIVE SESSION
// =============================================

app.get("/api/live-sessions/:id", async (req, res) => {
    try {
        if (!isObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid live session ID."
            });
        }

        const session = await LiveSession.findById(req.params.id);

        if (!session) {
            return res.status(404).json({
                message: "Live session not found."
            });
        }

        return res.json(session);

    } catch (error) {
        console.error("Get single session error:", error);

        return res.status(500).json({
            message: "Failed to load live session.",
            error: error.message
        });
    }
});

// =============================================
// END LIVE SESSION
// =============================================

app.put("/api/live-sessions/:id/end", async (req, res) => {
    try {
        if (!isObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid live session ID."
            });
        }

        const session = await LiveSession.findByIdAndUpdate(
            req.params.id,
            {
                status: "ended",
                endedAt: new Date(),
                participants: 0
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!session) {
            return res.status(404).json({
                message: "Live session not found."
            });
        }

        const room = `live-session-${session._id}`;

        io.to(room).emit("session-ended", {
            sessionId: String(session._id)
        });

        liveRooms.delete(String(session._id));

        io.emit("live-session-ended", {
            sessionId: String(session._id)
        });

        console.log("Live session ended:", session._id.toString());

        return res.json({
            message: "Live session ended successfully.",
            session
        });

    } catch (error) {
        console.error("End live session error:", error);

        return res.status(500).json({
            message: "Failed to end live session.",
            error: error.message
        });
    }
});

// =============================================
// UPDATE PARTICIPANT COUNT
// =============================================

async function updateParticipantCount(sessionId, count) {
    if (!isObjectId(sessionId)) return;

    try {
        await LiveSession.findByIdAndUpdate(
            sessionId,
            { participants: count }
        );
    } catch (error) {
        console.error(
            "Participant count update error:",
            error.message
        );
    }
}

// =============================================
// REMOVE USER FROM ROOM
// =============================================

async function removeUserFromRoom(socket) {
    const sessionId = socket.liveSessionId;

    if (!sessionId) return;

    const cleanId = String(sessionId);
    const room = `live-session-${cleanId}`;
    const users = liveRooms.get(cleanId);

    if (users) {
        users.delete(socket.id);

        socket.to(room).emit("user-left", {
            socketId: socket.id,
            username: socket.username || "User"
        });

        io.to(room).emit("participant-count", users.size);

        await updateParticipantCount(cleanId, users.size);

        if (users.size === 0) {
            liveRooms.delete(cleanId);
        }
    }

    socket.leave(room);
    socket.liveSessionId = null;
}

// =============================================
// SOCKET.IO CONNECTION
// =============================================

io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Join a database session or an existing temporary Reader room.
    socket.on("join-live-session", async (data = {}) => {
        try {
            const cleanId = String(data.sessionId || "").trim();

            if (!cleanId) {
                return socket.emit("live-session-error", {
                    message: "No session ID provided."
                });
            }

            const databaseSession = isObjectId(cleanId);

            if (databaseSession) {
                const session = await LiveSession.findById(cleanId);

                if (!session || session.status !== "live") {
                    return socket.emit("live-session-error", {
                        message: "This live session is not available."
                    });
                }
            }

            if (
                socket.liveSessionId &&
                socket.liveSessionId !== cleanId
            ) {
                await removeUserFromRoom(socket);
            }

            const room = `live-session-${cleanId}`;

            if (!liveRooms.has(cleanId)) {
                liveRooms.set(cleanId, new Map());
            }

            const users = liveRooms.get(cleanId);
            const username = String(data.username || "User").slice(0, 80);

            let maxParticipants = 50;

            if (databaseSession) {
                const session = await LiveSession.findById(cleanId);
                maxParticipants = Math.max(
                    1,
                    Number(session?.maxParticipants) || 10
                );
            }

            if (
                !users.has(socket.id) &&
                users.size >= maxParticipants
            ) {
                return socket.emit("live-session-full", {
                    message: "This live session is full."
                });
            }

            socket.join(room);
            socket.liveSessionId = cleanId;
            socket.username = username;

            users.set(socket.id, {
                socketId: socket.id,
                username
            });

            await updateParticipantCount(cleanId, users.size);

            socket.emit(
                "existing-users",
                Array.from(users.values()).filter(
                    user => user.socketId !== socket.id
                )
            );

            socket.to(room).emit("user-joined", {
                socketId: socket.id,
                username
            });

            io.to(room).emit("participant-count", users.size);

            console.log(`${username} joined session ${cleanId}`);

        } catch (error) {
            console.error("Join room error:", error);

            socket.emit("live-session-error", {
                message: "Could not join this live session."
            });
        }
    });

    // WebRTC offer.
    socket.on("webrtc-offer", data => {
        if (data?.target && data?.offer) {
            io.to(data.target).emit("webrtc-offer", {
                offer: data.offer,
                sender: socket.id,
                username: socket.username || "User"
            });
        }
    });

    // WebRTC answer.
    socket.on("webrtc-answer", data => {
        if (data?.target && data?.answer) {
            io.to(data.target).emit("webrtc-answer", {
                answer: data.answer,
                sender: socket.id
            });
        }
    });

    // WebRTC ICE candidate.
    socket.on("ice-candidate", data => {
        if (data?.target && data?.candidate) {
            io.to(data.target).emit("ice-candidate", {
                candidate: data.candidate,
                sender: socket.id
            });
        }
    });

    // Live chat.
    socket.on("chat-message", data => {
        if (!socket.liveSessionId) return;

        const message = String(data?.message || "")
            .trim()
            .slice(0, 500);

        if (!message) return;

        io.to(`live-session-${socket.liveSessionId}`).emit(
            "chat-message",
            {
                username: socket.username || "User",
                message,
                timestamp: new Date().toISOString()
            }
        );
    });

    // Reactions.
    socket.on("reaction", data => {
        if (!socket.liveSessionId) return;

        io.to(`live-session-${socket.liveSessionId}`).emit(
            "reaction",
            {
                username: socket.username || "User",
                reaction: String(data?.reaction || "❤️").slice(0, 12)
            }
        );
    });

    socket.on("leave-live-session", async () => {
        await removeUserFromRoom(socket);
    });

    socket.on("disconnect", async () => {
        console.log("Socket disconnected:", socket.id);
        await removeUserFromRoom(socket);
    });
});

// =============================================
// CONNECT TO MONGODB AND START SERVER
// =============================================

const PORT = Number(process.env.PORT) || 5000;

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("Connected to MongoDB Atlas successfully!");

        server.listen(PORT, () => {
            console.log(`ReadLive server running on port ${PORT}`);
            console.log("Socket.IO is ready");
        });
    })
    .catch(error => {
        console.error(
            "MongoDB connection error:",
            error.message
        );
    });