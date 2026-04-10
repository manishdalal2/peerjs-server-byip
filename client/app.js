// ── Config ────────────────────────────────────────────────────────────────────
const SERVER_HOST   = window.location.hostname;
const SERVER_PORT   = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
const SERVER_PATH   = '/';
const SERVER_KEY    = 'peerjs';
const SERVER_SECURE = window.location.protocol === 'https:';
const CHUNK_SIZE    = 16 * 1024;          // 16 KB – safe for WebRTC SCTP
const BUF_HIGH      = 1 * 1024 * 1024;   // pause sending above 1 MB buffered
const BUF_LOW       = 256 * 1024;        // resume once buffer drains to 256 KB

// ── State ─────────────────────────────────────────────────────────────────────
let peer        = null;
let conn        = null;
let myPeerId    = null;
let availPeers  = new Map();
let connectedId = null;
let stagedFile  = null;

// Receive state
let recvMeta  = null;   // { name, size, fileType }
let recvChunks = [];
let recvBytes  = 0;
let recvMsgEl  = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const headerPeerId = $('headerPeerId');
const serverBadge  = $('serverBadge');
const myAliasEl    = $('myAliasEl');
const myPeerIdFull = $('myPeerIdFull');
const displayNameInput = $('displayNameInput');
const pinInput = $('pinInput');
const saveProfileBtn = $('saveProfileBtn');
const peerListEl   = $('peerList');
const refreshBtn   = $('refreshBtn');
const manualIdEl   = $('manualId');
const manualBtn    = $('manualBtn');
const connDot      = $('connDot');
const connName     = $('connName');
const overlay      = $('overlay');
const chatMsgs     = $('chatMsgs');
const emptyChat    = $('emptyChat');
const msgInput     = $('msgInput');
const sendBtn      = $('sendBtn');
const statusBar    = $('statusBar');
const fileInput    = $('fileInput');
const attachBtn    = $('attachBtn');
const stagedWrap   = $('stagedWrap');
const stagedIcon   = $('stagedIcon');
const stagedName   = $('stagedName');
const stagedSize   = $('stagedSize');
const clearStaged  = $('clearStaged');
const mobileMenuBtn = $('mobileMenuBtn');
const mobileOverlay = $('mobileOverlay');
const notificationSound = $('notificationSound');

// ── Utilities ─────────────────────────────────────────────────────────────────
const setStatus = msg => { statusBar.textContent = msg; };

let audioReady = false;

function primeAudio() {
    if (audioReady || !notificationSound) return;
    // Try to unlock audio by playing it muted
    notificationSound.volume = 0;
    notificationSound.play().then(() => {
        notificationSound.pause();
        notificationSound.currentTime = 0;
        notificationSound.volume = 1;
        audioReady = true;
    }).catch(() => {
        // Still locked, will try again on next interaction
    });
}

function playNotification() {
    if (!notificationSound) return;
    
    // Try to prime if not ready yet
    if (!audioReady) {
        primeAudio();
    }
    
    notificationSound.currentTime = 0;
    notificationSound.volume = 1;
    notificationSound.play().catch(err => {
        // If it fails, try to prime for next time
        if (!audioReady) {
            primeAudio();
        }
    });
}

function fmt(bytes) {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

function fileEmoji(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg','bmp','heic'].includes(ext)) return '🖼️';
    if (['mp4','mov','avi','mkv','webm'].includes(ext))                     return '🎬';
    if (['mp3','wav','ogg','flac','aac','m4a'].includes(ext))               return '🎵';
    if (ext === 'pdf')                                                       return '📕';
    if (['zip','rar','7z','tar','gz','bz2'].includes(ext))                  return '📦';
    if (['js','ts','py','java','cpp','c','go','rs','html','css','json','sh','rb'].includes(ext)) return '💻';
    if (['doc','docx','odt','pages'].includes(ext))                         return '📝';
    if (['xls','xlsx','csv','numbers'].includes(ext))                       return '📊';
    return '📄';
}

function nowTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearEmpty() {
    const el = $('emptyChat');
    if (el) el.remove();
}

function scrollMsgs() {
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// ── Server / connection badges ────────────────────────────────────────────────
function setServerConnected(yes) {
    serverBadge.textContent = yes ? '● Connected' : '○ Disconnected';
    serverBadge.className = 'server-badge ' + (yes ? 'connected' : 'disconnected');
}

function setPeerConnected(peerId, displayName, alias) {
    connectedId = peerId;
    const label = displayName ? `${displayName}${alias ? ` (${alias})` : ''}` : (alias || peerId.slice(0, 12) + '…');
    connName.textContent = label;
    connDot.className = 'conn-dot on';
    overlay.style.display = 'none';
    document.querySelectorAll('.peer-item').forEach(el =>
        el.classList.toggle('active', el.dataset.pid === peerId));
    setStatus(`Connected to ${displayName || alias || peerId}`);
    playNotification();
}

function setPeerDisconnected() {
    connectedId = null;
    conn = null;
    connName.textContent = 'No one — select a peer';
    connDot.className = 'conn-dot';
    overlay.style.display = 'flex';
    document.querySelectorAll('.peer-item').forEach(el => el.classList.remove('active'));
}

// ── Peer list ─────────────────────────────────────────────────────────────────
function renderPeers() {
    const peers = Array.from(availPeers.values());
    if (!peers.length) {
        peerListEl.innerHTML = '<div class="no-peers">No other peers on your network</div>';
        return;
    }
    peerListEl.innerHTML = '';
    peers.forEach(p => {
        const div = document.createElement('div');
        div.className = 'peer-item' + (p.id === connectedId ? ' active' : '');
        div.dataset.pid = p.id;
        div.innerHTML = `
            <div class="peer-item-name">${escHtml(p.displayName || p.alias || 'Unknown')}</div>
            <div class="peer-item-id">${p.id}</div>
            <div class="peer-item-dot">● ${p.hasPin ? 'PIN required' : 'Available'}</div>
        `;
        div.addEventListener('click', () => connectTo(p.id, p.displayName || p.alias, p.hasPin));
        peerListEl.appendChild(div);
    });
}

function getProfileSocket() {
    return peer?.socket?._socket ?? null;
}

function saveProfileToStorage(name, pin) {
    localStorage.setItem('peerProfileName', name || '');
    localStorage.setItem('peerProfilePin', pin || '');
}

function loadProfileFromStorage() {
    displayNameInput.value = localStorage.getItem('peerProfileName') || '';
    pinInput.value = localStorage.getItem('peerProfilePin') || '';
}

function sendProfileUpdate() {
    const ws = getProfileSocket();
    if (!ws || ws.readyState !== 1) {
        setStatus('Profile will sync once the server connection is ready');
        return false;
    }

    const payload = {
        type: 'SET-PEER-PROFILE',
        payload: {
            name: displayNameInput.value.trim(),
            pin: pinInput.value.trim()
        }
    };

    ws.send(JSON.stringify(payload));
    saveProfileToStorage(payload.payload.name, payload.payload.pin);
    myAliasEl.textContent = payload.payload.name || myAliasEl.textContent;
    setStatus('Profile updated');
    return true;
}

async function loadPeers() {
    try {
        const res = await fetch(`/${SERVER_KEY}/by-ip`);
        if (!res.ok) throw new Error(res.status);
        const list = await res.json();
        availPeers.clear();
        list.forEach(p => {
            if (p.id === myPeerId) {
                myAliasEl.textContent = p.displayName || p.alias || '—';
            } else {
                availPeers.set(p.id, p);
            }
        });
        renderPeers();
        setStatus(`Found ${availPeers.size} peer(s) on your network`);
    } catch {
        peerListEl.innerHTML = '<div class="no-peers">⚠️ Cannot reach server</div>';
        setStatus('Could not load peer list');
    }
}

// ── Real-time IP-group events ─────────────────────────────────────────────────
function listenForIPGroupEvents() {
    if (!peer?.socket?._socket) { setTimeout(listenForIPGroupEvents, 400); return; }
    const ws   = peer.socket._socket;
    const orig = ws.onmessage;
    ws.onmessage = function(evt) {
        try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'PEER-JOINED-IP-GROUP') {
                const p = msg.payload;
                if (p.id !== myPeerId) { availPeers.set(p.id, p); renderPeers(); setStatus(`${p.displayName || p.alias} joined`); }
            } else if (msg.type === 'PEER-LEFT-IP-GROUP') {
                const p = msg.payload;
                if (p.id !== myPeerId) { availPeers.delete(p.id); renderPeers(); setStatus(`${p.displayName || p.alias} left`); }
            } else if (msg.type === 'PEER-METADATA-UPDATED') {
                const p = msg.payload;
                if (p.id === myPeerId) {
                    myAliasEl.textContent = p.displayName || p.alias || '—';
                } else {
                    availPeers.set(p.id, p);
                    renderPeers();
                    setStatus(`${p.displayName || p.alias} updated their profile`);
                }
            }
        } catch {}
        if (orig) orig.call(this, evt);
    };
}

// ── Connection ────────────────────────────────────────────────────────────────
function wireConn(c) {
    conn = c;
    conn.on('open', () => {
        const p = availPeers.get(c.peer);
        setPeerConnected(c.peer, p?.displayName ?? null, p?.alias ?? null);
    });
    conn.on('data',  handleData);
    conn.on('close', () => { setStatus('Peer disconnected'); setPeerDisconnected(); });
    conn.on('error', err => setStatus('Connection error: ' + err));
}

function connectTo(peerId, alias, hasPin) {
    if (peerId === myPeerId) { setStatus('Cannot connect to yourself!'); return; }
    if (conn) conn.close();
    
    // Prime audio on connection attempt (user interaction)
    primeAudio();
    
    const pin = hasPin ? window.prompt(`Enter PIN for ${alias || peerId}`) : '';
    if (hasPin && pin === null) {
        setStatus('Connection cancelled');
        return;
    }
    setStatus(`Connecting to ${alias || peerId}…`);
    // serialization:'raw' bypasses binarypack entirely.
    // Binary data arrives as ArrayBuffer (not Blob/Uint8Array), strings arrive as strings.
    // This is the only reliable mode for chunked binary transfer.
    const c = peer.connect(peerId, {
        reliable: true,
        serialization: 'raw',
        metadata: pin ? { pin: pin.trim() } : undefined
    });
    wireConn(c);
}

// ── Incoming data ─────────────────────────────────────────────────────────────
// With serialization:'raw', PeerJS delivers:
//   - strings   → exactly as sent (we use JSON.stringify for control messages)
//   - binary    → always ArrayBuffer (binaryType is set to 'arraybuffer' by PeerJS raw mode)
// No async needed here, so no interleaving risk between concurrent chunk callbacks.
function handleData(data) {
    if (data instanceof ArrayBuffer) {
        onChunk(data);
        return;
    }
    if (typeof data === 'string') {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        switch (msg.type) {
            case 'chat':       addTextMsg(msg.text, false); break;
            case 'file-start': onFileStart(msg);            break;
            case 'file-end':   onFileEnd();                 break;
        }
    }
}

// ── Chat messages ─────────────────────────────────────────────────────────────
function addTextMsg(text, local) {
    clearEmpty();
    const d = document.createElement('div');
    d.className = 'msg ' + (local ? 'local' : 'remote');
    d.innerHTML = `<div>${escHtml(text)}</div><div class="msg-time">${nowTime()}</div>`;
    chatMsgs.appendChild(d);
    scrollMsgs();
    if (!local) playNotification();
}

// ── File messages (inline in chat) ────────────────────────────────────────────
function makeFileMsgEl(name, size, local) {
    clearEmpty();
    const d = document.createElement('div');
    d.className = 'file-msg ' + (local ? 'local' : 'remote');
    d.innerHTML = `
        <div class="file-msg-top">
            <div class="file-msg-icon">${fileEmoji(name)}</div>
            <div>
                <div class="file-msg-name">${escHtml(name)}</div>
                <div class="file-msg-size">${fmt(size)}</div>
            </div>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:0%"></div></div>
        <div class="prog-label">Starting…</div>
        <div class="file-msg-done" style="display:none"></div>
        <div class="msg-time">${nowTime()}</div>
    `;
    chatMsgs.appendChild(d);
    scrollMsgs();
    return d;
}

function setFileProg(msgEl, pct, sentBytes, totalBytes) {
    msgEl.querySelector('.prog-fill').style.width  = pct + '%';
    msgEl.querySelector('.prog-label').textContent = `${pct}%  (${fmt(sentBytes)} / ${fmt(totalBytes)})`;
}

function setFileDone(msgEl, label) {
    msgEl.querySelector('.prog-track').style.display = 'none';
    msgEl.querySelector('.prog-label').style.display  = 'none';
    const done = msgEl.querySelector('.file-msg-done');
    done.style.display = 'block';
    done.textContent   = label;
}

// ── File send ─────────────────────────────────────────────────────────────────
// Sends file in CHUNK_SIZE pieces. Backpressure is checked immediately before
// every conn.send(buf) call so the SCTP send buffer never overflows.
async function doSendFile(file) {
    sendBtn.disabled = true;
    const msgEl = makeFileMsgEl(file.name, file.size, true);

    // Control messages are JSON strings (required by serialization:'raw')
    conn.send(JSON.stringify({ type: 'file-start', name: file.name, size: file.size, fileType: file.type }));

    // Grab the underlying RTCDataChannel for backpressure.
    // PeerJS 1.x stores it as _dc; set the low-water mark once up front.
    const dc = conn._dc ?? null;
    if (dc) dc.bufferedAmountLowThreshold = BUF_LOW;

    let offset = 0;

    while (offset < file.size) {
        const end = Math.min(offset + CHUNK_SIZE, file.size);
        const buf = await file.slice(offset, end).arrayBuffer();

        // Backpressure: wait for the send buffer to drain BEFORE this send,
        // not before the slice read — this is the correct placement.
        if (dc && dc.bufferedAmount > BUF_HIGH) {
            await new Promise(resolve => {
                dc.addEventListener('bufferedamountlow', resolve, { once: true });
            });
        }

        conn.send(buf);
        offset = end;

        setFileProg(msgEl, Math.round((offset / file.size) * 100), offset, file.size);

        // Yield so the browser can process incoming events between chunks
        await new Promise(r => setTimeout(r, 0));
    }

    conn.send(JSON.stringify({ type: 'file-end' }));
    setFileDone(msgEl, '✓ Sent');
    setStatus(`Sent: ${file.name}`);
    sendBtn.disabled = false;
}

// ── File receive ──────────────────────────────────────────────────────────────
function onFileStart(meta) {
    recvMeta   = { name: meta.name, size: meta.size, fileType: meta.fileType };
    recvChunks = [];
    recvBytes  = 0;
    recvMsgEl  = makeFileMsgEl(meta.name, meta.size, false);
    setStatus(`Receiving: ${meta.name}…`);
    playNotification();
}

function onChunk(buf) {
    if (!recvMeta) return;
    recvChunks.push(buf);
    recvBytes += buf.byteLength;
    const pct = Math.min(100, Math.round((recvBytes / recvMeta.size) * 100));
    setFileProg(recvMsgEl, pct, recvBytes, recvMeta.size);
}

function onFileEnd() {
    if (!recvMeta) return;
    const blob = new Blob(recvChunks, { type: recvMeta.fileType || 'application/octet-stream' });
    const name = recvMeta.name;

    setFileDone(recvMsgEl, '✓ Saved to Downloads');
    autoDownload(blob, name);
    setStatus(`Received: ${name}`);

    recvMeta   = null;
    recvChunks = [];
    recvBytes  = 0;
    recvMsgEl  = null;
}

// Trigger browser download automatically — no user click needed
function autoDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── Staged file (attachment) ──────────────────────────────────────────────────
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) stageFile(fileInput.files[0]);
});

function stageFile(file) {
    stagedFile = file;
    stagedIcon.textContent = fileEmoji(file.name);
    stagedName.textContent = file.name;
    stagedSize.textContent = fmt(file.size);
    stagedWrap.style.display = 'flex';
    attachBtn.classList.add('staged');
    msgInput.placeholder = 'Add a caption or just hit Send…';
}

function clearStagedFile() {
    stagedFile = null;
    stagedWrap.style.display = 'none';
    attachBtn.classList.remove('staged');
    fileInput.value = '';
    msgInput.placeholder = 'Type a message…';
}

clearStaged.addEventListener('click', clearStagedFile);

// ── Send (text and/or file) ───────────────────────────────────────────────────
function send() {
    if (!conn?.open) return;
    const text = msgInput.value.trim();

    if (text) {
        conn.send(JSON.stringify({ type: 'chat', text }));
        addTextMsg(text, true);
        msgInput.value = '';
    }

    if (stagedFile) {
        const file = stagedFile;
        clearStagedFile();
        doSendFile(file); // async — runs in background
    }
}

sendBtn.addEventListener('click', send);
msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) send(); });

// ── PeerJS init ───────────────────────────────────────────────────────────────
function init() {
    setStatus('Connecting to local server…');
    loadProfileFromStorage();
    
    // Try to prime audio early
    setTimeout(primeAudio, 100);

    peer = new Peer({
        host:   SERVER_HOST,
        port:   SERVER_PORT,
        path:   SERVER_PATH,
        key:    SERVER_KEY,
        secure: SERVER_SECURE,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', id => {
        myPeerId = id;
        headerPeerId.textContent = id.slice(0, 8) + '…';
        myPeerIdFull.textContent = id;
        setServerConnected(true);
        setStatus('Connected to server — discovering peers…');
        loadPeers();
        listenForIPGroupEvents();
        setTimeout(() => { sendProfileUpdate(); }, 300);
        // Prime audio when peer connection is ready
        primeAudio();
    });

    peer.on('connection', c => {
        // Prime audio when receiving incoming connection
        primeAudio();
        wireConn(c);
        setStatus(`Incoming connection from ${c.peer}`);
    });

    peer.on('disconnected', () => {
        setServerConnected(false);
        setStatus('Disconnected — reconnecting…');
        peer.reconnect();
    });

    peer.on('close', () => {
        setServerConnected(false);
        setPeerDisconnected();
    });

    peer.on('error', err => {
        setServerConnected(false);
        setStatus('Error: ' + (err.type || err));
        if (['network','server-error'].includes(err.type)) {
            peerListEl.innerHTML = '<div class="no-peers">⚠️ Server not reachable</div>';
        }
    });
}

// ── Sidebar controls ──────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', () => {
    refreshBtn.textContent = '↻ …';
    loadPeers().finally(() => { refreshBtn.textContent = '↻ Refresh'; });
});

manualBtn.addEventListener('click', () => {
    const id = manualIdEl.value.trim();
    if (id) { connectTo(id, null, false); manualIdEl.value = ''; }
});
manualIdEl.addEventListener('keydown', e => { if (e.key === 'Enter') manualBtn.click(); });
saveProfileBtn.addEventListener('click', () => { sendProfileUpdate(); });
displayNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendProfileUpdate(); });
pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendProfileUpdate(); });

// ── Mobile menu controls ──────────────────────────────────────────────────────
if (mobileMenuBtn && mobileOverlay) {
    mobileMenuBtn.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.toggle('mobile-open');
        mobileOverlay.classList.toggle('active');
    });

    mobileOverlay.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.remove('mobile-open');
        mobileOverlay.classList.remove('active');
    });

    // Close sidebar when a peer is selected on mobile
    peerListEl.addEventListener('click', (e) => {
        if (e.target.closest('.peer-item') && window.innerWidth <= 768) {
            setTimeout(() => {
                const sidebar = document.querySelector('.sidebar');
                sidebar.classList.remove('mobile-open');
                mobileOverlay.classList.remove('active');
            }, 200);
        }
    });
}

window.addEventListener('beforeunload', () => { conn?.close(); peer?.destroy(); });
window.addEventListener('load', init);

// Prime audio on any user interaction to handle autoplay policies.
// Keep listening (no `once`) so repeated interactions retry until audio is unlocked.
['click', 'keydown', 'touchstart'].forEach(event => {
    document.addEventListener(event, primeAudio, { passive: true });
});
