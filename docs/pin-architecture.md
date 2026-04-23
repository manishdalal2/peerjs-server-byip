# PIN Architecture

Explains how PINs work in Share by Air — where they are stored, how they protect connections, and what is (and is not) exposed via API.

## What the PIN does

A PIN lets a peer reject incoming connections from anyone who doesn't know it. It acts as a door lock — the server checks the key before the destination peer even knows someone tried to connect.

## Setting your PIN

```
User types PIN in sidebar → clicks Save
        │
        │  WebSocket: SET-PEER-PROFILE { name, pin }
        ▼
Server (webSocketServer/index.ts)
        └─ client.setPin(pin)   ← stored in Client object in RAM only

        Also:
        localStorage.setItem('peerProfilePin', pin)  ← remembered locally for next session
```

Two separate things happen:
1. **Server RAM** — holds the PIN for the duration of your WebSocket session, used to gate incoming connections
2. **localStorage** — stores the PIN so the input is pre-filled next time you open the app

## How the PIN gates a connection

When peer B tries to connect to peer A, the WebRTC handshake goes through the signaling server:

```
Peer B                      Server                      Peer A
   │                           │                           │
   │── OFFER (metadata.pin) ──►│                           │
   │                           │  destinationClient        │
   │                           │    .getPin()              │
   │                           │                           │
   │                           │  PIN match?               │
   │                           │                           │
   │                    YES ───┼──── forward OFFER ───────►│
   │                    NO  ───┼──── send ERROR back       │
   │◄── ERROR ─────────────────│                           │
```

The server is the gatekeeper. Peer A never sees the failed attempt. Peer A's PIN never travels over the network to peer B.

This check happens on **every WebRTC OFFER** — DataConnections (chat/files), audio calls, and screen share — enforced in `src/messageHandler/handlers/transmission/index.ts`:

```ts
if (type === MessageType.OFFER) {
  const expectedPin  = destinationClient.getPin()
  const requestedPin = getRequestedPin(message.payload)   // reads metadata.pin

  if (expectedPin && requestedPin !== expectedPin) {
    client?.send({ type: MessageType.ERROR, payload: { msg: 'Invalid PIN' } })
    return true  // block — OFFER never forwarded
  }
}
```

## Where the PIN is stored

| Location | What's stored | Lifetime |
|---|---|---|
| Server RAM (`Client.pin`) | The actual PIN string | Until WebSocket disconnects or server restarts |
| Client localStorage | The actual PIN string | Until user clears browser data |
| Any database | Nothing | Never written |
| Any API response | Never — only `hasPin: bool` | N/A |

## What the API exposes

Every endpoint that returns peer data uses `serializePeer()`:

```ts
// src/api/v1/public/index.ts
function serializePeer(client) {
  return {
    id:          client.getId(),
    alias:       client.getAlias(),
    name:        client.getName(),
    displayName: client.getDisplayName(),
    hasPin:      client.getPin() !== null,  // boolean only — never the actual PIN
  }
}
```

Full endpoint audit:

| Endpoint | Returns | PIN exposed? |
|---|---|---|
| `GET /peerjs/id` | Random peer ID string | No |
| `GET /peerjs/peers` | Array of peer ID strings | No |
| `GET /peerjs/by-ip` | `serializePeer()` per peer on same IP | No — `hasPin: bool` only |
| `GET /peerjs/groups` | Same, grouped by IP | No — also requires `PEERJS_GROUPS_TOKEN` header |

There is **no endpoint that exposes actual PIN values**.

## What IS visible to others on the network

`/peerjs/by-ip` returns peer IDs and display names of everyone on the same Wi-Fi. This is intentional — it powers peer discovery. The PIN protects the connection itself but does not hide that you exist on the network.

## Known limitation — server restart

Because PINs live only in server RAM, a server restart wipes all PINs. Anyone who connects after a restart can reach you until you click **Save** again in the sidebar to re-register your PIN with the server. localStorage still has the PIN value, so it will re-appear in the input on next open — the user just needs to hit Save.

## Client-side PIN storage (connecting to others)

When you connect to a PIN-protected peer, the PIN you enter is stored in a module-level Map in `usePeer.js`:

```js
const peerPins = new Map()  // Map<peerId, pinString>
```

This is held in memory only — cleared on page refresh or when you close a conversation. It is reused automatically for calls and screen share to that peer so you are not prompted again mid-session.

## Relevant source files

| File | Role |
|---|---|
| `src/messageHandler/handlers/transmission/index.ts` | Enforces PIN check on every OFFER |
| `src/services/webSocketServer/index.ts` | `_handleProfileUpdate()` — stores PIN on client object |
| `src/models/client.ts` | `Client.pin` field — in-memory only |
| `src/api/v1/public/index.ts` | `serializePeer()` — never exposes PIN value |
| `ui/src/composables/usePeer.js` | `peerPins` Map, `sendProfileUpdate()`, `connectTo()` |
| `ui/src/stores/peers.js` | `pin` ref persisted to localStorage |
