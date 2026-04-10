![node](https://img.shields.io/node/v/peer-by-ip)
[![npm version](https://badge.fury.io/js/peer-by-ip.svg)](https://www.npmjs.com/package/peer-by-ip)
[![Downloads](https://img.shields.io/npm/dm/peer-by-ip.svg)](https://www.npmjs.com/package/peer-by-ip)

# PeerServer: A server for PeerJS (IP-Based Discovery Fork)

PeerServer helps establishing connections between PeerJS clients. Data is not proxied through the server.

**This fork adds IP-based peer discovery**, allowing peers to only discover and connect with other peers on the same network/IP address.

## Local web app and Azure deployment

This repository can also be run as a single web app that serves both:

- the PeerJS signaling server
- the browser client in `index.html`

Use:

```sh
npm run build
npm start
```

The `start` script runs `server.js`, which:

- serves `index.html` at `/`
- mounts the PeerJS server at `/peerjs`
- uses `process.env.PORT` when available, which makes it compatible with Azure App Service

The browser client is configured for same-origin deployment. It derives its host, port, and protocol from `window.location`, so the same `index.html` works both locally and on Azure without hard-coded hostnames.

When deploying to Azure App Service, configure the app startup command as:

```sh
npm start
```

The Azure deployment workflow in this repository deploys the full app artifact, not just `dist/`, because runtime files such as `server.js` and `index.html` live at the repository root.

## Usage

### Run server

#### Natively

If you don't want to develop anything, just enter few commands below.

1. Install the package globally:
   ```sh
   $ npm install peer-by-ip -g
   ```
2. Run the server:

   ```sh
   $ peerjs --port 9000 --key peerjs --path /myapp

     Started PeerServer on ::, port: 9000, path: /myapp
   ```

3. Check it: http://127.0.0.1:9000/myapp It should returns JSON with name, description and website fields.

### Connecting to the server from client PeerJS:

```html
<script>
	const peer = new Peer("someid", {
		host: "localhost",
		port: 9000,
		path: "/myapp",
	});
</script>
```

For same-origin browser deployments, you can also derive the connection settings from the current page URL:

```html
<script>
	const peer = new Peer({
		host: window.location.hostname,
		port: Number(window.location.port) || (window.location.protocol === "https:" ? 443 : 80),
		path: "/",
		key: "peerjs",
		secure: window.location.protocol === "https:",
	});
</script>
```

## Config / CLI options

You can provide config object to `PeerServer` function or specify options for `peerjs` CLI.

| CLI option               | JS option          | Description                                                                                                                                                                                                                                           | Required |  Default   |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :--------: |
| `--port, -p`             | `port`             | Port to listen (number)                                                                                                                                                                                                                               | **Yes**  |            |
| `--key, -k`              | `key`              | Connection key (string). Client must provide it to call API methods                                                                                                                                                                                   |    No    | `"peerjs"` |
| `--path`                 | `path`             | Path (string). The server responds for requests to the root URL + path. **E.g.** Set the `path` to `/myapp` and run server on 9000 port via `peerjs --port 9000 --path /myapp` Then open http://127.0.0.1:9000/myapp - you should see a JSON reponse. |    No    |   `"/"`    |
| `--proxied`              | `proxied`          | Set `true` if PeerServer stays behind a reverse proxy (boolean)                                                                                                                                                                                       |    No    |  `false`   |
| `--expire_timeout, -t`   | `expire_timeout`   | The amount of time after which a message sent will expire, the sender will then receive a `EXPIRE` message (milliseconds).                                                                                                                            |    No    |   `5000`   |
| `--alive_timeout`        | `alive_timeout`    | Timeout for broken connection (milliseconds). If the server doesn't receive any data from client (includes `pong` messages), the client's connection will be destroyed.                                                                               |    No    |  `60000`   |
| `--concurrent_limit, -c` | `concurrent_limit` | Maximum number of clients' connections to WebSocket server (number)                                                                                                                                                                                   |    No    |   `5000`   |
| `--sslkey`               | `sslkey`           | Path to SSL key (string)                                                                                                                                                                                                                              |    No    |            |
| `--sslcert`              | `sslcert`          | Path to SSL certificate (string)                                                                                                                                                                                                                      |    No    |            |
| `--allow_discovery`      | `allow_discovery`  | Allow to use GET `/peers` http API method to get an array of ids of all connected clients (boolean)                                                                                                                                                   |    No    |            |
| `--cors`                 | `corsOptions`      | The CORS origins that can access this server                                                                                                                                                                                                          |
|                          | `generateClientId` | A function which generate random client IDs when calling `/id` API method (`() => string`)                                                                                                                                                            |    No    | `uuid/v4`  |

## Using HTTPS

Simply pass in PEM-encoded certificate and key.

```javascript
const fs = require("fs");
const { PeerServer } = require("peer");

const peerServer = PeerServer({
	port: 9000,
	ssl: {
		key: fs.readFileSync("/path/to/your/ssl/key/here.key"),
		cert: fs.readFileSync("/path/to/your/ssl/certificate/here.crt"),
	},
});
```

You can also pass any other [SSL options accepted by https.createServer](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistenerfrom), such as `SNICallback:

```javascript
const fs = require("fs");
const { PeerServer } = require("peer");

const peerServer = PeerServer({
	port: 9000,
	ssl: {
		SNICallback: (servername, cb) => {
			// your code here ....
		},
	},
});
```

## Running PeerServer behind a reverse proxy

Make sure to set the `proxied` option, otherwise IP based limiting will fail.
The option is passed verbatim to the
[expressjs `trust proxy` setting](http://expressjs.com/4x/api.html#app-settings)
if it is truthy.

```javascript
const { PeerServer } = require("peer");

const peerServer = PeerServer({
	port: 9000,
	path: "/myapp",
	proxied: true,
});
```

## Custom client ID generation

By default, PeerServer uses `uuid/v4` npm package to generate random client IDs.

You can set `generateClientId` option in config to specify a custom function to generate client IDs.

```javascript
const { PeerServer } = require("peer");

const customGenerationFunction = () =>
	(Math.random().toString(36) + "0000000000000000000").substr(2, 16);

const peerServer = PeerServer({
	port: 9000,
	path: "/myapp",
	generateClientId: customGenerationFunction,
});
```

Open http://127.0.0.1:9000/myapp/peerjs/id to see a new random id.

## Combining with existing express app

```javascript
const express = require("express");
const { ExpressPeerServer } = require("peer-by-ip");

const app = express();

app.get("/", (req, res, next) => res.send("Hello world!"));

// =======

const server = app.listen(9000);

const peerServer = ExpressPeerServer(server, {
	path: "/myapp",
});

app.use("/peerjs", peerServer);

// == OR ==

const http = require("http");

const server = http.createServer(app);
const peerServer = ExpressPeerServer(server, {
	debug: true,
	path: "/myapp",
});

app.use("/peerjs", peerServer);

server.listen(9000);

// ========
```

Open the browser and check http://127.0.0.1:9000/peerjs/myapp

## Events

The `'connection'` event is emitted when a peer connects to the server.

```javascript
peerServer.on('connection', (client) => { ... });
```

The `'disconnect'` event is emitted when a peer disconnects from the server or
when the peer can no longer be reached.

```javascript
peerServer.on('disconnect', (client) => { ... });
```

## HTTP API

Read [/src/api/README.md](src/api/README.md)

### IP-based discovery notes

The `/peerjs/by-ip` endpoint groups clients by normalized client IP.

When the server is deployed behind a proxy such as Azure App Service, forwarded addresses may include a port suffix. This fork strips that port before grouping, so addresses such as `108.245.18.61:53600` and `108.245.18.61:54918` are treated as the same IP group.

### Debug endpoint protection

The `/peerjs/groups` endpoint is intended only for debugging.

It is disabled by default and returns `404` unless the `PEERJS_GROUPS_TOKEN` environment variable is set.

If you enable it, requests must include the token either as:

- header `x-peerjs-groups-token`
- query string `?token=...`

Example:

```sh
curl -H "x-peerjs-groups-token: YOUR_SECRET" http://127.0.0.1:9000/peerjs/groups
```

## Running tests

```sh
$ npm test
```

## Running in Google App Engine

Google App Engine will create an HTTPS certificate for you automatically,
making this by far the easiest way to deploy PeerJS in the Google Cloud
Platform.

1. Create a `package.json` file for GAE to read:

```sh
echo "{}" > package.json
npm install express@latest peer@latest
```

2. Create an `app.yaml` file to configure the GAE application.

```yaml
runtime: nodejs

# Flex environment required for WebSocket support, which is required for PeerJS.
env: flex

# Limit resources to one instance, one CPU, very little memory or disk.
manual_scaling:
  instances: 1
resources:
  cpu: 1
  memory_gb: 0.5
  disk_size_gb: 0.5
```

3. Create `server.js` (which node will run by default for the `start` script):

```js
const express = require("express");
const { ExpressPeerServer } = require("peer-by-ip");
const app = express();

app.enable("trust proxy");

const PORT = process.env.PORT || 9000;
const server = app.listen(PORT, () => {
	console.log(`App listening on port ${PORT}`);
	console.log("Press Ctrl+C to quit.");
});

const peerServer = ExpressPeerServer(server, {
	path: "/",
});

app.use("/", peerServer);

module.exports = app;
```

4. Deploy to an existing GAE project (assuming you are already logged in via
   `gcloud`), replacing `YOUR-PROJECT-ID-HERE` with your particular project ID:

```sh
gcloud app deploy --project=YOUR-PROJECT-ID-HERE --promote --quiet app.yaml
```

## Privacy

See [PRIVACY.md](./PRIVACY.md)

## Problems?

Please post any bugs as a [Github issue](https://github.com/manishdalal2/peerjs-server-byip/issues).
