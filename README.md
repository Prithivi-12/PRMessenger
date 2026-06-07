# PRMessenger

> **Perfect Real-time Chat Application** - A full-featured, real-time messaging platform with voice messages, file sharing, video calls, and PWA support.

![Version](https://img.shields.io/badge/version-6.1-blue)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## ✨ Features

### 💬 Real-time Messaging
- Instant message delivery via WebSocket (Socket.IO)
- Message reactions (👍❤️😂😮😢😡)
- Reply to messages with quoted preview
- Edit and delete your own messages
- Typing indicators
- Message history persistence per session

### 🎤 Voice Messages
- Hold-to-record voice messages
- Audio playback with waveform visualization
- WebM audio format for optimal compression

### 📁 File Sharing
- Drag & drop or click to upload
- Support for images, videos, documents, and more
- 25MB max file size
- Inline image/video preview
- Full-screen media viewer

### 📹 Video Calling (1:1)
- WebRTC-powered video calls
- Click-to-call any online participant
- Mute/unmute microphone
- Toggle camera on/off
- Switch front/back camera (mobile)
- Full-screen video view with picture-in-picture

### 👥 Room Management
- Create rooms with auto-generated 6-character codes
- Join existing rooms via code
- Real-time participant list with online status
- Admin controls (transfer admin, close room)
- Automatic room cleanup when empty

### 📱 Progressive Web App (PWA)
- Install on mobile/desktop
- Offline support via Service Worker
- Push notification ready
- App shortcuts

### 🔒 Security & Privacy
- Room-based isolation
- No permanent message storage
- Automatic file cleanup on room close
- Session-based authentication

## 🚀 Quick Start

### Prerequisites
- Node.js >= 16.0.0
- npm or yarn

### Installation

```bash
# Clone or navigate to project
cd prmessenger

# Install dependencies
npm install

# Start the server
npm start
```

### Development Mode

```bash
# With auto-reload (requires nodemon)
npm run dev
```
# Install dependenciesnodemon globally if you haven't already
npm install -g nodemon

The server will start on `http://localhost:3000`

## 📁 Project Structure

```
prmessenger/
├── server.js          # Node.js + Express + Socket.IO server
├── index.html         # Main HTML with semantic structure
├── front.js           # Client-side application (PRMessengerApp class)
├── front.css          # Complete responsive CSS
├── sw.js              # Service Worker for PWA/offline
├── manifest.json      # PWA manifest
├── package.json       # Dependencies and scripts
├── uploads/           # Uploaded files (auto-cleaned)
└── README.md          # This file
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express |
| **Real-time** | Socket.IO (WebSocket) |
| **Video Calls** | WebRTC (RTCPeerConnection) |
| **File Upload** | Multer |
| **Frontend** | Vanilla JavaScript (ES6+) |
| **Styling** | CSS3 with Custom Properties |
| **PWA** | Service Worker, Web App Manifest |

## 📡 Socket Events

### Client → Server
| Event | Description |
|-------|-------------|
| `create-room` | Create a new chat room |
| `join-room` | Join an existing room |
| `leave-room` | Leave current room |
| `close-room` | Close room (admin only) |
| `message` | Send a text message |
| `edit-message` | Edit own message |
| `delete-message` | Delete own message |
| `toggle-reaction` | Add/remove reaction |
| `typing-start/stop` | Typing indicators |
| `video-call-request` | Initiate video call |
| `video-offer/answer` | WebRTC signaling |
| `video-ice-candidate` | ICE candidate exchange |

### Server → Client
| Event | Description |
|-------|-------------|
| `room-created` | Room creation confirmed |
| `room-joined` | Successfully joined room |
| `message` | New message received |
| `message-edited` | Message was edited |
| `message-deleted` | Message was deleted |
| `user-joined/left` | Participant updates |
| `participants-update` | Full participant list |
| `video-call-incoming` | Incoming call notification |

## 🔧 Configuration

### Server Settings (server.js)
```javascript
const PORT = process.env.PORT || 3000;
const CLEANUP_DELAY = 30 * 1000;      // Room cleanup after 30s empty
const fileSize = 25 * 1024 * 1024;    // 25MB max upload
```

### CORS Origins
```javascript
origin: [
    // "https://prmessenger.app",
    // "https://www.prmessenger.app",
    "http://localhost:3000"
]
```

## 🌐 Deployment

### Production Checklist
- [ ] Set up HTTPS (required for PWA, WebRTC, getUserMedia)
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set `NODE_ENV=production`
- [ ] Update CORS origins in server.js
- [ ] Configure process manager (PM2)

### PM2 Example
```bash
pm2 start server.js --name prmessenger
pm2 save
pm2 startup
```

### Nginx Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name prmessenger.app;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads {
        alias /var/www/prmessenger/uploads;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 🧹 Automatic Cleanup

PRMessenger automatically cleans up resources:

1. **Empty Rooms**: Deleted after 30 seconds with no participants
2. **Uploaded Files**: Removed when room closes or becomes empty
3. **Chat History**: Cleared from memory on room cleanup
4. **Disconnections**: 30-second grace period for reconnection

## 📱 PWA Installation

1. Visit the app in a supported browser (Chrome, Edge, Safari)
2. Click "Install PRMessenger" popup or browser install button
3. App icon appears on home screen/desktop
4. Works offline for cached content

## 🎨 Customization

### Theme Colors (front.css)
```css
:root {
    --primary: #4A90E2;
    --surface-dark: #0a0a0a;
    --surface-card: #1a1a1a;
    --text-primary: #ffffff;
}
```

### App Branding (manifest.json)
```json
{
    "name": "PRMessenger - Perfect Real-time Chat",
    "short_name": "PRMessenger",
    "theme_color": "#4A90E2"
}
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Video call not working | Ensure HTTPS is enabled |
| PWA not installing | Check manifest.json and HTTPS |
| Files not uploading | Check uploads/ directory permissions |
| Socket disconnecting | Check firewall/proxy WebSocket support |

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

**PRMessenger** - Built with Ai for seamless real-time communication.
