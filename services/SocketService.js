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
                    // Allow requests with no origin (mobile apps, server-to-server)
                    if (!origin) {
                        return callback(null, true);
                    }
                    
                    // Allow Vercel deployments
                    if (origin.includes('.vercel.app')) {
                        return callback(null, true);
                    }
                    
                    // Allow localhost and 127.0.0.1 on any port
                    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') ||
                        origin.startsWith('https://localhost') || origin.startsWith('https://127.0.0.1')) {
                        return callback(null, true);
                    }
                    
                    // Allow configured CLIENT_URL
                    if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) {
                        return callback(null, true);
                    }
                    
                    // Log rejected origins for debugging
                    console.log('[Socket.IO] CORS rejected origin:', origin);
                    return callback(new Error('CORS not allowed'));
                },
                methods: ['GET', 'POST'],
                credentials: true,
                allowedHeaders: ['Content-Type', 'Authorization']
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

    /**
     * Broadcast to all admin users
     */
    broadcastToAdmins(event, data) {
        if (this.io) {
            // Emit to all connected sockets (admins will filter on client side)
            this.io.emit(event, data);
        }
    }

    /**
     * Notify admins of user list changes
     */
    notifyUserListUpdate(action, user) {
        if (this.io) {
            this.io.emit('userListUpdate', {
                action, // 'created', 'updated', 'deleted'
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isVerified: user.isVerified,
                    createdAt: user.createdAt
                },
                timestamp: new Date()
            });
        }
    }
}

module.exports = new SocketService();
