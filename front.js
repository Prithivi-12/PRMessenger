/**
 * ═══════════════════════════════════════════════════════════════════
 * PRMessenger - Real-time Chat Application
 * Version: 6.1
 * Features: Real-time messaging, Voice messages, File sharing,
 *           Reactions, Reply, Edit/Delete, Participants sidebar
 * ═══════════════════════════════════════════════════════════════════
 */

class PRMessengerApp {
    constructor() {
        // ─────────────────────────────────────────────────────────────
        // SOCKET.IO CONFIGURATION
        // ─────────────────────────────────────────────────────────────
        this.socket = io({
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            timeout: 20000,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });
        
        // ─────────────────────────────────────────────────────────────
        // STATE MANAGEMENT
        // ─────────────────────────────────────────────────────────────
        
        // Initialization guard
        this.isInitialized = false;
        
        // Room state
        this.currentRoom = null;
        this.currentUser = null;
        this.isAdmin = false;
        this.participants = [];
        
        // Messaging state
        this.typingTimeout = null;
        this.replyingTo = null;
        this.currentMessageId = null;
        this.currentMessageText = null;
        
        // Voice recording state
        this.mediaRecorder = null;
        this.recordingChunks = [];
        this.recordingStartTime = null;
        this.isRecording = false;
        
        // PWA state
        this.deferredPrompt = null;
        
        // Touch/gesture handling
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.lastTap = 0;
        this.longPressTimer = null;
        this.isLongPress = false;
        this.isSwiping = false;
        this.currentTouchTarget = null;
        this.swipeThreshold = 60;
        this.longPressDelay = 500;
        
        // Connection state
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.heartbeatInterval = null;
        
        // ─────────────────────────────────────────────────────────────
        // VIDEO CALL STATE
        // ─────────────────────────────────────────────────────────────
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isInCall = false;
        this.callTargetUserId = null;
        this.callTargetUserName = null;
        this.incomingCallerId = null;
        this.incomingCallerName = null;
        this.isMuted = false;
        this.isCameraOff = false;
        this.currentFacingMode = 'user';  // 'user' or 'environment'
        this.isScreenSharing = false;
        
        // ─────────────────────────────────────────────────────────────
        // THEME & UI STATE
        // ─────────────────────────────────────────────────────────────
        this.currentTheme = localStorage.getItem('prmessenger_theme') || 'dark';
        this.galleryImages = [];
        this.galleryIndex = 0;
        this.searchMessages = [];
        this.roomAnalytics = { messages: 0, media: 0, voice: 0, users: {} };
        
        // ─────────────────────────────────────────────────────────────
        // CUSTOM MODAL STATE
        // ─────────────────────────────────────────────────────────────
        this.modalResolve = null;
        this.modalReject = null;
        
        // ─────────────────────────────────────────────────────────────
        // E2E ENCRYPTION STATE (Web Crypto API)
        // ─────────────────────────────────────────────────────────────
        this.encryptionEnabled = false;
        this.roomKey = null;
        this.keyPair = null;
        this.peerPublicKeys = new Map(); // userId -> CryptoKey
        
        // WebRTC configuration with STUN/TURN servers
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        this.init();
    }

    // ═════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════════════════════════════
    
    init() {
        // Prevent duplicate initialization
        if (this.isInitialized) {
            console.warn('PRMessenger already initialized, skipping...');
            return;
        }
        
        this.setupEventListeners();
        this.setupSocketListeners();
        this.setupPWA();
        this.autoResizeTextarea();
        this.setupMessageInteractions();
        this.setupSidebarToggle();
        this.setupParticipantSearch();
        this.setupVideoCallListeners();
        this.setupVideoCallSocketListeners();
        this.setupCustomModal();
        this.setupThemeSystem();
        this.setupSearchPanel();
        this.setupGallery();
        this.setupAnalytics();
        this.setupScreenShare();
        this.setupPushNotifications();
        this.setupEncryption();
        this.checkExistingRoom();
        this.startHeartbeat();
        
        this.isInitialized = true;
        console.log('✅ PRMessenger initialized with all features');
    }

    // ═════════════════════════════════════════════════════════════════
    // HEARTBEAT & CONNECTION MANAGEMENT
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('ping');
            }
        }, 25000);
    }

    /**
     * Show connection status banner
     * @param {string} status - connected, disconnected, reconnecting
     * @param {string} message - Status message to display
     */
    showConnectionStatus(status, message) {
        const statusEl = document.getElementById('connectionStatus');
        const textEl = document.getElementById('connectionText');
        
        statusEl.className = `connection-status show ${status}`;
        textEl.textContent = message;
        
        // Auto-hide success messages after 3 seconds
        if (status === 'connected') {
            setTimeout(() => statusEl.classList.remove('show'), 3000);
        }
    }

    /**
     * Check if user has an existing room session and auto-rejoin
     */
    checkExistingRoom() {
        const savedRoom = localStorage.getItem('prmessenger_room');
        const savedUser = localStorage.getItem('prmessenger_user');
        
        if (savedRoom && savedUser) {
            this.showLoading();
            if (this.socket.connected) {
                this.socket.emit('rejoin-room', { roomCode: savedRoom, username: savedUser });
            } else {
                this.socket.once('connect', () => {
                    this.socket.emit('rejoin-room', { roomCode: savedRoom, username: savedUser });
                });
            }
        } else {
            // Check for room code in URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const roomFromUrl = urlParams.get('room');
            if (roomFromUrl) {
                document.getElementById('roomCode').value = roomFromUrl.toUpperCase();
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // PWA INSTALLATION
    // ═════════════════════════════════════════════════════════════════
    
    setupPWA() {
        let installPromptEvent = null;

        // Capture install prompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('PWA install prompt available');
            e.preventDefault();
            installPromptEvent = e;
            this.deferredPrompt = e;
            
            // Show install popup after 3 seconds
            setTimeout(() => {
                document.getElementById('pwaInstallPopup').classList.add('show');
            }, 3000);
        });

        // Install button handler
        document.getElementById('installPwaBtn').addEventListener('click', async () => {
            if (installPromptEvent) {
                console.log('Showing PWA install prompt');
                installPromptEvent.prompt();
                const { outcome } = await installPromptEvent.userChoice;
                console.log('PWA install outcome:', outcome);
                
                if (outcome === 'accepted') {
                    this.showToast('App installed successfully!', 'success');
                }
                
                installPromptEvent = null;
                this.deferredPrompt = null;
                this.hidePwaPopup();
            }
        });

        // Later button handler
        document.getElementById('laterPwaBtn').addEventListener('click', () => {
            this.hidePwaPopup();
            localStorage.setItem('pwa_reminded', Date.now().toString());
        });

        // Close button handler
        document.getElementById('closePwaPopup').addEventListener('click', () => {
            this.hidePwaPopup();
        });

        // App installed event
        window.addEventListener('appinstalled', () => {
            console.log('PWA installed');
            this.hidePwaPopup();
            this.showToast('PRMessenger installed!', 'success');
        });

        // Check if already running as PWA
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true ||
            document.referrer.includes('android-app://')) {
            console.log('Running as PWA');
            this.hidePwaPopup();
        }

        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                    
                    // Handle updates
                    registration.addEventListener('updatefound', () => {
                        console.log('Service Worker update found');
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                this.showToast('App updated! Refresh to use new version.', 'info');
                            }
                        });
                    });
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        }
    }

    hidePwaPopup() {
        document.getElementById('pwaInstallPopup').classList.remove('show');
    }

    // ═════════════════════════════════════════════════════════════════
    // EVENT LISTENERS SETUP
    // ═════════════════════════════════════════════════════════════════
    
    setupEventListeners() {
        // ─────────────────────────────────────────────────────────────
        // LANDING PAGE EVENTS
        // ─────────────────────────────────────────────────────────────
        
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        
        // Enter key handlers for inputs
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });
        
        document.getElementById('roomCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Auto-uppercase room code
        document.getElementById('roomCode').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });

        // ─────────────────────────────────────────────────────────────
        // CHAT INTERFACE EVENTS
        // ─────────────────────────────────────────────────────────────
        
        document.getElementById('backBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('menuBtn').addEventListener('click', () => this.showRoomMenu());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        
        // Message input events
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        messageInput.addEventListener('input', () => this.handleTyping());

        // Reply mode
        document.getElementById('cancelReply').addEventListener('click', () => this.cancelReply());

        // ─────────────────────────────────────────────────────────────
        // FILE UPLOAD EVENTS
        // ─────────────────────────────────────────────────────────────
        
        document.getElementById('fileBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));

        // ─────────────────────────────────────────────────────────────
        // VOICE RECORDING EVENTS
        // ─────────────────────────────────────────────────────────────
        
        const voiceBtn = document.getElementById('voiceBtn');
        
        // Mouse events for desktop
        voiceBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startVoiceRecording();
        });
        voiceBtn.addEventListener('mouseup', () => this.stopVoiceRecording());
        voiceBtn.addEventListener('mouseleave', () => this.stopVoiceRecording());
        
        // Touch events for mobile
        voiceBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startVoiceRecording();
        });
        voiceBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopVoiceRecording();
        });

        // ─────────────────────────────────────────────────────────────
        // MODAL EVENTS
        // ─────────────────────────────────────────────────────────────
        
        document.getElementById('closeMenuBtn').addEventListener('click', () => this.hideRoomMenu());
        document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('shareRoomBtn').addEventListener('click', () => this.shareRoom());
        document.getElementById('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('closeRoomBtn').addEventListener('click', () => this.closeRoom());
        
        // Encryption and Analytics buttons
        document.getElementById('encryptionBtn')?.addEventListener('click', () => {
            this.enableEncryption();
            this.hideRoomMenu();
        });
        document.getElementById('analyticsBtn')?.addEventListener('click', () => {
            this.showAnalytics();
            this.hideRoomMenu();
        });

        // ─────────────────────────────────────────────────────────────
        // CONTEXT MENU EVENTS
        // ─────────────────────────────────────────────────────────────
        
        document.getElementById('replyMenuItem').addEventListener('click', () => this.handleReply());
        document.getElementById('copyMenuItem').addEventListener('click', () => this.handleCopyText());
        document.getElementById('editMenuItem').addEventListener('click', () => this.handleEdit());
        document.getElementById('deleteMenuItem').addEventListener('click', () => this.handleDelete());

        // ─────────────────────────────────────────────────────────────
        // REACTION PICKER EVENTS
        // ─────────────────────────────────────────────────────────────
        
        document.querySelectorAll('.reaction-option').forEach(option => {
            option.addEventListener('click', (e) => this.addReaction(e.target.dataset.emoji));
        });

        // ─────────────────────────────────────────────────────────────
        // MEDIA VIEWER EVENTS
        // ─────────────────────────────────────────────────────────────
        
        document.getElementById('closeMediaViewer').addEventListener('click', () => this.hideMediaViewer());
        document.getElementById('mediaViewer').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.hideMediaViewer();
        });

        // ─────────────────────────────────────────────────────────────
        // GLOBAL CLICK HANDLERS
        // ─────────────────────────────────────────────────────────────
        
        document.addEventListener('click', (e) => {
            // Close context menu when clicking outside
            if (!e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
            // Close reaction picker when clicking outside
            if (!e.target.closest('.reaction-picker')) {
                this.hideReactionPicker();
            }
            // Close modals when clicking outside
            if (!e.target.closest('.modal-content') && e.target.closest('.modal')) {
                this.hideRoomMenu();
            }
        });

        // ─────────────────────────────────────────────────────────────
        // BROWSER EVENTS
        // ─────────────────────────────────────────────────────────────
        
        // Prevent accidental page refresh when in room
        window.addEventListener('beforeunload', (e) => {
            if (this.currentRoom) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // Handle tab visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.clearTyping();
            }
        });

        // Handle online/offline status
        window.addEventListener('online', () => {
            this.showConnectionStatus('connected', 'Back online');
        });

        window.addEventListener('offline', () => {
            this.showConnectionStatus('disconnected', 'Connection lost');
        });
    }

    // ═════════════════════════════════════════════════════════════════
    // SIDEBAR FUNCTIONALITY
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Setup sidebar toggle for mobile view
     */
    setupSidebarToggle() {
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        const sidebar = document.getElementById('sidebar');
        
        if (!toggleBtn || !sidebar) return;
        
        // Create overlay for mobile
        let overlay = document.getElementById('sidebarOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.id = 'sidebarOverlay';
            document.body.appendChild(overlay);
        }
        
        // Toggle sidebar
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
        
        // Close sidebar when clicking overlay
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    /**
     * Setup participant search functionality
     */
    setupParticipantSearch() {
        const searchInput = document.getElementById('participantSearch');
        if (!searchInput) return;
        
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const participants = document.querySelectorAll('.participant-item');
            
            participants.forEach(item => {
                const nameEl = item.querySelector('.participant-name');
                if (!nameEl) return;
                
                const name = nameEl.textContent.toLowerCase();
                item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
            });
        });
    }

    /**
     * Update participants list in sidebar
     * @param {Array} participants - Array of participant objects
     */
    updateParticipantsList(participants) {
        const listEl = document.getElementById('participantsList');
        if (!listEl) return;
        
        this.participants = participants || [];
        listEl.innerHTML = '';
        
        if (this.participants.length === 0) {
            listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 14px;">No participants yet</div>';
            return;
        }
        
        this.participants.forEach(participant => {
            const isYou = participant.userId === this.socket.id;
            const isAdmin = participant.isAdmin;
            const isOnline = participant.online !== false;
            
            const participantItem = document.createElement('div');
            participantItem.className = 'participant-item' + (isYou ? ' active' : '');
            participantItem.dataset.userId = participant.userId;
            
            // Video call button (only for other participants who are online)
            const videoCallBtn = (!isYou && isOnline) 
                ? `<button class="participant-call-btn" 
                          data-user-id="${participant.userId}" 
                          data-username="${this.escapeHtml(participant.username)}"
                          title="Video call ${this.escapeHtml(participant.username)}"
                          aria-label="Video call ${this.escapeHtml(participant.username)}">📹</button>`
                : '';
            
            participantItem.innerHTML = `
                <div class="participant-avatar">
                    ${participant.username.charAt(0).toUpperCase()}
                    <div class="participant-status-dot ${isOnline ? '' : 'offline'}"></div>
                </div>
                <div class="participant-details">
                    <div class="participant-name">
                        ${this.escapeHtml(participant.username)}
                        ${isYou ? '<span class="participant-badge you">You</span>' : ''}
                        ${isAdmin ? '<span class="participant-badge admin">Admin</span>' : ''}
                    </div>
                    <div class="participant-role">${isAdmin ? 'Room Admin' : 'Member'}</div>
                </div>
                ${videoCallBtn}
            `;
            
            // Add click handler for video call button
            if (!isYou && isOnline) {
                const btn = participantItem.querySelector('.participant-call-btn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.initiateVideoCall(participant.userId, participant.username);
                    });
                }
            }
            
            listEl.appendChild(participantItem);
        });
    }

    /**
     * Update participant count display
     * @param {number} count - Number of participants
     */
    updateParticipantCount(count) {
        const text = `${count} participant${count !== 1 ? 's' : ''}`;
        
        const headerCount = document.getElementById('participantCount');
        if (headerCount) headerCount.textContent = text;
        
        const badge = document.getElementById('sidebarParticipantCount');
        if (badge) badge.textContent = count;
    }

    /**
     * Update current user info in sidebar
     */
    updateCurrentUserInfo() {
        if (!this.currentUser) return;
        
        const nameEl = document.getElementById('currentUserName');
        const avatarEl = document.getElementById('currentUserAvatar');
        
        if (nameEl) nameEl.textContent = this.currentUser;
        if (avatarEl) avatarEl.textContent = this.currentUser.charAt(0).toUpperCase();
    }

    // ═════════════════════════════════════════════════════════════════
    // MESSAGE INTERACTIONS (Touch & Mouse Gestures)
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Setup touch and mouse interactions for messages
     */
    setupMessageInteractions() {
        const container = document.getElementById('messagesContainer');
        if (!container) {
            console.warn('messagesContainer not found, skipping message interactions setup');
            return;
        }
        
        // Touch events
        container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
        
        // Mouse events
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // Prevent default context menu
        container.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Handle touch start event
     */
    handleTouchStart(e) {
        const messageEl = e.target.closest('.message');
        if (!messageEl || !messageEl.dataset.messageId) return;

        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchStartTime = Date.now();
        this.currentTouchTarget = messageEl;
        this.currentMessageId = messageEl.dataset.messageId;
        this.currentMessageText = this.extractMessageText(messageEl);
        this.isLongPress = false;
        this.isSwiping = false;

        // Double tap detection
        const currentTime = Date.now();
        const tapLength = currentTime - this.lastTap;
        if (tapLength < 300 && tapLength > 0) {
            e.preventDefault();
            this.handleDoubleTap(messageEl, touch.clientX, touch.clientY);
            this.lastTap = 0;
            return;
        }
        this.lastTap = currentTime;

        // Long press timer
        this.longPressTimer = setTimeout(() => {
            if (this.currentTouchTarget && !this.isSwiping) {
                this.isLongPress = true;
                this.handleLongPress(messageEl, touch.clientX, touch.clientY);
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, this.longPressDelay);

        messageEl.classList.add('long-pressing');
    }

    /**
     * Handle touch move event (for swipe detection)
     */
    handleTouchMove(e) {
        if (!this.currentTouchTarget) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Cancel long press if moved too much
        if (distance > 25 && this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
            if (this.currentTouchTarget) {
                this.currentTouchTarget.classList.remove('long-pressing');
            }
        }

        // Swipe to reply detection (left swipe)
        if (!this.isLongPress && Math.abs(deltaX) > this.swipeThreshold && Math.abs(deltaY) < 50) {
            if (deltaX < -this.swipeThreshold) {
                e.preventDefault();
                this.isSwiping = true;
                
                const messageWrapper = this.currentTouchTarget.closest('.message-wrapper');
                if (messageWrapper) messageWrapper.classList.add('swiping');
            }
        }

        if (this.isSwiping) e.preventDefault();
    }

    /**
     * Handle touch end event
     */
    handleTouchEnd(e) {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (this.currentTouchTarget) {
            this.currentTouchTarget.classList.remove('long-pressing');
            
            // Execute swipe action (reply)
            if (this.isSwiping) {
                const messageWrapper = this.currentTouchTarget.closest('.message-wrapper');
                
                if (navigator.vibrate) navigator.vibrate(30);
                
                setTimeout(() => {
                    if (messageWrapper) messageWrapper.classList.remove('swiping');
                    if (this.currentTouchTarget) this.setReplyMode(this.currentTouchTarget);
                }, 200);
            }
        }

        this.currentTouchTarget = null;
        this.isLongPress = false;
        this.isSwiping = false;
    }

    /**
     * Handle mouse down event (desktop long press)
     */
    handleMouseDown(e) {
        const messageEl = e.target.closest('.message');
        if (!messageEl || !messageEl.dataset.messageId) return;

        this.touchStartX = e.clientX;
        this.touchStartY = e.clientY;
        this.touchStartTime = Date.now();
        this.currentTouchTarget = messageEl;
        this.currentMessageId = messageEl.dataset.messageId;
        this.currentMessageText = this.extractMessageText(messageEl);
        this.isLongPress = false;

        e.preventDefault();

        // Double click detection
        const currentTime = Date.now();
        const clickLength = currentTime - this.lastTap;
        if (clickLength < 300 && clickLength > 0) {
            this.handleDoubleTap(messageEl, e.clientX, e.clientY);
            this.lastTap = 0;
            return;
        }
        this.lastTap = currentTime;

        // Long press timer
        this.longPressTimer = setTimeout(() => {
            if (this.currentTouchTarget) {
                this.isLongPress = true;
                this.handleLongPress(messageEl, e.clientX, e.clientY);
            }
        }, this.longPressDelay);

        messageEl.classList.add('long-pressing');
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(e) {
        if (!this.currentTouchTarget || this.isLongPress) return;

        const deltaX = e.clientX - this.touchStartX;
        const deltaY = e.clientY - this.touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Cancel long press if mouse moved
        if (distance > 15 && this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
            if (this.currentTouchTarget) {
                this.currentTouchTarget.classList.remove('long-pressing');
            }
        }
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp(e) {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (this.currentTouchTarget) {
            this.currentTouchTarget.classList.remove('long-pressing');
        }

        this.currentTouchTarget = null;
        this.isLongPress = false;
    }

    /**
     * Extract text content from message element
     * @param {HTMLElement} messageEl - Message element
     * @returns {string} - Message text content
     */
    extractMessageText(messageEl) {
        const msgType = messageEl.dataset.messageType;
        
        switch(msgType) {
            case 'text':
                return messageEl.textContent.replace('(edited)', '').trim();
            case 'file':
                return messageEl.querySelector('.file-name')?.textContent || 'File';
            case 'voice':
                return 'Voice message';
            case 'image':
                return 'Photo';
            case 'video':
                return 'Video';
            default:
                return messageEl.textContent.replace('(edited)', '').trim();
        }
    }

    /**
     * Handle long press on message (show context menu)
     */
    handleLongPress(messageEl, x, y) {
        const messageId = messageEl.dataset.messageId;
        const userId = messageEl.dataset.userId;
        const isOwn = userId === this.socket.id;
        const messageType = messageEl.dataset.messageType || 'text';
        
        this.currentMessageId = messageId;
        
        // Show/hide menu items based on message ownership and type
        const editItem = document.getElementById('editMenuItem');
        const deleteItem = document.getElementById('deleteMenuItem');
        const copyItem = document.getElementById('copyMenuItem');
        
        editItem.style.display = (isOwn && messageType === 'text') ? 'flex' : 'none';
        deleteItem.style.display = isOwn ? 'flex' : 'none';
        copyItem.style.display = messageType === 'text' ? 'flex' : 'none';
        
        // Position and show context menu
        const contextMenu = document.getElementById('contextMenu');
        
        let menuX = Math.min(Math.max(x, 10), window.innerWidth - 180);
        let menuY = Math.min(Math.max(y, 10), window.innerHeight - 220);
        
        contextMenu.style.left = menuX + 'px';
        contextMenu.style.top = menuY + 'px';
        contextMenu.classList.add('show');
        
        messageEl.classList.remove('long-pressing');
    }

    /**
     * Handle double tap/click on message (show reactions)
     */
    handleDoubleTap(messageEl, x, y) {
        messageEl.classList.add('double-tapped');
        
        const reactionPicker = document.getElementById('reactionPicker');
        
        // Position reaction picker
        let pickerX = Math.min(Math.max(x - 120, 10), window.innerWidth - 240);
        let pickerY = Math.max(y - 80, 20);
        
        reactionPicker.style.left = pickerX + 'px';
        reactionPicker.style.top = pickerY + 'px';
        reactionPicker.classList.add('show');
        
        this.currentMessageId = messageEl.dataset.messageId;
        
        if (navigator.vibrate) navigator.vibrate(25);
        
        setTimeout(() => messageEl.classList.remove('double-tapped'), 300);
        setTimeout(() => this.hideReactionPicker(), 5000);
    }

    /**
     * Set reply mode for a message
     */
    setReplyMode(messageEl) {
        const messageId = messageEl.dataset.messageId;
        const userId = messageEl.dataset.userId;
        const messageGroup = messageEl.closest('.message-group');
        const senderNameEl = messageGroup.querySelector('.sender-name');
        const username = senderNameEl ? senderNameEl.textContent : (userId === this.socket.id ? 'You' : 'User');
        const messageText = this.currentMessageText || this.extractMessageText(messageEl);

        this.replyingTo = {
            id: messageId,
            userId: userId,
            username: username,
            message: messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText
        };

        document.getElementById('replyToUser').textContent = username;
        document.getElementById('replyToMessage').textContent = this.replyingTo.message;
        document.getElementById('replyMode').classList.add('active');
        document.getElementById('messageInput').focus();
    }

    /**
     * Cancel reply mode
     */
    cancelReply() {
        this.replyingTo = null;
        document.getElementById('replyMode').classList.remove('active');
    }

    /**
     * Handle reply action from context menu
     */
    handleReply() {
        const messageEl = document.querySelector(`[data-message-id="${this.currentMessageId}"]`);
        if (messageEl) this.setReplyMode(messageEl);
        this.hideContextMenu();
    }

    /**
     * Handle copy text action from context menu
     */
    handleCopyText() {
        if (this.currentMessageText) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(this.currentMessageText)
                    .then(() => this.showToast('Copied to clipboard!', 'success'))
                    .catch(() => this.fallbackCopyText(this.currentMessageText));
            } else {
                this.fallbackCopyText(this.currentMessageText);
            }
        }
        this.hideContextMenu();
    }

    /**
     * Fallback copy method for browsers without clipboard API
     */
    fallbackCopyText(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showToast('Copied!', 'success');
        } catch (err) {
            this.showToast('Copy failed', 'error');
        }
        
        textArea.remove();
    }

    /**
     * Handle edit action from context menu
     * Uses custom modal for better UX consistency
     */
    async handleEdit() {
        const messageEl = document.querySelector(`[data-message-id="${this.currentMessageId}"]`);
        if (!messageEl) return;
        
        const currentText = this.currentMessageText;
        const messageId = this.currentMessageId;
        this.hideContextMenu();
        
        const newMessage = await this.showPrompt('Edit Message', 'Edit your message:', currentText);
        
        if (newMessage && newMessage.trim() && newMessage.trim() !== currentText) {
            this.socket.emit('edit-message', {
                roomCode: this.currentRoom,
                messageId: messageId,
                newMessage: newMessage.trim()
            });
        }
    }

    /**
     * Handle delete action from context menu
     * Uses custom modal for better UX consistency
     */
    async handleDelete() {
        const messageId = this.currentMessageId;
        this.hideContextMenu();
        
        const confirmed = await this.showConfirm('Delete Message', 'Delete this message? This action cannot be undone.');
        
        if (confirmed) {
            this.socket.emit('delete-message', {
                roomCode: this.currentRoom,
                messageId: messageId
            });
        }
    }

    /**
     * Add reaction to message
     */
    addReaction(emoji) {
        if (this.currentMessageId) {
            this.socket.emit('toggle-reaction', {
                roomCode: this.currentRoom,
                messageId: this.currentMessageId,
                emoji: emoji
            });
        }
        this.hideReactionPicker();
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        document.getElementById('contextMenu').classList.remove('show');
        this.currentMessageId = null;
        this.currentMessageText = null;
    }

    /**
     * Hide reaction picker
     */
    hideReactionPicker() {
        document.getElementById('reactionPicker').classList.remove('show');
    }

    /**
     * Show media viewer (for images/videos)
     */
    showMediaViewer(src, alt = '') {
        const viewer = document.getElementById('mediaViewer');
        const content = document.getElementById('mediaViewerContent');
        
        content.src = src;
        content.alt = alt;
        viewer.classList.add('active');
    }

    /**
     * Hide media viewer
     */
    hideMediaViewer() {
        document.getElementById('mediaViewer').classList.remove('active');
    }

    // ═════════════════════════════════════════════════════════════════
    // SOCKET.IO EVENT LISTENERS
    // ═════════════════════════════════════════════════════════════════
    
    setupSocketListeners() {
        // ─────────────────────────────────────────────────────────────
        // CONNECTION EVENTS
        // ─────────────────────────────────────────────────────────────
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.showConnectionStatus('connected', 'Connected to server');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            this.isConnected = false;
            this.showConnectionStatus('disconnected', 'Connection lost');
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.showConnectionStatus('connected', 'Reconnected!');
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log('Reconnection attempt:', attemptNumber);
            this.reconnectAttempts = attemptNumber;
            this.showConnectionStatus('reconnecting', `Reconnecting... (${attemptNumber})`);
        });

        this.socket.on('pong', () => {
            // Heartbeat response received
        });

        // ─────────────────────────────────────────────────────────────
        // ROOM EVENTS
        // ─────────────────────────────────────────────────────────────
        
        this.socket.on('room-created', (data) => this.handleRoomJoined(data));
        this.socket.on('room-joined', (data) => this.handleRoomJoined(data));
        this.socket.on('room-rejoined', (data) => {
            this.handleRoomJoined(data);
            this.showToast('Reconnected to your room!', 'success');
        });

        this.socket.on('room-error', (error) => {
            this.showToast(error.message, 'error');
            this.hideLoading();
            if (error.message.includes('not found')) {
                localStorage.removeItem('prmessenger_room');
                localStorage.removeItem('prmessenger_user');
            }
        });

        this.socket.on('user-joined', (data) => {
            this.addSystemMessage(`${data.username} joined the room`);
            this.updateParticipantCount(data.participantCount);
            this.updateParticipantsList(data.participants);
            this.playNotificationSound();
        });

        this.socket.on('user-left', (data) => {
            this.addSystemMessage(`${data.username} left the room`);
            this.updateParticipantCount(data.participantCount);
            this.updateParticipantsList(data.participants);
        });

        // ─────────────────────────────────────────────────────────────
        // MESSAGE EVENTS
        // ─────────────────────────────────────────────────────────────
        
        this.socket.on('message', (message) => {
            this.addMessage(message);
            
            // Track for analytics
            this.trackMessage(message);
            
            // Notification for messages from others
            if (message.userId !== this.socket.id) {
                this.playNotificationSound();
                
                // Enhanced push notification
                this.sendNotification(
                    `${message.username}`,
                    message.type === 'file' ? '📎 Sent a file' : 
                    message.type === 'voice' ? '🎤 Sent a voice message' :
                    message.message,
                    { tag: `msg-${message.id}` }
                );
            }
        });

        this.socket.on('message-edited', (data) => {
            this.updateMessage(data.messageId, data.newMessage, true);
        });

        this.socket.on('message-deleted', (data) => {
            this.removeMessage(data.messageId);
        });

        this.socket.on('reaction-added', (data) => {
            this.updateMessageReactions(data.messageId, data.reactions);
        });

        // ─────────────────────────────────────────────────────────────
        // TYPING INDICATOR EVENTS
        // ─────────────────────────────────────────────────────────────
        
        this.socket.on('typing-start', (data) => {
            if (data.userId !== this.socket.id) {
                this.showTypingIndicator(data.username);
            }
        });

        this.socket.on('typing-stop', (data) => {
            if (data.userId !== this.socket.id) {
                this.hideTypingIndicator();
            }
        });

        // ─────────────────────────────────────────────────────────────
        // ADMIN EVENTS
        // ─────────────────────────────────────────────────────────────
        
        this.socket.on('room-closed', () => {
            this.showToast('Room has been closed by admin', 'error');
            localStorage.removeItem('prmessenger_room');
            localStorage.removeItem('prmessenger_user');
            setTimeout(() => this.backToLanding(), 2000);
        });

        this.socket.on('admin-changed', (data) => {
            this.isAdmin = data.newAdminId === this.socket.id;
            this.updateAdminControls();
            this.addSystemMessage(`${data.newAdminName} is now the admin`);
        });

        // ─────────────────────────────────────────────────────────────
        // PARTICIPANTS EVENTS
        // ─────────────────────────────────────────────────────────────
        
        this.socket.on('participants-update', (data) => {
            this.updateParticipantsList(data.participants);
            this.updateParticipantCount(data.participantCount);
        });
    }

    // ═════════════════════════════════════════════════════════════════
    // ROOM MANAGEMENT
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Create a new room
     */
    createRoom() {
        const username = document.getElementById('username').value.trim();
        if (!this.validateUsername(username)) return;

        this.showLoading();
        
        if (this.socket.connected) {
            this.socket.emit('create-room', { username });
        } else {
            this.showToast('Connecting to server...', 'info');
            this.socket.once('connect', () => {
                this.socket.emit('create-room', { username });
            });
        }
    }

    /**
     * Join an existing room
     */
    joinRoom() {
        const username = document.getElementById('username').value.trim();
        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
        
        if (!this.validateUsername(username)) return;
        if (!this.validateRoomCode(roomCode)) return;

        this.showLoading();
        
        if (this.socket.connected) {
            this.socket.emit('join-room', { username, roomCode });
        } else {
            this.showToast('Connecting to server...', 'info');
            this.socket.once('connect', () => {
                this.socket.emit('join-room', { username, roomCode });
            });
        }
    }

    /**
     * Handle successful room join
     */
    handleRoomJoined(data) {
        this.hideLoading();
        this.currentRoom = data.roomCode;
        this.currentUser = data.username;
        this.isAdmin = data.isAdmin;
        
        // Save to localStorage for auto-rejoin
        localStorage.setItem('prmessenger_room', data.roomCode);
        localStorage.setItem('prmessenger_user', data.username);
        
        // Update UI
        document.getElementById('roomTitle').textContent = 'PRMessenger';
        document.getElementById('roomDetails').innerHTML = `Room: <strong>${data.roomCode}</strong> • Admin: ${data.adminName || data.username}`;
        
        this.showChatInterface();
        
        // Load previous messages
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => this.addMessage(msg, false));
        }
        
        // Update participants
        this.updateParticipantCount(data.participantCount || 1);
        this.updateParticipantsList(data.participants || []);
        this.updateCurrentUserInfo();
        this.updateAdminControls();
        this.scrollToBottom();
        
        this.showToast(`Welcome to room ${data.roomCode}!`, 'success');

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    /**
     * Leave current room
     */
    leaveRoom() {
        if (this.currentRoom && confirm('Are you sure you want to leave this room?')) {
            this.socket.emit('leave-room', { roomCode: this.currentRoom });
            localStorage.removeItem('prmessenger_room');
            localStorage.removeItem('prmessenger_user');
            this.backToLanding();
        }
    }

    /**
     * Close room (admin only)
     */
    closeRoom() {
        if (this.currentRoom && this.isAdmin && 
            confirm('Are you sure you want to close this room? This will remove all users.')) {
            this.socket.emit('close-room', { roomCode: this.currentRoom });
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // MESSAGING
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Send a text message
     */
    sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message || !this.currentRoom) return;

        const messageData = {
            roomCode: this.currentRoom,
            message: message,
            type: 'text'
        };

        // Add reply data if replying
        if (this.replyingTo) {
            messageData.replyTo = this.replyingTo;
            this.cancelReply();
        }

        this.socket.emit('send-message', messageData);

        input.value = '';
        this.clearTyping();
        input.style.height = 'auto';
    }

    /**
     * Add a message to the chat
     * @param {Object} messageData - Message data object
     * @param {boolean} animate - Whether to animate the message
     */
    addMessage(messageData, animate = true) {
        const container = document.getElementById('messagesContainer');
        
        // Remove welcome message if present
        const welcome = container.querySelector('.welcome');
        if (welcome) welcome.remove();

        const messageGroup = document.createElement('div');
        messageGroup.className = `message-group ${messageData.userId === this.socket.id ? 'own' : ''}`;

        const time = new Date(messageData.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        const isOwn = messageData.userId === this.socket.id;
        const replyHtml = messageData.replyTo ? this.createReplyHtml(messageData.replyTo) : '';
        const reactionsHtml = this.createReactionsHtml(messageData.reactions || {});

        let messageContent = '';
        
        // Different rendering based on message type
        if (messageData.type === 'file') {
            try {
                const fileData = JSON.parse(messageData.message);
                messageContent = this.createFileMessageHtml(messageData, fileData, time, isOwn, replyHtml, reactionsHtml);
            } catch (error) {
                console.error('Failed to parse file message:', error);
                // Fallback for invalid file data
                messageContent = `
                    <div class="message-info">
                        <div class="avatar">${messageData.username.charAt(0).toUpperCase()}</div>
                        <span class="sender-name">${this.escapeHtml(messageData.username)}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-wrapper">
                        <div class="message ${isOwn ? 'sent' : 'received'}" 
                             data-message-id="${messageData.id}"
                             data-user-id="${messageData.userId}"
                             data-message-type="file">
                            <div class="message-text">📎 Unsupported file format</div>
                        </div>
                    </div>
                `;
            }
        } else if (messageData.type === 'voice') {
            messageContent = this.createVoiceMessageHtml(messageData, time, isOwn, replyHtml, reactionsHtml);
        } else {
            // Text message
            messageContent = `
                <div class="message-info">
                    <div class="avatar">${messageData.username.charAt(0).toUpperCase()}</div>
                    <span class="sender-name">${this.escapeHtml(messageData.username)}</span>
                    <span class="message-time">${time}</span>
                </div>
                ${replyHtml}
                <div class="message-wrapper">
                    <div class="message ${isOwn ? 'sent' : 'received'}" 
                         data-message-id="${messageData.id}"
                         data-user-id="${messageData.userId}"
                         data-message-type="text">
                        ${this.escapeHtml(messageData.message)}
                        ${messageData.edited ? '<small style="opacity: 0.6; font-size: 0.7rem;"> (edited)</small>' : ''}
                        ${reactionsHtml}
                    </div>
                    <div class="swipe-reply-indicator">Reply</div>
                </div>
            `;
        }

        messageGroup.innerHTML = messageContent;
        container.appendChild(messageGroup);

        // Animate message entry
        if (animate) {
            messageGroup.style.opacity = '0';
            messageGroup.style.transform = 'translateY(20px)';
            setTimeout(() => {
                messageGroup.style.transition = 'all 0.3s ease';
                messageGroup.style.opacity = '1';
                messageGroup.style.transform = 'translateY(0)';
            }, 10);
        }

        this.scrollToBottom();
    }

    /**
     * Create HTML for file message
     */
    createFileMessageHtml(messageData, fileData, time, isOwn, replyHtml, reactionsHtml) {
        const isImage = fileData.type && fileData.type.startsWith('image/');
        const isVideo = fileData.type && fileData.type.startsWith('video/');
        const isAudio = fileData.type && fileData.type.startsWith('audio/');
        
        if (isImage) {
            return `
                <div class="message-info">
                    <div class="avatar">${messageData.username.charAt(0).toUpperCase()}</div>
                    <span class="sender-name">${this.escapeHtml(messageData.username)}</span>
                    <span class="message-time">${time}</span>
                </div>
                ${replyHtml}
                <div class="message-wrapper">
                    <div class="message media-message ${isOwn ? 'sent' : 'received'}" 
                         data-message-id="${messageData.id}"
                         data-user-id="${messageData.userId}"
                         data-message-type="image">
                        <div class="message-media">
                            <img src="${fileData.url}" 
                                 alt="${this.escapeHtml(fileData.name)}" 
                                 class="message-image" 
                                 onclick="window.prMessenger.showMediaViewer('${fileData.url}', '${this.escapeHtml(fileData.name)}')">
                        </div>
                        ${reactionsHtml}
                    </div>
                    <div class="swipe-reply-indicator">Reply</div>
                </div>
            `;
        } else if (isVideo) {
            return `
                <div class="message-info">
                    <div class="avatar">${messageData.username.charAt(0).toUpperCase()}</div>
                    <span class="sender-name">${this.escapeHtml(messageData.username)}</span>
                    <span class="message-time">${time}</span>
                </div>
                ${replyHtml}
                <div class="message-wrapper">
                    <div class="message media-message ${isOwn ? 'sent' : 'received'}" 
                         data-message-id="${messageData.id}"
                         data-user-id="${messageData.userId}"
                         data-message-type="video">
                        <div class="message-media">
                            <video src="${fileData.url}" 
                                   class="message-video" 
                                   controls 
                                   preload="metadata">
                                Your browser does not support video playback.
                            </video>
                        </div>
                        ${reactionsHtml}
                    </div>
                    <div class="swipe-reply-indicator">Reply</div>
                </div>
            `;
        } else if (isAudio) {
            return `
                <div class="message-info">
                    <div class="avatar">${messageData.username.charAt(0).toUpperCase()}</div>
                    <span class="sender-name">${this.escapeHtml(messageData.username)}</span>
                    <span class="message-time">${time}</span>
                </div>
                ${replyHtml}
                <div class="message-wrapper">
                    <div class="message media-message ${isOwn ? 'sent' : 'received'}" 
                         data-message-id="${messageData.id}"
                         data-user-id="${messageData.userId}"
                         data-message-type="audio">
                        <div class="message-media">
                            <audio src="${fileData.url}" 
                                   class="message-audio" 
                                   controls 
                                   preload="metadata">
                                Your browser does not support audio playback.
                            </audio>
                        </div>
                        ${reactionsHtml}
                    </div>
                    <div class="swipe-reply-indicator">Reply</div>
                </div>
            `;
        } else {
            // Generic file
            const fileIcon = this.getFileIcon(fileData.type);
            return `
                <div class="message-info">
                    <div class="avatar">${messageData.username.charAt(0).toUpperCase()}</div>
                    <span class="sender-name">${this.escapeHtml(messageData.username)}</span>
                    <span class="message-time">${time}</span>
                </div>
                ${replyHtml}
                <div class="message-wrapper">
                    <div class="message file-message ${isOwn ? 'sent' : 'received'}" 
                         data-message-id="${messageData.id}"
                         data-user-id="${messageData.userId}"
                         data-message-type="file"
                         onclick="window.open('${fileData.url}', '_blank')">
                        <div class="file-icon">${fileIcon}</div>
                        <div class="file-info">
                            <div class="file-name">${this.escapeHtml(fileData.name)}</div>
                            <div class="file-size">${this.formatFileSize(fileData.size)}</div>
                        </div>
                        ${reactionsHtml}
                    </div>
                    <div class="swipe-reply-indicator">Reply</div>
                </div>
            `;
        }
    }

    /**
     * Get appropriate icon for file type
     */
    getFileIcon(mimeType) {
        if (!mimeType) return '📄';
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎥';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📕';
        if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
        if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return '📦';
        if (mimeType.includes('text')) return '📝';
        return '📄';
    }

    /**
     * Create HTML for voice message
     */
    createVoiceMessageHtml(messageData, time, isOwn, replyHtml, reactionsHtml) {
        return `
            <div class="message-info">
                <div class="avatar">${messageData.username.charAt(0).toUpperCase()}</div>
                <span class="sender-name">${this.escapeHtml(messageData.username)}</span>
                <span class="message-time">${time}</span>
            </div>
            ${replyHtml}
            <div class="message-wrapper">
                <div class="message voice-message ${isOwn ? 'sent' : 'received'}"
                     data-message-id="${messageData.id}"
                     data-user-id="${messageData.userId}"
                     data-message-type="voice">
                    <div class="voice-controls">
                        <button class="play-btn" onclick="window.playAudio('${messageData.audioUrl}')">▶</button>
                        <div class="voice-waveform">
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                        </div>
                        <span class="voice-duration">Voice</span>
                    </div>
                    ${reactionsHtml}
                </div>
                <div class="swipe-reply-indicator">Reply</div>
            </div>
        `;
    }

    /**
     * Create HTML for reply indicator
     */
    createReplyHtml(replyTo) {
        return `
            <div class="reply-indicator">
                <div class="reply-to">${this.escapeHtml(replyTo.username)}</div>
                <div class="reply-preview">${this.escapeHtml(replyTo.message)}</div>
            </div>
        `;
    }

    /**
     * Create HTML for message reactions
     */
    createReactionsHtml(reactions) {
        if (!reactions || Object.keys(reactions).length === 0) return '';
        
        let reactionsHtml = '<div class="message-reactions">';
        for (const [emoji, users] of Object.entries(reactions)) {
            const isOwn = users.includes(this.socket.id);
            reactionsHtml += `
                <span class="reaction ${isOwn ? 'own-reaction' : ''}" 
                      onclick="window.prMessenger.toggleReaction('${emoji}', this)">
                    ${emoji} ${users.length}
                </span>
            `;
        }
        reactionsHtml += '</div>';
        return reactionsHtml;
    }

    /**
     * Toggle reaction on a message
     */
    toggleReaction(emoji, element) {
        const messageEl = element.closest('.message');
        const messageId = messageEl.dataset.messageId;
        
        this.socket.emit('toggle-reaction', {
            roomCode: this.currentRoom,
            messageId: messageId,
            emoji: emoji
        });
    }

    /**
     * Update message text (for editing)
     */
    updateMessage(messageId, newMessage, edited = false) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl && messageEl.dataset.messageType === 'text') {
            const reactionsEl = messageEl.querySelector('.message-reactions');
            const reactionsHtml = reactionsEl ? reactionsEl.outerHTML : '';
            
            messageEl.innerHTML = this.escapeHtml(newMessage) + 
                (edited ? '<small style="opacity: 0.6; font-size: 0.7rem;"> (edited)</small>' : '') +
                reactionsHtml;
        }
    }

    /**
     * Remove message (for deletion)
     */
    removeMessage(messageId) {
        const messageGroup = document.querySelector(`[data-message-id="${messageId}"]`)?.closest('.message-group');
        if (messageGroup) {
            messageGroup.style.opacity = '0';
            messageGroup.style.transform = 'translateY(-20px)';
            setTimeout(() => messageGroup.remove(), 300);
        }
    }

    /**
     * Update message reactions
     */
    updateMessageReactions(messageId, reactions) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            let existingReactions = messageEl.querySelector('.message-reactions');
            if (existingReactions) existingReactions.remove();
            
            const reactionsHtml = this.createReactionsHtml(reactions);
            messageEl.insertAdjacentHTML('beforeend', reactionsHtml);
        }
    }

    /**
     * Add system message
     */
    addSystemMessage(message) {
        const container = document.getElementById('messagesContainer');
        const systemMsg = document.createElement('div');
        systemMsg.className = 'system-message';
        systemMsg.textContent = message;
        container.appendChild(systemMsg);
        this.scrollToBottom();
    }

    // ═════════════════════════════════════════════════════════════════
    // TYPING INDICATOR
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Handle typing event
     */
    handleTyping() {
        if (!this.currentRoom) return;
        
        this.socket.emit('typing-start', { roomCode: this.currentRoom });
        
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.clearTyping();
        }, 1000);
    }

    /**
     * Clear typing indicator
     */
    clearTyping() {
        if (!this.currentRoom) return;
        this.socket.emit('typing-stop', { roomCode: this.currentRoom });
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator(username) {
        const indicator = document.getElementById('typingIndicator');
        const text = document.getElementById('typingText');
        text.textContent = `${username} is typing...`;
        indicator.classList.add('active');
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        indicator.classList.remove('active');
    }

    // ═════════════════════════════════════════════════════════════════
    // FILE UPLOAD
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Handle file upload
     */
    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check file size (25MB limit)
        if (file.size > 25 * 1024 * 1024) {
            this.showToast('File size must be less than 25MB', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomCode', this.currentRoom);
        formData.append('userId', this.socket.id);
        formData.append('username', this.currentUser);

        try {
            this.showToast('Uploading file...', 'info');
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                this.showToast('File sent successfully!', 'success');
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            this.showToast('Failed to upload file', 'error');
            console.error('File upload error:', error);
        }

        event.target.value = '';
    }

    // ═════════════════════════════════════════════════════════════════
    // VOICE RECORDING
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Start voice recording
     */
    async startVoiceRecording() {
        if (this.isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
                    ? 'audio/webm;codecs=opus' 
                    : 'audio/webm'
            });
            this.recordingChunks = [];
            this.recordingStartTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordingChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processVoiceRecording();
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start(100);
            this.isRecording = true;
            
            document.getElementById('voiceBtn').classList.add('recording');
            document.getElementById('recordingIndicator').classList.add('active');
            
        } catch (error) {
            this.showToast('Microphone access denied', 'error');
            console.error('Voice recording error:', error);
        }
    }

    /**
     * Stop voice recording
     */
    stopVoiceRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;

        try {
            this.mediaRecorder.stop();
        } catch (error) {
            console.error('Error stopping recording:', error);
        }
        
        this.isRecording = false;
        
        document.getElementById('voiceBtn').classList.remove('recording');
        document.getElementById('recordingIndicator').classList.remove('active');
    }

    /**
     * Process and upload voice recording
     */
    async processVoiceRecording() {
        if (this.recordingChunks.length === 0) return;

        try {
            const blob = new Blob(this.recordingChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('voice', blob, `voice-${Date.now()}.webm`);
            formData.append('roomCode', this.currentRoom);
            formData.append('userId', this.socket.id);
            formData.append('username', this.currentUser);

            const response = await fetch('/upload-voice', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                this.showToast('Voice message sent!', 'success');
            } else {
                throw new Error('Voice upload failed');
            }
        } catch (error) {
            this.showToast('Failed to send voice message', 'error');
            console.error('Voice processing error:', error);
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // ROOM MENU
    // ═════════════════════════════════════════════════════════════════
    
    showRoomMenu() {
        const modal = document.getElementById('roomMenuModal');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    hideRoomMenu() {
        const modal = document.getElementById('roomMenuModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    /**
     * Copy room code to clipboard
     */
    async copyRoomCode() {
        if (!this.currentRoom) return;
        
        try {
            await navigator.clipboard.writeText(this.currentRoom);
            this.showToast('Room code copied to clipboard!', 'success');
        } catch (error) {
            this.fallbackCopyText(this.currentRoom);
        }
        this.hideRoomMenu();
    }

    /**
     * Share room link
     */
    shareRoom() {
        if (!this.currentRoom) return;

        const roomLink = `${window.location.origin}/?room=${this.currentRoom}`;
        const shareData = {
            title: 'Join my PRMessenger room',
            text: `Join my chat room with code: ${this.currentRoom}`,
            url: roomLink
        };

        // Try native share API first
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            navigator.share(shareData)
                .then(() => {
                    this.showToast('Room shared successfully!', 'success');
                    this.hideRoomMenu();
                })
                .catch((error) => {
                    console.log('Native share failed:', error);
                    this.fallbackShare(roomLink);
                });
        } else {
            this.fallbackShare(roomLink);
        }
    }

    /**
     * Fallback share method (copy to clipboard)
     */
    fallbackShare(roomLink) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(roomLink)
                .then(() => {
                    this.showToast('Room link copied to clipboard!', 'success');
                    this.hideRoomMenu();
                })
                .catch(() => {
                    this.fallbackCopyText(roomLink);
                    this.hideRoomMenu();
                });
        } else {
            this.fallbackCopyText(roomLink);
            this.hideRoomMenu();
        }
    }

    /**
     * Update admin controls visibility
     */
    updateAdminControls() {
        const adminControls = document.getElementById('adminControls');
        if (adminControls) {
            adminControls.style.display = this.isAdmin ? 'flex' : 'none';
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // UI HELPERS
    // ═════════════════════════════════════════════════════════════════
    
    /**
     * Show chat interface (hide landing page)
     */
    showChatInterface() {
        document.getElementById('landingPage').style.display = 'none';
        document.getElementById('chatContainer').classList.add('active');
    }

    /**
     * Return to landing page
     */
    backToLanding() {
        document.getElementById('landingPage').style.display = 'flex';
        document.getElementById('chatContainer').classList.remove('active');
        
        // Reset state
        this.currentRoom = null;
        this.currentUser = null;
        this.isAdmin = false;
        this.participants = [];
        
        // Clear localStorage
        localStorage.removeItem('prmessenger_room');
        localStorage.removeItem('prmessenger_user');
        
        // Reset chat container
        const container = document.getElementById('messagesContainer');
        container.innerHTML = `
            <div class="welcome">
                <img src="https://res.cloudinary.com/df8eafxtd/image/upload/v1758912201/cropped_circle_image_foloco.png" 
                     alt="PRMessenger" 
                     class="logo">
                <h2>Welcome to PRMessenger!</h2>
                <p>Start chatting with voice messages, files, photos, and text.<br>
                   Your conversations are secure and real-time.</p>
            </div>
        `;
        
        // Clear inputs
        document.getElementById('roomCode').value = '';
        document.getElementById('username').value = '';
        
        // Reset URL
        window.history.replaceState({}, document.title, '/');
    }

    /**
     * Show loading modal
     */
    showLoading() {
        const modal = document.getElementById('loadingModal');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }

    /**
     * Hide loading modal
     */
    hideLoading() {
        const modal = document.getElementById('loadingModal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type (info, success, error)
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 12px; font-size: 1.2rem;">×</button>
            </div>
        `;
        
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (toast.parentElement) toast.remove();
                }, 300);
            }
        }, 4000);
    }

    /**
     * Validate username
     */
    validateUsername(username) {
        if (!username || username.length < 2) {
            this.showToast('Please enter a valid name (minimum 2 characters)', 'error');
            return false;
        }
        if (username.length > 20) {
            this.showToast('Name is too long (maximum 20 characters)', 'error');
            return false;
        }
        return true;
    }

    /**
     * Validate room code
     */
    validateRoomCode(roomCode) {
        if (!roomCode || roomCode.length !== 6) {
            this.showToast('Please enter a valid 6-character room code', 'error');
            return false;
        }
        return true;
    }

    /**
     * Scroll chat to bottom
     */
    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        setTimeout(() => {
            // Modern smooth scrolling with fallback
            if (container.scrollTo) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            } else {
                container.scrollTop = container.scrollHeight;
            }
        }, 10);
    }

    /**
     * Play notification sound
     */
    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.03, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            // Silently fail if audio is not supported
        }
    }

    /**
     * Auto-resize textarea as user types
     */
    autoResizeTextarea() {
        const textarea = document.getElementById('messageInput');
        if (!textarea) {
            console.warn('messageInput not found, skipping auto-resize setup');
            return;
        }
        
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ═════════════════════════════════════════════════════════════════
    // VIDEO CALL METHODS
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup video call UI event listeners
     */
    setupVideoCallListeners() {
        // End call button
        const endCallBtn = document.getElementById('endCallBtn');
        if (endCallBtn) {
            endCallBtn.addEventListener('click', () => this.endVideoCall());
        }

        // Toggle microphone
        const toggleMicBtn = document.getElementById('toggleMicBtn');
        if (toggleMicBtn) {
            toggleMicBtn.addEventListener('click', () => this.toggleMicrophone());
        }

        // Toggle camera
        const toggleCameraBtn = document.getElementById('toggleCameraBtn');
        if (toggleCameraBtn) {
            toggleCameraBtn.addEventListener('click', () => this.toggleCamera());
        }

        // Switch camera (front/back)
        const switchCameraBtn = document.getElementById('switchCameraBtn');
        if (switchCameraBtn) {
            switchCameraBtn.addEventListener('click', () => this.switchCamera());
        }

        // Accept incoming call
        const acceptCallBtn = document.getElementById('acceptCallBtn');
        if (acceptCallBtn) {
            acceptCallBtn.addEventListener('click', () => this.acceptIncomingCall());
        }

        // Reject incoming call
        const rejectCallBtn = document.getElementById('rejectCallBtn');
        if (rejectCallBtn) {
            rejectCallBtn.addEventListener('click', () => this.rejectIncomingCall());
        }

        console.log('📹 Video call listeners setup complete');
    }

    /**
     * Setup socket listeners for video call signaling
     */
    setupVideoCallSocketListeners() {
        // Incoming call request
        this.socket.on('video-call-incoming', (data) => {
            console.log('📹 Incoming video call from:', data.callerName);
            this.incomingCallerId = data.callerId;
            this.incomingCallerName = data.callerName;
            this.showIncomingCallModal(data.callerName);
        });

        // Call accepted by remote
        this.socket.on('video-call-accepted', async (data) => {
            console.log('📹 Call accepted by:', data.accepterName);
            this.showToast(`${data.accepterName} accepted your call`, 'success');
            
            // Create and send offer
            await this.createAndSendOffer(data.accepterId);
        });

        // Call rejected by remote
        this.socket.on('video-call-rejected', (data) => {
            console.log('📹 Call rejected');
            this.showToast('Call was declined', 'warning');
            this.cleanupVideoCall();
        });

        // Receive video offer
        this.socket.on('video-offer', async (data) => {
            console.log('📹 Received video offer from:', data.callerId);
            await this.handleVideoOffer(data.callerId, data.offer);
        });

        // Receive video answer
        this.socket.on('video-answer', async (data) => {
            console.log('📹 Received video answer');
            await this.handleVideoAnswer(data.answer);
        });

        // Receive ICE candidate
        this.socket.on('video-ice-candidate', async (data) => {
            await this.handleIceCandidate(data.candidate);
        });

        // Call ended by remote
        this.socket.on('video-call-ended', (data) => {
            console.log('📹 Call ended by remote');
            this.showToast('Call ended', 'info');
            this.cleanupVideoCall();
        });

        console.log('📹 Video call socket listeners setup complete');
    }

    /**
     * Initiate a video call to another user
     */
    async initiateVideoCall(targetUserId, targetUserName) {
        if (this.isInCall) {
            this.showToast('Already in a call', 'warning');
            return;
        }

        console.log('📹 Initiating video call to:', targetUserName);
        
        try {
            // Get local media first
            await this.startLocalStream();
            
            this.callTargetUserId = targetUserId;
            this.callTargetUserName = targetUserName;
            this.isInCall = true;

            // Show video call UI with calling state
            this.showVideoCallUI(targetUserName, 'Calling...');

            // Send call request via socket
            this.socket.emit('video-call-request', {
                targetUserId: targetUserId,
                roomCode: this.currentRoom
            });

            this.showToast(`Calling ${targetUserName}...`, 'info');
        } catch (error) {
            console.error('Failed to start video call:', error);
            this.showToast('Failed to access camera/microphone', 'error');
            this.cleanupVideoCall();
        }
    }

    /**
     * Start local media stream
     */
    async startLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: this.currentFacingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }

            console.log('📹 Local stream started');
        } catch (error) {
            console.error('Failed to get local stream:', error);
            throw error;
        }
    }

    /**
     * Create RTCPeerConnection and add local stream
     */
    createPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.peerConnection = new RTCPeerConnection(this.rtcConfig);

        // Add local tracks to connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle incoming remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('📹 Received remote track');
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                this.remoteStream = event.streams[0];
                
                // Hide call status when video starts
                const callStatus = document.getElementById('videoCallStatus');
                if (callStatus) callStatus.classList.add('hidden');
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const targetId = this.callTargetUserId || this.incomingCallerId;
                this.socket.emit('video-ice-candidate', {
                    targetUserId: targetId,
                    candidate: event.candidate
                });
            }
        };

        // Connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('📹 Connection state:', this.peerConnection.connectionState);
            
            const callState = document.getElementById('callState');
            switch (this.peerConnection.connectionState) {
                case 'connecting':
                    if (callState) callState.textContent = 'Connecting...';
                    break;
                case 'connected':
                    if (callState) callState.textContent = 'Connected';
                    break;
                case 'disconnected':
                case 'failed':
                    this.showToast('Call connection lost', 'error');
                    this.cleanupVideoCall();
                    break;
            }
        };

        console.log('📹 Peer connection created');
    }

    /**
     * Create and send WebRTC offer
     */
    async createAndSendOffer(targetUserId) {
        try {
            this.createPeerConnection();
            
            const offer = await this.peerConnection.createOffer({
                offerToReceiveVideo: true,
                offerToReceiveAudio: true
            });
            
            await this.peerConnection.setLocalDescription(offer);

            this.socket.emit('video-offer', {
                targetUserId: targetUserId,
                offer: offer
            });

            console.log('📹 Offer sent');
        } catch (error) {
            console.error('Failed to create offer:', error);
            this.showToast('Failed to establish call', 'error');
            this.cleanupVideoCall();
        }
    }

    /**
     * Handle incoming video offer
     */
    async handleVideoOffer(callerId, offer) {
        try {
            this.createPeerConnection();
            this.callTargetUserId = callerId;
            
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('video-answer', {
                targetUserId: callerId,
                answer: answer
            });

            console.log('📹 Answer sent');
        } catch (error) {
            console.error('Failed to handle offer:', error);
            this.showToast('Failed to connect call', 'error');
            this.cleanupVideoCall();
        }
    }

    /**
     * Handle incoming video answer
     */
    async handleVideoAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('📹 Remote description set');
        } catch (error) {
            console.error('Failed to handle answer:', error);
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    async handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    /**
     * Show incoming call modal
     */
    showIncomingCallModal(callerName) {
        const modal = document.getElementById('incomingCallModal');
        const avatarEl = document.getElementById('incomingCallAvatar');
        const nameEl = document.getElementById('incomingCallerName');

        if (avatarEl) avatarEl.textContent = callerName.charAt(0).toUpperCase();
        if (nameEl) nameEl.textContent = callerName;
        if (modal) {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }

        // Play ringtone (optional - using oscillator)
        this.playRingtone();
    }

    /**
     * Hide incoming call modal
     */
    hideIncomingCallModal() {
        const modal = document.getElementById('incomingCallModal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
        this.stopRingtone();
    }

    /**
     * Accept incoming call
     */
    async acceptIncomingCall() {
        if (!this.incomingCallerId) return;

        console.log('📹 Accepting call from:', this.incomingCallerName);
        this.hideIncomingCallModal();

        try {
            await this.startLocalStream();
            
            this.callTargetUserId = this.incomingCallerId;
            this.callTargetUserName = this.incomingCallerName;
            this.isInCall = true;

            this.showVideoCallUI(this.incomingCallerName, 'Connecting...');

            // Send accept via socket
            this.socket.emit('video-call-accept', {
                callerId: this.incomingCallerId,
                roomCode: this.currentRoom
            });

        } catch (error) {
            console.error('Failed to accept call:', error);
            this.showToast('Failed to access camera/microphone', 'error');
            this.rejectIncomingCall();
        }
    }

    /**
     * Reject incoming call
     */
    rejectIncomingCall() {
        console.log('📹 Rejecting call');
        this.hideIncomingCallModal();

        if (this.incomingCallerId) {
            this.socket.emit('video-call-reject', {
                callerId: this.incomingCallerId,
                roomCode: this.currentRoom
            });
        }

        this.incomingCallerId = null;
        this.incomingCallerName = null;
    }

    /**
     * End current video call
     */
    endVideoCall() {
        console.log('📹 Ending video call');

        const targetId = this.callTargetUserId || this.incomingCallerId;
        if (targetId) {
            this.socket.emit('video-call-end', {
                targetUserId: targetId
            });
        }

        this.cleanupVideoCall();
        this.showToast('Call ended', 'info');
    }

    /**
     * Show video call UI
     */
    showVideoCallUI(userName, status) {
        const container = document.getElementById('videoCallContainer');
        const avatarEl = document.getElementById('callAvatar');
        const nameEl = document.getElementById('callUserName');
        const stateEl = document.getElementById('callState');
        const statusEl = document.getElementById('videoCallStatus');

        if (avatarEl) avatarEl.textContent = userName.charAt(0).toUpperCase();
        if (nameEl) nameEl.textContent = userName;
        if (stateEl) stateEl.textContent = status;
        if (statusEl) statusEl.classList.remove('hidden');

        if (container) {
            container.classList.add('active');
            container.setAttribute('aria-hidden', 'false');
        }

        // Reset control button states
        this.isMuted = false;
        this.isCameraOff = false;
        this.updateControlButtons();
    }

    /**
     * Hide video call UI
     */
    hideVideoCallUI() {
        const container = document.getElementById('videoCallContainer');
        if (container) {
            container.classList.remove('active');
            container.setAttribute('aria-hidden', 'true');
        }
    }

    /**
     * Toggle microphone
     */
    toggleMicrophone() {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.isMuted = !audioTrack.enabled;
            this.updateControlButtons();
        }
    }

    /**
     * Toggle camera
     */
    toggleCamera() {
        if (!this.localStream) return;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.isCameraOff = !videoTrack.enabled;
            this.updateControlButtons();
        }
    }

    /**
     * Switch between front and back camera
     */
    async switchCamera() {
        if (!this.localStream) return;

        this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';

        try {
            // Stop current video track
            const currentVideoTrack = this.localStream.getVideoTracks()[0];
            if (currentVideoTrack) {
                currentVideoTrack.stop();
            }

            // Get new stream with different camera
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: this.currentFacingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            const newVideoTrack = newStream.getVideoTracks()[0];

            // Replace track in local stream
            this.localStream.removeTrack(currentVideoTrack);
            this.localStream.addTrack(newVideoTrack);

            // Replace track in peer connection
            if (this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(newVideoTrack);
                }
            }

            // Update local video element
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }

            this.showToast(`Switched to ${this.currentFacingMode === 'user' ? 'front' : 'back'} camera`, 'success');
        } catch (error) {
            console.error('Failed to switch camera:', error);
            this.showToast('Failed to switch camera', 'error');
        }
    }

    /**
     * Update control button visual states
     */
    updateControlButtons() {
        const micBtn = document.getElementById('toggleMicBtn');
        const micIcon = document.getElementById('micIcon');
        const cameraBtn = document.getElementById('toggleCameraBtn');
        const cameraIcon = document.getElementById('cameraIcon');

        if (micBtn) {
            micBtn.classList.toggle('active', this.isMuted);
        }
        if (micIcon) {
            micIcon.textContent = this.isMuted ? '🔇' : '🎤';
        }

        if (cameraBtn) {
            cameraBtn.classList.toggle('active', this.isCameraOff);
        }
        if (cameraIcon) {
            cameraIcon.textContent = this.isCameraOff ? '📷' : '📹';
        }
    }

    /**
     * Cleanup video call resources
     */
    cleanupVideoCall() {
        console.log('📹 Cleaning up video call');

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Stop local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Clear remote stream
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = null;
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = null;
        }

        // Reset state
        this.isInCall = false;
        this.callTargetUserId = null;
        this.callTargetUserName = null;
        this.incomingCallerId = null;
        this.incomingCallerName = null;
        this.isMuted = false;
        this.isCameraOff = false;

        // Hide UI
        this.hideVideoCallUI();
        this.hideIncomingCallModal();
        this.stopRingtone();
    }

    /**
     * Play ringtone for incoming call
     */
    playRingtone() {
        try {
            // Create simple ringtone using Web Audio API
            this.ringtoneContext = new (window.AudioContext || window.webkitAudioContext)();
            this.ringtoneInterval = setInterval(() => {
                const oscillator = this.ringtoneContext.createOscillator();
                const gainNode = this.ringtoneContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.ringtoneContext.destination);
                
                oscillator.frequency.value = 440;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, this.ringtoneContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.ringtoneContext.currentTime + 0.5);
                
                oscillator.start(this.ringtoneContext.currentTime);
                oscillator.stop(this.ringtoneContext.currentTime + 0.5);
            }, 1000);
        } catch (error) {
            console.warn('Could not play ringtone:', error);
        }
    }

    /**
     * Stop ringtone
     */
    stopRingtone() {
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = null;
        }
        if (this.ringtoneContext) {
            this.ringtoneContext.close();
            this.ringtoneContext = null;
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // CUSTOM MODAL SYSTEM (replaces prompt/confirm)
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup custom modal event listeners
     */
    setupCustomModal() {
        const modal = document.getElementById('customModal');
        const backdrop = document.getElementById('customModalBackdrop');
        const closeBtn = document.getElementById('customModalClose');
        const cancelBtn = document.getElementById('customModalCancel');
        const confirmBtn = document.getElementById('customModalConfirm');

        if (!modal) return;

        backdrop?.addEventListener('click', () => this.closeModal(false));
        closeBtn?.addEventListener('click', () => this.closeModal(false));
        cancelBtn?.addEventListener('click', () => this.closeModal(false));
        confirmBtn?.addEventListener('click', () => this.closeModal(true));

        // Enter key submits, Escape cancels
        document.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('active')) return;
            if (e.key === 'Enter') this.closeModal(true);
            if (e.key === 'Escape') this.closeModal(false);
        });
    }

    /**
     * Show custom confirm dialog
     */
    showConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('customModal');
            const titleEl = document.getElementById('customModalTitle');
            const msgEl = document.getElementById('customModalMessage');
            const inputEl = document.getElementById('customModalInput');
            
            if (!modal) { resolve(confirm(message)); return; }

            titleEl.textContent = title;
            msgEl.textContent = message;
            inputEl.classList.add('hidden');
            
            this.modalResolve = resolve;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        });
    }

    /**
     * Show custom prompt dialog
     */
    showPrompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('customModal');
            const titleEl = document.getElementById('customModalTitle');
            const msgEl = document.getElementById('customModalMessage');
            const inputEl = document.getElementById('customModalInput');
            
            if (!modal) { resolve(prompt(message, defaultValue)); return; }

            titleEl.textContent = title;
            msgEl.textContent = message;
            inputEl.classList.remove('hidden');
            inputEl.value = defaultValue;
            
            this.modalResolve = resolve;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            setTimeout(() => inputEl.focus(), 100);
        });
    }

    /**
     * Close custom modal and resolve promise
     */
    closeModal(confirmed) {
        const modal = document.getElementById('customModal');
        const inputEl = document.getElementById('customModalInput');
        
        if (!modal) return;

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');

        if (this.modalResolve) {
            if (inputEl && !inputEl.classList.contains('hidden')) {
                this.modalResolve(confirmed ? inputEl.value : null);
            } else {
                this.modalResolve(confirmed);
            }
            this.modalResolve = null;
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // THEME SYSTEM
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup theme system
     */
    setupThemeSystem() {
        // Apply saved theme
        this.applyTheme(this.currentTheme);

        const themeBtn = document.getElementById('themeBtn');
        const closeBtn = document.getElementById('closeThemePanel');
        const themeOptions = document.querySelectorAll('.theme-option');
        const applyCustomBtn = document.getElementById('applyCustomTheme');

        themeBtn?.addEventListener('click', () => this.toggleThemePanel());
        closeBtn?.addEventListener('click', () => this.hideThemePanel());

        themeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                this.applyTheme(theme);
                this.updateThemeButtons(theme);
            });
        });

        applyCustomBtn?.addEventListener('click', () => this.applyCustomTheme());
    }

    toggleThemePanel() {
        const panel = document.getElementById('themePanel');
        panel?.classList.toggle('active');
    }

    hideThemePanel() {
        document.getElementById('themePanel')?.classList.remove('active');
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        localStorage.setItem('prmessenger_theme', theme);
        this.updateThemeButtons(theme);
    }

    updateThemeButtons(activeTheme) {
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === activeTheme);
        });
    }

    applyCustomTheme() {
        const primary = document.getElementById('customPrimaryColor')?.value || '#4A90E2';
        const bg = document.getElementById('customBgColor')?.value || '#0a0a0a';
        
        document.documentElement.style.setProperty('--primary', primary);
        document.documentElement.style.setProperty('--surface-dark', bg);
        document.documentElement.setAttribute('data-theme', 'custom');
        this.showToast('Custom theme applied!', 'success');
        this.hideThemePanel();
    }

    // ═════════════════════════════════════════════════════════════════
    // MESSAGE SEARCH
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup search panel
     */
    setupSearchPanel() {
        const searchBtn = document.getElementById('searchBtn');
        const closeBtn = document.getElementById('closeSearchPanel');
        const searchInput = document.getElementById('searchInput');

        searchBtn?.addEventListener('click', () => this.toggleSearchPanel());
        closeBtn?.addEventListener('click', () => this.hideSearchPanel());

        searchInput?.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounce);
            this.searchDebounce = setTimeout(() => {
                this.performSearch(e.target.value);
            }, 300);
        });
    }

    toggleSearchPanel() {
        const panel = document.getElementById('searchPanel');
        panel?.classList.toggle('active');
        if (panel?.classList.contains('active')) {
            document.getElementById('searchInput')?.focus();
        }
    }

    hideSearchPanel() {
        document.getElementById('searchPanel')?.classList.remove('active');
    }

    performSearch(query) {
        const resultsEl = document.getElementById('searchResults');
        if (!resultsEl) return;

        if (!query.trim()) {
            resultsEl.innerHTML = '<div class="search-placeholder">Enter text to search messages</div>';
            return;
        }

        const messages = document.querySelectorAll('.message[data-message-type="text"]');
        const results = [];

        messages.forEach(msg => {
            const text = msg.textContent.toLowerCase();
            if (text.includes(query.toLowerCase())) {
                const group = msg.closest('.message-group');
                const sender = group?.querySelector('.sender-name')?.textContent || 'Unknown';
                const time = group?.querySelector('.message-time')?.textContent || '';
                results.push({ 
                    id: msg.dataset.messageId, 
                    text: msg.textContent.substring(0, 100),
                    sender, 
                    time,
                    query 
                });
            }
        });

        if (results.length === 0) {
            resultsEl.innerHTML = '<div class="search-placeholder">No messages found</div>';
            return;
        }

        resultsEl.innerHTML = results.map(r => `
            <div class="search-result-item" data-message-id="${r.id}">
                <div class="search-result-user">${this.escapeHtml(r.sender)}</div>
                <div class="search-result-text">${this.highlightText(r.text, r.query)}</div>
                <div class="search-result-time">${r.time}</div>
            </div>
        `).join('');

        resultsEl.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const msgEl = document.querySelector(`[data-message-id="${item.dataset.messageId}"]`);
                if (msgEl) {
                    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    msgEl.style.animation = 'pulse 1s ease';
                    setTimeout(() => msgEl.style.animation = '', 1000);
                }
                this.hideSearchPanel();
            });
        });
    }

    highlightText(text, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return this.escapeHtml(text).replace(regex, '<mark>$1</mark>');
    }

    // ═════════════════════════════════════════════════════════════════
    // IMAGE GALLERY
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup image gallery
     */
    setupGallery() {
        const galleryBtn = document.getElementById('galleryBtn');
        const closeBtn = document.getElementById('closeGallery');
        const prevBtn = document.getElementById('galleryPrev');
        const nextBtn = document.getElementById('galleryNext');

        galleryBtn?.addEventListener('click', () => this.openGallery());
        closeBtn?.addEventListener('click', () => this.closeGallery());
        prevBtn?.addEventListener('click', () => this.galleryPrev());
        nextBtn?.addEventListener('click', () => this.galleryNext());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            const gallery = document.getElementById('imageGallery');
            if (!gallery?.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') this.galleryPrev();
            if (e.key === 'ArrowRight') this.galleryNext();
            if (e.key === 'Escape') this.closeGallery();
        });
    }

    openGallery() {
        // Collect all images from messages
        const images = document.querySelectorAll('.message-image');
        this.galleryImages = Array.from(images).map(img => ({
            url: img.src,
            alt: img.alt
        }));

        if (this.galleryImages.length === 0) {
            this.showToast('No images in this chat yet', 'info');
            return;
        }

        this.galleryIndex = 0;
        this.updateGalleryView();
        document.getElementById('imageGallery')?.classList.add('active');
    }

    closeGallery() {
        document.getElementById('imageGallery')?.classList.remove('active');
    }

    galleryPrev() {
        if (this.galleryImages.length === 0) return;
        this.galleryIndex = (this.galleryIndex - 1 + this.galleryImages.length) % this.galleryImages.length;
        this.updateGalleryView();
    }

    galleryNext() {
        if (this.galleryImages.length === 0) return;
        this.galleryIndex = (this.galleryIndex + 1) % this.galleryImages.length;
        this.updateGalleryView();
    }

    updateGalleryView() {
        const img = document.getElementById('galleryImage');
        const counter = document.getElementById('galleryCounter');
        const thumbsContainer = document.getElementById('galleryThumbnails');

        if (img && this.galleryImages[this.galleryIndex]) {
            img.src = this.galleryImages[this.galleryIndex].url;
            img.alt = this.galleryImages[this.galleryIndex].alt;
        }

        if (counter) {
            counter.textContent = `${this.galleryIndex + 1} / ${this.galleryImages.length}`;
        }

        if (thumbsContainer) {
            thumbsContainer.innerHTML = this.galleryImages.map((img, i) => `
                <img class="gallery-thumbnail ${i === this.galleryIndex ? 'active' : ''}" 
                     src="${img.url}" 
                     alt="${img.alt}"
                     data-index="${i}">
            `).join('');

            thumbsContainer.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    this.galleryIndex = parseInt(thumb.dataset.index);
                    this.updateGalleryView();
                });
            });
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // ROOM ANALYTICS
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup analytics panel
     */
    setupAnalytics() {
        const menuBtn = document.getElementById('menuBtn');
        const closeBtn = document.getElementById('closeAnalytics');

        // Add analytics button to room menu (triggered via menu)
        closeBtn?.addEventListener('click', () => this.hideAnalytics());
        
        // Track messages for analytics
        this.socket?.on('message', (data) => {
            this.trackMessage(data);
        });
    }

    showAnalytics() {
        this.updateAnalyticsData();
        const panel = document.getElementById('analyticsPanel');
        panel?.classList.add('active');
    }

    hideAnalytics() {
        document.getElementById('analyticsPanel')?.classList.remove('active');
    }

    trackMessage(data) {
        this.roomAnalytics.messages++;
        if (data.type === 'file') this.roomAnalytics.media++;
        if (data.type === 'voice') this.roomAnalytics.voice++;
        
        if (!this.roomAnalytics.users[data.username]) {
            this.roomAnalytics.users[data.username] = 0;
        }
        this.roomAnalytics.users[data.username]++;
    }

    updateAnalyticsData() {
        // Count from DOM
        const messages = document.querySelectorAll('.message-group').length;
        const media = document.querySelectorAll('.message-image, .message-video').length;
        const voice = document.querySelectorAll('.voice-message').length;
        const participants = this.participants?.length || 0;

        document.getElementById('statTotalMessages').textContent = messages;
        document.getElementById('statParticipants').textContent = participants;
        document.getElementById('statMediaFiles').textContent = media;
        document.getElementById('statVoiceMessages').textContent = voice;

        // User list
        const userListEl = document.getElementById('analyticsUserList');
        if (userListEl && this.participants) {
            userListEl.innerHTML = this.participants.map(p => `
                <div class="analytics-user-item">
                    <div class="analytics-user-avatar">${p.username.charAt(0).toUpperCase()}</div>
                    <div class="analytics-user-name">${this.escapeHtml(p.username)}</div>
                    <div class="analytics-user-messages">${this.roomAnalytics.users[p.username] || 0} msgs</div>
                </div>
            `).join('');
        }

        // Activity chart (simple bars)
        const chartEl = document.getElementById('activityChart');
        if (chartEl) {
            const bars = Array(12).fill(0).map(() => Math.random() * 80 + 10);
            chartEl.innerHTML = bars.map(h => `<div class="chart-bar" style="height: ${h}%"></div>`).join('');
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // SCREEN SHARING
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup screen share button
     */
    setupScreenShare() {
        // Add screen share button dynamically if not present
        const controls = document.querySelector('.video-call-controls');
        if (controls && !document.getElementById('screenShareBtn')) {
            const btn = document.createElement('button');
            btn.className = 'video-control-btn';
            btn.id = 'screenShareBtn';
            btn.setAttribute('aria-label', 'Share screen');
            btn.setAttribute('title', 'Share Screen');
            btn.innerHTML = '<span class="control-icon">🖥️</span>';
            btn.addEventListener('click', () => this.toggleScreenShare());
            controls.insertBefore(btn, controls.querySelector('.end-call'));
        }
    }

    async toggleScreenShare() {
        if (this.isScreenSharing) {
            await this.stopScreenShare();
        } else {
            await this.startScreenShare();
        }
    }

    async startScreenShare() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });

            const screenTrack = screenStream.getVideoTracks()[0];
            
            if (this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(screenTrack);
                }
            }

            // Update local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = screenStream;
            }

            // Handle when user stops sharing via browser UI
            screenTrack.onended = () => this.stopScreenShare();

            this.isScreenSharing = true;
            this.screenStream = screenStream;
            
            const btn = document.getElementById('screenShareBtn');
            if (btn) btn.classList.add('active');
            
            this.showToast('Screen sharing started', 'success');
        } catch (error) {
            console.error('Screen share error:', error);
            if (error.name !== 'NotAllowedError') {
                this.showToast('Failed to share screen', 'error');
            }
        }
    }

    async stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }

        // Restore camera
        if (this.localStream && this.peerConnection) {
            const cameraTrack = this.localStream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender && cameraTrack) {
                await sender.replaceTrack(cameraTrack);
            }
            
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
        }

        this.isScreenSharing = false;
        this.screenStream = null;
        
        const btn = document.getElementById('screenShareBtn');
        if (btn) btn.classList.remove('active');
        
        this.showToast('Screen sharing stopped', 'info');
    }

    // ═════════════════════════════════════════════════════════════════
    // PUSH NOTIFICATIONS
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup enhanced push notifications
     */
    setupPushNotifications() {
        if (!('Notification' in window)) return;

        // Request permission after user interaction
        document.body.addEventListener('click', () => {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }, { once: true });
    }

    /**
     * Send push notification
     */
    sendNotification(title, body, data = {}) {
        if (Notification.permission !== 'granted') return;
        if (document.visibilityState === 'visible') return; // Don't notify if tab is active

        const notification = new Notification(title, {
            body: body,
            icon: 'https://res.cloudinary.com/df8eafxtd/image/upload/v1758912201/cropped_circle_image_foloco.png',
            badge: 'https://res.cloudinary.com/df8eafxtd/image/upload/v1758912201/cropped_circle_image_foloco.png',
            tag: data.tag || 'prmessenger',
            requireInteraction: false,
            vibrate: [200, 100, 200]
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        setTimeout(() => notification.close(), 5000);
    }

    // ═════════════════════════════════════════════════════════════════
    // E2E ENCRYPTION (Web Crypto API)
    // ═════════════════════════════════════════════════════════════════

    /**
     * Setup encryption system
     */
    async setupEncryption() {
        // Check if Web Crypto API is available
        if (!window.crypto || !window.crypto.subtle) {
            console.warn('Web Crypto API not available, encryption disabled');
            return;
        }

        try {
            // Generate key pair for this session
            this.keyPair = await this.generateKeyPair();
            console.log('🔐 Encryption keys generated');
        } catch (error) {
            console.error('Failed to setup encryption:', error);
        }
    }

    /**
     * Generate RSA-OAEP key pair for key exchange
     */
    async generateKeyPair() {
        return await window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Generate AES-GCM room key for symmetric encryption
     */
    async generateRoomKey() {
        return await window.crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Export public key to share with peers
     */
    async exportPublicKey(key) {
        const exported = await window.crypto.subtle.exportKey('spki', key);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Import peer's public key
     */
    async importPublicKey(base64Key) {
        const keyData = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            'spki',
            keyData,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            true,
            ['encrypt']
        );
    }

    /**
     * Encrypt message with room key (AES-GCM)
     */
    async encryptMessage(message) {
        if (!this.encryptionEnabled || !this.roomKey) {
            return { encrypted: false, data: message };
        }

        try {
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encoder = new TextEncoder();
            const data = encoder.encode(message);

            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                this.roomKey,
                data
            );

            return {
                encrypted: true,
                data: this.arrayBufferToBase64(encrypted),
                iv: this.arrayBufferToBase64(iv)
            };
        } catch (error) {
            console.error('Encryption failed:', error);
            return { encrypted: false, data: message };
        }
    }

    /**
     * Decrypt message with room key (AES-GCM)
     */
    async decryptMessage(encryptedData, ivBase64) {
        if (!this.roomKey) {
            return encryptedData;
        }

        try {
            const encrypted = this.base64ToArrayBuffer(encryptedData);
            const iv = this.base64ToArrayBuffer(ivBase64);

            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                this.roomKey,
                encrypted
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            return '[Encrypted message - decryption failed]';
        }
    }

    /**
     * Enable encryption for current room
     */
    async enableEncryption() {
        try {
            this.roomKey = await this.generateRoomKey();
            this.encryptionEnabled = true;
            this.showToast('🔐 End-to-end encryption enabled', 'success');
            
            // Share room key with peers (would need server-side key exchange)
            if (this.keyPair) {
                const publicKeyBase64 = await this.exportPublicKey(this.keyPair.publicKey);
                this.socket.emit('share-public-key', {
                    roomCode: this.currentRoom,
                    publicKey: publicKeyBase64
                });
            }
        } catch (error) {
            console.error('Failed to enable encryption:', error);
            this.showToast('Failed to enable encryption', 'error');
        }
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Check if encryption is available and enabled
     */
    isEncryptionAvailable() {
        return !!(window.crypto && window.crypto.subtle);
    }
}

// ═════════════════════════════════════════════════════════════════════
// GLOBAL FUNCTIONS
// ═════════════════════════════════════════════════════════════════════

/**
 * Play audio from URL (used for voice messages)
 */
window.playAudio = function(audioUrl) {
    const audio = new Audio(audioUrl);
    audio.play().catch(error => {
        console.error('Audio play error:', error);
    });
};

// ═════════════════════════════════════════════════════════════════════
// INITIALIZE APP
// ═════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    window.prMessenger = new PRMessengerApp();
    console.log('✅ PRMessenger app ready!');
});
