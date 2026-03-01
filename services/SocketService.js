const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

class SocketService {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socketId
    }

    init(server) {
        this.io = socketIo(server, {
            cors: {
                origin: function (origin, callback) {
                    if (!origin || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost:517')) {
                        return callback(null, true);
                    }
                    return callback(null, process.env.CLIENT_URL === origin);
                },
                methods: ['GET', 'POST']
            }
        });

        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Authentication error'));

            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) return next(new Error('Authentication error'));
                socket.userId = decoded.id;
                next();
            });
        });

        this.io.on('connection', (socket) => {
            console.log(`[Socket] User connected: ${socket.userId}`);
            this.connectedUsers.set(socket.userId, socket.id);

            // Join a room for their specific userId for targeted notifications
            socket.join(socket.userId);

            socket.on('disconnect', () => {
                console.log(`[Socket] User disconnected: ${socket.userId}`);
                this.connectedUsers.delete(socket.userId);
            });
        });
    }

    /**
     * Send notification to a specific user
     */
    sendToUser(userId, event, data) {
        if (this.io) {
            this.io.to(userId.toString()).emit(event, data);
        }
    }

    /**
     * Send notification to multiple users
     */
    sendToUsers(userIds, event, data) {
        if (this.io) {
            userIds.forEach(id => {
                this.io.to(id.toString()).emit(event, data);
            });
        }
    }

    /**
     * Broadcast to everyone
     */
    broadcast(event, data) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }
}

module.exports = new SocketService();
