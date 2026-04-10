## HTTP API

The API methods available on `YOUR_ROOT_PATH` + `path` option from config.

So, the base path should be like `http://127.0.0.1:9000/` or `http://127.0.0.1:9000/myapp/` if `path` option was set to `/myapp`.

Endpoints:

- GET `/` - return a JSON to test the server.

This group of methods uses `:key` option from config:

- GET `/:key/id` - return a new user id. required `:key` from config.
- GET `/:key/peers` - return an array of all connected users. required `:key` from config. **IMPORTANT:** You should set `allow_discovery` to `true` in config to enable this method. It disabled by default.
- GET `/:key/by-ip` - return peers grouped to the same normalized client IP as the caller. **IMPORTANT:** You should set `allow_discovery` to `true` in config to enable this method.
- GET `/:key/groups` - return all IP groups for debugging. This endpoint also requires the `PEERJS_GROUPS_TOKEN` environment variable and a matching token in either the `x-peerjs-groups-token` header or `?token=...` query string.

## Discovery payloads

The `/:key/by-ip` endpoint returns an array of peer objects shaped like:

```json
[
	{
		"id": "peer-id",
		"alias": "Bright Banana",
		"name": "Alice",
		"displayName": "Alice",
		"hasPin": true
	}
]
```

Field meanings:

- `alias`: random fallback alias assigned when the peer first connects
- `name`: optional user-defined editable name
- `displayName`: effective display label, resolved as `name || alias || id`
- `hasPin`: whether the peer currently requires a PIN before a connection can be established

## Optional peer PIN behavior

PIN enforcement is handled on the websocket signaling path, not by the HTTP API.

To update a connected peer's profile, the client can send:

```json
{
	"type": "SET-PEER-PROFILE",
	"payload": {
		"name": "Alice",
		"pin": "1234"
	}
}
```

If `pin` is omitted or blank, the peer remains open for incoming connections.

To connect to a PIN-protected peer with PeerJS, include the PIN in the initial connection metadata:

```javascript
peer.connect(targetPeerId, {
	metadata: { pin: "1234" },
});
```

If the PIN is missing or wrong, the caller receives a websocket `ERROR` message with:
 
```json
{
	"type": "ERROR",
	"payload": {
		"msg": "Invalid PIN provided for peer connection"
	}
}
```
