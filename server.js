/**
 * ═══════════════════════════════════════════════════════════════════
 * PRMessenger - Real-time Chat Server
 * Version: 6.1
 * Node.js + Express + Socket.IO
 * Features: Real-time messaging, File uploads, Voice messages,
 *           Room management, Reactions, Typing indicators
 * ═══════════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════════════
// DEPENDENCIES
// ═════════════════════════════════════════════════════════════════════

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// ═════════════════════════════════════════════════════════════════════
// SERVER INITIALIZATION
// ═════════════════════════════════════════════════════════════════════

const app = express();
const server = http.createServer(app);

// Socket.IO configuration with CORS
const io = socketIo(server, {
    cors: {
        origin: [
            "https://prmessenger.app",
            "https://www.prmessenger.app",
            "http://localhost:3000"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,      // 60 seconds before considering connection dead
    pingInterval: 25000,     // Send ping every 25 seconds
    upgradeTimeout: 30000    // 30 seconds to upgrade transport
});

// ═════════════════════════════════════════════════════════════════════
// MIDDLEWARE CONFIGURATION
// ═════════════════════════════════════════════════════════════════════

// Enable CORS for all routes
app.use(cors({
    origin: [
        "https://prmessenger.app",
        "https://www.prmessenger.app",
        "http://localhost:3000"
    ],
    credentials: true
}));

// Serve static files with caching
app.use(express.static('.', { maxAge: '1d' }));

// Parse JSON and URL-encoded bodies (up to 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ═════════════════════════════════════════════════════════════════════
// FILE UPLOAD CONFIGURATION
// ═════════════════════════════════════════════════════════════════════

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads', { recursive: true });
    console.log('✅ Uploads directory created');
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        const basename = path.basename(file.originalname, extension);
        cb(null, `${basename}-${uniqueSuffix}${extension}`);
    }
});

// Configure multer with limits and filters
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 25 * 1024 * 1024,  // 25MB max file size
        files: 5                      // Max 5 files at once
    },
    fileFilter: (req, file, cb) => {
        // Accept all file types
        cb(null, true);
    }
});

// Serve uploaded files with CORS headers and caching
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    next();
}, express.static('uploads'));

// ═════════════════════════════════════════════════════════════════════
// DATA STORAGE (In-Memory)
// ═════════════════════════════════════════════════════════════════════

const rooms = new Map();           // Store all active rooms
const roomTimeouts = new Map();    // Store cleanup timeouts for empty rooms
const userSessions = new Map();    // Store user session data (socketId -> session)
const usernameToSocket = new Map(); // Track username -> socketId mapping per room
const roomFiles = new Map();       // Track uploaded files per room (roomCode -> [filenames])

// ═════════════════════════════════════════════════════════════════════
// ROOM CLEANUP CONFIGURATION
// ═════════════════════════════════════════════════════════════════════

const CLEANUP_DELAY = 30 * 1000;   // 30 seconds before cleanup (was 30 minutes)
const CLEANUP_CHECK_INTERVAL = 30 * 1000; // Check room state every 30 seconds

// Start periodic cleanup checker
setInterval(() => {
    checkEmptyRoomsForCleanup();
}, CLEANUP_CHECK_INTERVAL);

// ═════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════

/**
 * Remove old connections for a user in a room
 * @param {string} roomCode - Room code
 * @param {string} username - Username to check
 * @param {string} currentSocketId - Current socket ID to keep
 */
function removeOldUserConnections(roomCode, username, currentSocketId) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const socketsToRemove = [];
    
    // Find all old socket IDs for this username
    for (const [socketId, user] of room.users.entries()) {
        if (user.username === username && socketId !== currentSocketId) {
            socketsToRemove.push(socketId);
        }
    }
    
    // Remove old connections
    for (const socketId of socketsToRemove) {
        room.users.delete(socketId);
        userSessions.delete(socketId);
        console.log(`🧹 Removed old connection ${socketId} for ${username} in room ${roomCode}`);
    }
}

/**
 * Generate a random 6-character room code
 * @returns {string} - Room code (e.g., "ABC123")
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Get formatted participants array for a room
 * @param {string} roomCode - Room code
 * @returns {Array} - Array of participant objects
 */
function getRoomParticipants(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.users) return [];
    
    // Use a Map to deduplicate by username (keep only the latest connection)
    const uniqueUsers = new Map();
    
    for (const [socketId, user] of room.users.entries()) {
        const existing = uniqueUsers.get(user.username);
        // Keep the most recent connection or the one that's admin
        if (!existing || existing.joinedAt < user.joinedAt || user.isAdmin) {
            uniqueUsers.set(user.username, {
                userId: socketId,
                username: user.username,
                isAdmin: user.isAdmin,
                online: user.isOnline !== false,
                joinedAt: user.joinedAt
            });
        }
    }
    
    return Array.from(uniqueUsers.values());
}

/**
 * Get participant count for a room
 * @param {string} roomCode - Room code
 * @returns {number} - Number of unique participants
 */
function getParticipantCount(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.users) return 0;
    
    // Count unique usernames
    const uniqueUsernames = new Set();
    for (const user of room.users.values()) {
        uniqueUsernames.add(user.username);
    }
    return uniqueUsernames.size;
}

/**
 * Track a file upload for a room
 * @param {string} roomCode - Room code
 * @param {string} filename - Uploaded filename
 */
function trackRoomFile(roomCode, filename) {
    if (!roomFiles.has(roomCode)) {
        roomFiles.set(roomCode, []);
    }
    roomFiles.get(roomCode).push(filename);
    console.log(`📁 Tracking file ${filename} for room ${roomCode}`);
}

/**
 * Delete all files associated with a room
 * @param {string} roomCode - Room code
 */
function deleteRoomFiles(roomCode) {
    const files = roomFiles.get(roomCode) || [];
    let deletedCount = 0;
    
    for (const filename of files) {
        const filePath = path.join('./uploads', filename);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deletedCount++;
                console.log(`🗑️  Deleted file: ${filename}`);
            }
        } catch (error) {
            console.error(`❌ Error deleting file ${filename}:`, error.message);
        }
    }
    
    roomFiles.delete(roomCode);
    console.log(`🧹 Deleted ${deletedCount} files for room ${roomCode}`);
    return deletedCount;
}

/**
 * Full cleanup of a room (chat history + files)
 * @param {string} roomCode - Room code to clean up
 */
function performFullRoomCleanup(roomCode) {
    const room = rooms.get(roomCode);
    const messageCount = room ? room.messages.length : 0;
    
    // Delete all uploaded files for this room
    const filesDeleted = deleteRoomFiles(roomCode);
    
    // Clear chat history from memory
    if (room) {
        room.messages = [];
    }
    
    // Delete room from memory
    rooms.delete(roomCode);
    
    // Clear any pending timeouts
    if (roomTimeouts.has(roomCode)) {
        clearTimeout(roomTimeouts.get(roomCode));
        roomTimeouts.delete(roomCode);
    }
    
    console.log(`🧹 FULL CLEANUP: Room ${roomCode} - ${messageCount} messages cleared, ${filesDeleted} files deleted`);
}

/**
 * Check all rooms and cleanup empty ones
 */
function checkEmptyRoomsForCleanup() {
    const now = Date.now();
    
    for (const [roomCode, room] of rooms.entries()) {
        if (room.users.size === 0) {
            // Check if room has been empty long enough
            if (room.emptyTimestamp && (now - room.emptyTimestamp) >= CLEANUP_DELAY) {
                console.log(`⏰ Auto-cleanup triggered for empty room ${roomCode}`);
                performFullRoomCleanup(roomCode);
            } else if (!room.emptyTimestamp) {
                // Mark room as empty with timestamp
                room.emptyTimestamp = now;
                console.log(`👀 Room ${roomCode} marked empty, cleanup scheduled in ${CLEANUP_DELAY/1000}s`);
            }
        } else {
            // Room has users, clear empty timestamp
            room.emptyTimestamp = null;
        }
    }
}

/**
 * Schedule automatic cleanup of empty rooms
 * @param {string} roomCode - Room code to clean up
 */
function scheduleRoomCleanup(roomCode) {
    // Clear existing timeout if any
    if (roomTimeouts.has(roomCode)) {
        clearTimeout(roomTimeouts.get(roomCode));
    }
    
    const room = rooms.get(roomCode);
    if (room) {
        room.emptyTimestamp = Date.now();
    }
    
    // Schedule cleanup after CLEANUP_DELAY
    const timeout = setTimeout(() => {
        const room = rooms.get(roomCode);
        if (room && room.users.size === 0) {
            performFullRoomCleanup(roomCode);
        }
    }, CLEANUP_DELAY);
    
    roomTimeouts.set(roomCode, timeout);
    console.log(`⏱️  Room ${roomCode} cleanup scheduled in ${CLEANUP_DELAY/1000}s`);
}

/**
 * Remove old connections for a user in a room
 * @param {string} roomCode - Room code
 * @param {string} username - Username to check
 * @param {string} currentSocketId - Current socket ID to keep
 */
function removeOldUserConnections(roomCode, username, currentSocketId) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const socketsToRemove = [];
    
    // Find all old socket IDs for this username
    for (const [socketId, user] of room.users.entries()) {
        if (user.username === username && socketId !== currentSocketId) {
            socketsToRemove.push(socketId);
        }
    }
    
    // Remove old connections
    for (const socketId of socketsToRemove) {
        room.users.delete(socketId);
        userSessions.delete(socketId);
        console.log(`🧹 Removed old connection ${socketId} for ${username} in room ${roomCode}`);
    }
}

/**
 * Handle user disconnection and cleanup
 * @param {string} socketId - Socket ID of disconnected user
 */
function handleUserDisconnection(socketId) {
    const session = userSessions.get(socketId);
    
    if (session && session.roomCode) {
        const room = rooms.get(session.roomCode);
        
        if (room && room.users.has(socketId)) {
            const user = room.users.get(socketId);
            room.users.delete(socketId);
            
            const participants = getRoomParticipants(session.roomCode);
            
            // Notify other users
            io.to(session.roomCode).emit('user-left', {
                userId: socketId,
                username: user.username,
                participantCount: participants.length,
                participants: participants
            });
            
            // Handle admin transfer if disconnected user was admin
            if (user.isAdmin && room.users.size > 0) {
                const newAdminEntry = Array.from(room.users.entries())[0];
                const newAdminId = newAdminEntry[0];
                const newAdmin = newAdminEntry[1];
                
                newAdmin.isAdmin = true;
                room.admin = newAdminId;
                room.adminName = newAdmin.username;
                
                const updatedParticipants = getRoomParticipants(session.roomCode);
                
                // Notify all users of admin change
                io.to(session.roomCode).emit('admin-changed', {
                    newAdminId: newAdminId,
                    newAdminName: newAdmin.username
                });
                
                // Update participants list
                io.to(session.roomCode).emit('participants-update', {
                    participantCount: updatedParticipants.length,
                    participants: updatedParticipants
                });
            }
            
            // Schedule cleanup if room is now empty
            if (room.users.size === 0) {
                scheduleRoomCleanup(session.roomCode);
            }
            
            console.log(`👋 ${user.username} disconnected from room ${session.roomCode}`);
        }
    }
    
    userSessions.delete(socketId);
}

// ═════════════════════════════════════════════════════════════════════
// FILE UPLOAD ENDPOINTS
// ═════════════════════════════════════════════════════════════════════

/**
 * Handle file uploads
 * POST /upload
 */
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const fileData = {
            id: Date.now(),
            name: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            url: `/uploads/${req.file.filename}`,
            type: req.file.mimetype,
            uploadedAt: new Date()
        };

        const { roomCode, userId, username } = req.body;
        
        // Track file for room cleanup
        if (roomCode) {
            trackRoomFile(roomCode, req.file.filename);
        }
        
        // Broadcast file message to room if room data provided
        if (roomCode && userId && username) {
            const room = rooms.get(roomCode);
            if (room) {
                const message = {
                    id: Date.now() + Math.random(),
                    userId: userId,
                    username: username,
                    message: JSON.stringify(fileData),
                    type: 'file',
                    timestamp: new Date(),
                    reactions: {}
                };
                
                room.messages.push(message);
                io.to(roomCode).emit('message', message);
                console.log(`📎 File uploaded: ${fileData.name} in room ${roomCode}`);
            }
        }

        res.json({ success: true, file: fileData });
    } catch (error) {
        console.error('❌ File upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

/**
 * Handle voice message uploads
 * POST /upload-voice
 */
app.post('/upload-voice', upload.single('voice'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No voice file uploaded' });
    }

    try {
        const voiceData = {
            id: Date.now(),
            filename: req.file.filename,
            url: `/uploads/${req.file.filename}`,
            uploadedAt: new Date()
        };

        const { roomCode, userId, username } = req.body;
        
        // Track voice file for room cleanup
        if (roomCode) {
            trackRoomFile(roomCode, req.file.filename);
        }

        // Broadcast voice message to room if room data provided
        if (roomCode && userId && username) {
            const room = rooms.get(roomCode);
            if (room) {
                const message = {
                    id: Date.now() + Math.random(),
                    userId: userId,
                    username: username,
                    message: 'Voice message',
                    type: 'voice',
                    audioUrl: voiceData.url,
                    timestamp: new Date(),
                    reactions: {}
                };
                
                room.messages.push(message);
                io.to(roomCode).emit('message', message);
                console.log(`🎤 Voice message uploaded in room ${roomCode}`);
            }
        }

        res.json({ success: true, voice: voiceData });
    } catch (error) {
        console.error('❌ Voice upload error:', error);
        res.status(500).json({ error: 'Voice upload failed' });
    }
});

// ═════════════════════════════════════════════════════════════════════
// MAIN ROUTE
// ═════════════════════════════════════════════════════════════════════

/**
 * Serve index.html for all routes (SPA support)
 */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ═════════════════════════════════════════════════════════════════════
// SOCKET.IO EVENT HANDLERS
// ═════════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // ─────────────────────────────────────────────────────────────────
    // HEARTBEAT
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('ping', () => {
        socket.emit('pong');
    });

    // ─────────────────────────────────────────────────────────────────
    // CREATE ROOM
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('create-room', (data) => {
        try {
            // Generate unique room code
            let roomCode;
            do {
                roomCode = generateRoomCode();
            } while (rooms.has(roomCode));

            // Create new room
            const room = {
                code: roomCode,
                admin: socket.id,
                adminName: data.username,
                users: new Map(),
                messages: [],
                createdAt: new Date()
            };
            
            // Add creator as first user
            room.users.set(socket.id, {
                id: socket.id,
                username: data.username,
                isAdmin: true,
                joinedAt: new Date(),
                isOnline: true
            });
            
            rooms.set(roomCode, room);
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.username = data.username;
            
            // Store user session
            userSessions.set(socket.id, {
                roomCode: roomCode,
                username: data.username,
                lastSeen: new Date()
            });
            
            // Track username to socket mapping
            const roomUserKey = `${roomCode}:${data.username}`;
            usernameToSocket.set(roomUserKey, socket.id);
            
            const participants = getRoomParticipants(roomCode);
            
            // Send room details to creator
            socket.emit('room-created', {
                roomCode: roomCode,
                username: data.username,
                isAdmin: true,
                adminName: data.username,
                participantCount: participants.length,
                participants: participants,
                messages: []
            });

            console.log(`🏠 Room ${roomCode} created by ${data.username}`);
        } catch (error) {
            console.error('❌ Error creating room:', error);
            socket.emit('room-error', { message: 'Failed to create room' });
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // JOIN ROOM
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('join-room', (data) => {
        try {
            const { roomCode, username } = data;
            const room = rooms.get(roomCode);
            
            // Check if room exists
            if (!room) {
                socket.emit('room-error', { message: 'Room not found' });
                return;
            }

            // Cancel cleanup timeout if room was scheduled for deletion
            if (roomTimeouts.has(roomCode)) {
                clearTimeout(roomTimeouts.get(roomCode));
                roomTimeouts.delete(roomCode);
            }
            
            // Remove any old connections for this username
            removeOldUserConnections(roomCode, username, socket.id);
            
            // Add user to room
            room.users.set(socket.id, {
                id: socket.id,
                username: username,
                isAdmin: false,
                joinedAt: new Date(),
                isOnline: true
            });
            
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.username = username;
            
            // Store user session
            userSessions.set(socket.id, {
                roomCode: roomCode,
                username: username,
                lastSeen: new Date()
            });
            
            // Track username to socket mapping
            const roomUserKey = `${roomCode}:${username}`;
            usernameToSocket.set(roomUserKey, socket.id);
            
            const participants = getRoomParticipants(roomCode);
            
            // Notify existing users about new user
            socket.to(roomCode).emit('user-joined', {
                userId: socket.id,
                username: username,
                participantCount: participants.length,
                participants: participants
            });
            
            // Send room data to joining user
            socket.emit('room-joined', {
                roomCode: roomCode,
                username: username,
                isAdmin: false,
                adminName: room.adminName,
                participantCount: participants.length,
                participants: participants,
                messages: room.messages
            });

            console.log(`✅ ${username} joined room ${roomCode}`);
        } catch (error) {
            console.error('❌ Error joining room:', error);
            socket.emit('room-error', { message: 'Failed to join room' });
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // REJOIN ROOM (Auto-reconnect)
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('rejoin-room', (data) => {
        try {
            const { roomCode, username } = data;
            const room = rooms.get(roomCode);
            
            if (!room) {
                socket.emit('room-error', { message: 'Room not found' });
                return;
            }

            // Cancel cleanup timeout
            if (roomTimeouts.has(roomCode)) {
                clearTimeout(roomTimeouts.get(roomCode));
                roomTimeouts.delete(roomCode);
            }
            
            // Remove any old connections for this username
            removeOldUserConnections(roomCode, username, socket.id);
            
            const wasAdmin = room.admin === socket.id;
            
            // Re-add user to room
            room.users.set(socket.id, {
                id: socket.id,
                username: username,
                isAdmin: wasAdmin,
                joinedAt: new Date(),
                isOnline: true
            });
            
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.username = username;
            
            userSessions.set(socket.id, {
                roomCode: roomCode,
                username: username,
                lastSeen: new Date()
            });
            
            // Track username to socket mapping
            const roomUserKey = `${roomCode}:${username}`;
            usernameToSocket.set(roomUserKey, socket.id);
            
            const participants = getRoomParticipants(roomCode);
            
            // Send room data to rejoining user
            socket.emit('room-rejoined', {
                roomCode: roomCode,
                username: username,
                isAdmin: wasAdmin,
                adminName: room.adminName,
                participantCount: participants.length,
                participants: participants,
                messages: room.messages
            });
            
            // Notify others about participant update
            socket.to(roomCode).emit('participants-update', {
                participantCount: participants.length,
                participants: participants
            });

            console.log(`🔄 ${username} rejoined room ${roomCode}`);
        } catch (error) {
            console.error('❌ Error rejoining room:', error);
            socket.emit('room-error', { message: 'Failed to rejoin room' });
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // SEND MESSAGE
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('send-message', (data) => {
        try {
            const { roomCode, message, type, replyTo } = data;
            const room = rooms.get(roomCode);
            
            if (!room || !room.users.has(socket.id)) return;
            
            const user = room.users.get(socket.id);
            const messageData = {
                id: Date.now() + Math.random(),
                userId: socket.id,
                username: user.username,
                message: message,
                type: type || 'text',
                timestamp: new Date(),
                replyTo: replyTo || null,
                reactions: {}
            };
            
            // Store message in room
            room.messages.push(messageData);
            
            // Broadcast to all users in room
            io.to(roomCode).emit('message', messageData);

            console.log(`💬 Message in room ${roomCode} from ${user.username}`);
        } catch (error) {
            console.error('❌ Error sending message:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // EDIT MESSAGE
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('edit-message', (data) => {
        try {
            const { roomCode, messageId, newMessage } = data;
            const room = rooms.get(roomCode);
            
            if (!room || !room.users.has(socket.id)) return;
            
            // Find message by ID and verify ownership
            const messageIndex = room.messages.findIndex(msg => 
                msg.id == messageId && msg.userId === socket.id
            );
            
            if (messageIndex !== -1) {
                room.messages[messageIndex].message = newMessage;
                room.messages[messageIndex].edited = true;
                room.messages[messageIndex].editedAt = new Date();
                
                // Broadcast edit to all users
                io.to(roomCode).emit('message-edited', {
                    messageId: messageId,
                    newMessage: newMessage,
                    editedAt: room.messages[messageIndex].editedAt
                });
                
                console.log(`✏️ Message edited in room ${roomCode}`);
            }
        } catch (error) {
            console.error('❌ Error editing message:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // DELETE MESSAGE
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('delete-message', (data) => {
        try {
            const { roomCode, messageId } = data;
            const room = rooms.get(roomCode);
            
            if (!room || !room.users.has(socket.id)) return;
            
            // Find message by ID and verify ownership
            const messageIndex = room.messages.findIndex(msg => 
                msg.id == messageId && msg.userId === socket.id
            );
            
            if (messageIndex !== -1) {
                room.messages.splice(messageIndex, 1);
                
                // Broadcast deletion to all users
                io.to(roomCode).emit('message-deleted', { messageId: messageId });
                
                console.log(`🗑️ Message deleted in room ${roomCode}`);
            }
        } catch (error) {
            console.error('❌ Error deleting message:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // TOGGLE REACTION
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('toggle-reaction', (data) => {
        try {
            const { roomCode, messageId, emoji } = data;
            const room = rooms.get(roomCode);
            
            if (!room || !room.users.has(socket.id)) return;
            
            const messageIndex = room.messages.findIndex(msg => msg.id == messageId);
            
            if (messageIndex !== -1) {
                const message = room.messages[messageIndex];
                if (!message.reactions) message.reactions = {};
                if (!message.reactions[emoji]) message.reactions[emoji] = [];
                
                const userIndex = message.reactions[emoji].indexOf(socket.id);
                
                // Toggle reaction: add if not present, remove if present
                if (userIndex > -1) {
                    message.reactions[emoji].splice(userIndex, 1);
                    if (message.reactions[emoji].length === 0) {
                        delete message.reactions[emoji];
                    }
                } else {
                    message.reactions[emoji].push(socket.id);
                }
                
                // Broadcast reaction update
                io.to(roomCode).emit('reaction-added', {
                    messageId: messageId,
                    reactions: message.reactions
                });
            }
        } catch (error) {
            console.error('❌ Error toggling reaction:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // TYPING INDICATORS
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('typing-start', (data) => {
        try {
            const room = rooms.get(data.roomCode);
            if (!room || !room.users.has(socket.id)) return;
            
            const user = room.users.get(socket.id);
            
            // Notify others that user is typing
            socket.to(data.roomCode).emit('typing-start', {
                userId: socket.id,
                username: user.username
            });
        } catch (error) {
            console.error('❌ Error handling typing start:', error);
        }
    });

    socket.on('typing-stop', (data) => {
        try {
            const room = rooms.get(data.roomCode);
            if (!room || !room.users.has(socket.id)) return;
            
            // Notify others that user stopped typing
            socket.to(data.roomCode).emit('typing-stop', {
                userId: socket.id
            });
        } catch (error) {
            console.error('❌ Error handling typing stop:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // LEAVE ROOM
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('leave-room', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms.get(roomCode);
            
            if (!room || !room.users.has(socket.id)) return;
            
            const user = room.users.get(socket.id);
            room.users.delete(socket.id);
            socket.leave(roomCode);
            userSessions.delete(socket.id);
            
            const participants = getRoomParticipants(roomCode);
            
            // Notify others that user left
            socket.to(roomCode).emit('user-left', {
                userId: socket.id,
                username: user.username,
                participantCount: participants.length,
                participants: participants
            });
            
            // Handle admin transfer if leaving user was admin
            if (user.isAdmin && room.users.size > 0) {
                const newAdminEntry = Array.from(room.users.entries())[0];
                const newAdminId = newAdminEntry[0];
                const newAdmin = newAdminEntry[1];
                
                newAdmin.isAdmin = true;
                room.admin = newAdminId;
                room.adminName = newAdmin.username;
                
                const updatedParticipants = getRoomParticipants(roomCode);
                
                // Notify about admin change
                io.to(roomCode).emit('admin-changed', {
                    newAdminId: newAdminId,
                    newAdminName: newAdmin.username
                });
                
                // Update participants list
                io.to(roomCode).emit('participants-update', {
                    participantCount: updatedParticipants.length,
                    participants: updatedParticipants
                });
            }
            
            // Schedule cleanup if room is empty
            if (room.users.size === 0) {
                scheduleRoomCleanup(roomCode);
            }

            console.log(`👋 ${user.username} left room ${roomCode}`);
        } catch (error) {
            console.error('❌ Error leaving room:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // CLOSE ROOM (Admin only)
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('close-room', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms.get(roomCode);
            
            // Verify admin privileges
            if (!room || room.admin !== socket.id) return;
            
            // Notify all users that room is closing
            io.to(roomCode).emit('room-closed');
            
            // Remove all users from room
            const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);
            if (socketsInRoom) {
                socketsInRoom.forEach(socketId => {
                    const userSocket = io.sockets.sockets.get(socketId);
                    if (userSocket) {
                        userSocket.leave(roomCode);
                        userSocket.roomCode = null;
                        userSessions.delete(socketId);
                    }
                });
            }
            
            // Perform full cleanup (delete files + chat history)
            performFullRoomCleanup(roomCode);

            console.log(`🚪 Room ${roomCode} closed by admin with full cleanup`);
        } catch (error) {
            console.error('❌ Error closing room:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // VIDEO CALL SIGNALING
    // ─────────────────────────────────────────────────────────────────
    
    /**
     * Request a video call with another user
     */
    socket.on('video-call-request', (data) => {
        try {
            const { targetUserId, roomCode } = data;
            const room = rooms.get(roomCode);
            if (!room) return;
            
            const caller = room.users.get(socket.id);
            if (!caller) return;
            
            console.log(`📹 Video call request: ${caller.username} -> ${targetUserId}`);
            
            // Send call request to target user
            io.to(targetUserId).emit('video-call-incoming', {
                callerId: socket.id,
                callerName: caller.username,
                roomCode: roomCode
            });
        } catch (error) {
            console.error('❌ Error in video-call-request:', error);
        }
    });
    
    /**
     * Accept a video call
     */
    socket.on('video-call-accept', (data) => {
        try {
            const { callerId, roomCode } = data;
            const room = rooms.get(roomCode);
            if (!room) return;
            
            const accepter = room.users.get(socket.id);
            if (!accepter) return;
            
            console.log(`📹 Video call accepted by ${accepter.username}`);
            
            // Notify caller that call was accepted
            io.to(callerId).emit('video-call-accepted', {
                accepterId: socket.id,
                accepterName: accepter.username
            });
        } catch (error) {
            console.error('❌ Error in video-call-accept:', error);
        }
    });
    
    /**
     * Reject a video call
     */
    socket.on('video-call-reject', (data) => {
        try {
            const { callerId, roomCode } = data;
            const room = rooms.get(roomCode);
            if (!room) return;
            
            const rejecter = room.users.get(socket.id);
            console.log(`📹 Video call rejected by ${rejecter?.username || 'user'}`);
            
            // Notify caller that call was rejected
            io.to(callerId).emit('video-call-rejected', {
                rejecterId: socket.id
            });
        } catch (error) {
            console.error('❌ Error in video-call-reject:', error);
        }
    });
    
    /**
     * Send WebRTC offer
     */
    socket.on('video-offer', (data) => {
        try {
            const { targetUserId, offer } = data;
            console.log(`📹 Video offer from ${socket.id} to ${targetUserId}`);
            
            io.to(targetUserId).emit('video-offer', {
                callerId: socket.id,
                offer: offer
            });
        } catch (error) {
            console.error('❌ Error in video-offer:', error);
        }
    });
    
    /**
     * Send WebRTC answer
     */
    socket.on('video-answer', (data) => {
        try {
            const { targetUserId, answer } = data;
            console.log(`📹 Video answer from ${socket.id} to ${targetUserId}`);
            
            io.to(targetUserId).emit('video-answer', {
                answererId: socket.id,
                answer: answer
            });
        } catch (error) {
            console.error('❌ Error in video-answer:', error);
        }
    });
    
    /**
     * Exchange ICE candidates
     */
    socket.on('video-ice-candidate', (data) => {
        try {
            const { targetUserId, candidate } = data;
            
            io.to(targetUserId).emit('video-ice-candidate', {
                senderId: socket.id,
                candidate: candidate
            });
        } catch (error) {
            console.error('❌ Error in video-ice-candidate:', error);
        }
    });
    
    /**
     * End video call
     */
    socket.on('video-call-end', (data) => {
        try {
            const { targetUserId } = data;
            console.log(`📹 Video call ended by ${socket.id}`);
            
            io.to(targetUserId).emit('video-call-ended', {
                enderId: socket.id
            });
        } catch (error) {
            console.error('❌ Error in video-call-end:', error);
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // DISCONNECT
    // ─────────────────────────────────────────────────────────────────
    
    socket.on('disconnect', (reason) => {
        console.log(`🔌 User disconnected: ${socket.id}, reason: ${reason}`);
        
        try {
            const session = userSessions.get(socket.id);
            
            // Handle graceful reconnection for transport errors
            if (reason === 'transport close' || reason === 'transport error') {
                if (session) {
                    session.lastSeen = new Date();
                    
                    // Wait 30 seconds before fully disconnecting user (reduced from 5 minutes)
                    setTimeout(() => {
                        // Check if this is still the active socket for this user
                        const currentSession = userSessions.get(socket.id);
                        if (currentSession) {
                            const roomUserKey = `${currentSession.roomCode}:${currentSession.username}`;
                            const activeSocketId = usernameToSocket.get(roomUserKey);
                            
                            // Only disconnect if no newer connection exists
                            if (activeSocketId === socket.id) {
                                handleUserDisconnection(socket.id);
                                usernameToSocket.delete(roomUserKey);
                            }
                        }
                    }, 30 * 1000); // 30 seconds grace period
                }
            } else {
                // Immediate disconnect for other reasons
                handleUserDisconnection(socket.id);
                
                // Clean up username tracking
                if (session) {
                    const roomUserKey = `${session.roomCode}:${session.username}`;
                    if (usernameToSocket.get(roomUserKey) === socket.id) {
                        usernameToSocket.delete(roomUserKey);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error handling disconnect:', error);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ PRMessenger Server Started');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🏠 Domain: https://prmessenger.app`);
    console.log(`📁 Active rooms: ${rooms.size}`);
    console.log(`👥 Active users: ${userSessions.size}`);
    console.log('═══════════════════════════════════════════════════════\n');
});

// ═════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═════════════════════════════════════════════════════════════════════

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * Gracefully shutdown server
 */
function gracefulShutdown() {
    console.log('\n⚠️  Server shutting down gracefully...');
    
    // Notify all connected clients
    io.emit('server-maintenance', { 
        message: 'Server maintenance in progress. Please reconnect in a moment.' 
    });
    
    // Wait 2 seconds before closing
    setTimeout(() => {
        server.close(() => {
            console.log('✅ Server closed successfully');
            process.exit(0);
        });
    }, 2000);
}

// ═════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═════════════════════════════════════════════════════════════════════

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
