import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExpressPeerServer } from "./dist/module.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = process.env.PORT || 9000;

const app = express();

// Serve the Vite build output (run `npm run ui:build` to generate)
app.use(express.static(path.join(__dirname, "public")));

// SPA fallback — send index.html for any non-API route
app.get("/", (_req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Defensive fallback for POST /share — in normal operation the service worker
// intercepts this before it reaches Express. This handles the SW-not-yet-installed case.
app.post("/share", (_req, res) => res.redirect(303, "/"));

const server = http.createServer(app);

const peerServer = ExpressPeerServer(server, {
	path: "/",
	allow_discovery: true,
	corsOptions: { origin: true },
});

// Block the global peer list — not used by the app and exposes all connected peer IDs.
// /by-ip is still available (same-network discovery) and /groups is token-protected.
app.get("/peerjs/peers", (_req, res) => res.sendStatus(404));

app.use(peerServer);

server.listen(port, () => {
	console.log(`PeerServer + static site running on port ${port}`);
});

peerServer.on("connection", (client) => {
	console.log(`Client connected: ${client.getId()}`);
});

peerServer.on("disconnect", (client) => {
	console.log(`Client disconnected: ${client.getId()}`);
});
