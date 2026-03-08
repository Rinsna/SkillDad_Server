const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

class SocketService {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socketId
        this.redisAdapter = null;
    }

    init(server) {
        const socketOptions = {
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
            },
            // Connection pooling and performance settings
            pingTimeout: 60000, // 60 seconds
            pingInterval: 25000, // 25 seconds
            upgradeTimeout: 10000, // 10 seconds
            maxHttpBufferSize: 1e6, // 1MB
            transports: ['websocket', 'polling'],
            allowUpgrades: true
        };

        this.io = socketIo(server, socketOptions);

        // Configure Redis adapter for horizontal scaling if Redis is available
        this.setupRedisAdapter();

        // Authentication middleware
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

            // Handle connection errors
            socket.on('error', (error) => {
                console.error(`[Socket] Error for user ${socket.userId}:`, error);
            });
        });

        console.log('[Socket.IO] Socket.IO server initialized');
    }

    /**
     * Setup Redis adapter for horizontal scaling
     * Falls back to default adapter if Redis is not available
     */
    setupRedisAdapter() {
        try {
            // Only setup Redis adapter if REDIS_URL is configured
            if (process.env.REDIS_URL) {
                const { createAdapter } = require('@socket.io/redis-adapter');
                const { createClient } = require('redis');

                // Create Redis pub/sub clients
                const pubClient = createClient({ url: process.env.REDIS_URL });
                const subClient = pubClient.duplicate();

                // Handle Redis connection errors
                pubClient.on('error', (err) => {
                    console.error('[Socket.IO] Redis pub client error:', err.message);
                });

                subClient.on('error', (err) => {
                    console.error('[Socket.IO] Redis sub client error:', err.message);
                });

                // Connect clients and setup adapter
                Promise.all([pubClient.connect(), subClient.connect()])
                    .then(() => {
                        this.io.adapter(createAdapter(pubClient, subClient));
                        this.redisAdapter = { pubClient, subClient };
                        console.log('[Socket.IO] Redis adapter configured for horizontal scaling');
                    })
                    .catch((err) => {
                        console.error('[Socket.IO] Failed to setup Redis adapter:', err.message);
                        console.log('[Socket.IO] Using default in-memory adapter');
                    });
            } else {
                console.log('[Socket.IO] Redis not configured, using default in-memory adapter');
            }
        } catch (error) {
            console.error('[Socket.IO] Error setting up Redis adapter:', error.message);
            console.log('[Socket.IO] Using default in-memory adapter');
        }
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
                    discountRate: user.discountRate || 0,
                    createdAt: user.createdAt,
                    registeredBy: user.registeredBy, // Now including who registered this user
                    partnerCode: user.partnerCode     // Including partner code if any
                },
                timestamp: new Date()
            });
        }
    }

    /**
     * Get connection statistics
     */
    getStats() {
        if (!this.io) {
            return {
                connected: 0,
                rooms: 0,
                adapter: 'not initialized'
            };
        }

        return {
            connected: this.connectedUsers.size,
            rooms: this.io.sockets.adapter.rooms.size,
            adapter: this.redisAdapter ? 'redis' : 'memory',
            sockets: this.io.sockets.sockets.size
        };
    }

    /**
     * Cleanup and close connections
     */
    async cleanup() {
        console.log('[Socket.IO] Cleaning up connections...');

        if (this.io) {
            // Close all socket connections
            this.io.close();
            console.log('[Socket.IO] All socket connections closed');
        }

        // Close Redis connections if using Redis adapter
        if (this.redisAdapter) {
            try {
                await this.redisAdapter.pubClient.quit();
                await this.redisAdapter.subClient.quit();
                console.log('[Socket.IO] Redis adapter connections closed');
            } catch (error) {
                console.error('[Socket.IO] Error closing Redis connections:', error);
            }
        }

        this.connectedUsers.clear();
        console.log('[Socket.IO] Cleanup complete');
    }
}

module.exports = new SocketService();
