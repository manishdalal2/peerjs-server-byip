import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExpressPeerServer } from "./dist/module.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = process.env.PORT || 9000;

const app = express();

// Serve static files from the client folder (for assets like ring.mp3)
app.use("/client", express.static(path.join(__dirname, "client")));

// Serve index.html at the root so browsing to the site loads the client UI
app.get("/", (_req, res) => {
	res.sendFile(path.join(__dirname, "index.html"));
});

const server = http.createServer(app);

const peerServer = ExpressPeerServer(server, {
	path: "/",
	allow_discovery: true,
	corsOptions: { origin: true },
});

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
