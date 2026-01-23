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
        
        this.init();
    }

    // ═════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════════════════════════════
    
    init() {
        this.setupEventListeners();
        this.setupSocketListeners();
        this.setupPWA();
        this.autoResizeTextarea();
        this.setupMessageInteractions();
        this.setupSidebarToggle();
        this.setupParticipantSearch();
        this.checkExistingRoom();
        this.startHeartbeat();
        console.log('✅ PRMessenger initialized');
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
            `;
            
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
     */
    handleEdit() {
        const messageEl = document.querySelector(`[data-message-id="${this.currentMessageId}"]`);
        if (!messageEl) return;
        
        const currentText = this.currentMessageText;
        const newMessage = prompt('Edit message:', currentText);
        
        if (newMessage && newMessage.trim() && newMessage.trim() !== currentText) {
            this.socket.emit('edit-message', {
                roomCode: this.currentRoom,
                messageId: this.currentMessageId,
                newMessage: newMessage.trim()
            });
        }
        this.hideContextMenu();
    }

    /**
     * Handle delete action from context menu
     */
    handleDelete() {
        if (confirm('Delete this message? This action cannot be undone.')) {
            this.socket.emit('delete-message', {
                roomCode: this.currentRoom,
                messageId: this.currentMessageId
            });
        }
        this.hideContextMenu();
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
            
            // Notification for messages from others
            if (message.userId !== this.socket.id) {
                this.playNotificationSound();
                
                // Desktop notification if tab is hidden
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification('New message in PRMessenger', {
                        body: `${message.username}: ${message.message}`,
                        icon: '/logo192.png'
                    });
                }
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
            const fileData = JSON.parse(messageData.message);
            messageContent = this.createFileMessageHtml(messageData, fileData, time, isOwn, replyHtml, reactionsHtml);
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
        document.getElementById('roomMenuModal').classList.add('active');
    }

    hideRoomMenu() {
        document.getElementById('roomMenuModal').classList.remove('active');
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
        document.getElementById('loadingModal').classList.add('active');
    }

    /**
     * Hide loading modal
     */
    hideLoading() {
        document.getElementById('loadingModal').classList.remove('active');
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
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
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
