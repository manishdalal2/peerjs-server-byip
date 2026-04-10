import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import type WebSocket from "ws";
import { Errors, MessageType } from "../../enums.ts";
import type { IClient } from "../../models/client.ts";
import { Client } from "../../models/client.ts";
import type { IConfig } from "../../config/index.ts";
import type { IRealm } from "../../models/realm.ts";
import { WebSocketServer as Server } from "ws";
import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";
import { IMessage } from "../../models/message.js";
import { generateAlias } from "../../utils/aliasGenerator.ts";

export interface IWebSocketServer extends EventEmitter {
	readonly path: string;
}

function normalizeClientIp(ip: string): string {
	const trimmedIp = ip.trim();

	if (trimmedIp.startsWith("[") && trimmedIp.includes("]")) {
		return trimmedIp.slice(1, trimmedIp.indexOf("]"));
	}

	const lastColonIndex = trimmedIp.lastIndexOf(":");
	if (lastColonIndex !== -1) {
		const maybePort = trimmedIp.slice(lastColonIndex + 1);
		const beforeColon = trimmedIp.slice(0, lastColonIndex);

		if (/^\d+$/.test(maybePort) && beforeColon.includes(".")) {
			return beforeColon;
		}
	}

	return trimmedIp;
}

type CustomConfig = Pick<
	IConfig,
	"path" | "key" | "concurrent_limit" | "createWebSocketServer"
>;

const WS_PATH = "peerjs";

interface ClientProfilePayload {
	name?: unknown;
	pin?: unknown;
}

function normalizeProfileName(name: unknown): string {
	return typeof name === "string" ? name.trim().slice(0, 50) : "";
}

function normalizeProfilePin(pin: unknown): string | null {
	if (typeof pin !== "string") {
		return null;
	}

	const trimmedPin = pin.trim();

	return trimmedPin ? trimmedPin.slice(0, 50) : null;
}

export class WebSocketServer extends EventEmitter implements IWebSocketServer {
	public readonly path: string;
	private readonly realm: IRealm;
	private readonly config: CustomConfig;
	public readonly socketServer: Server;

	constructor({
		server,
		realm,
		config,
	}: {
		server: HttpServer | HttpsServer;
		realm: IRealm;
		config: CustomConfig;
	}) {
		super();

		this.setMaxListeners(0);

		this.realm = realm;
		this.config = config;

		const path = this.config.path;
		this.path = `${path}${path.endsWith("/") ? "" : "/"}${WS_PATH}`;

		const options: WebSocket.ServerOptions = {
			path: this.path,
			server,
		};

		this.socketServer = config.createWebSocketServer
			? config.createWebSocketServer(options)
			: new Server(options);

		this.socketServer.on("connection", (socket, req) => {
			this._onSocketConnection(socket, req);
		});
		this.socketServer.on("error", (error: Error) => {
			this._onSocketError(error);
		});
	}

	private _onSocketConnection(socket: WebSocket, req: IncomingMessage): void {
		// An unhandled socket error might crash the server. Handle it first.
		socket.on("error", (error) => {
			this._onSocketError(error);
		});

		// Extract IP address (handle proxied requests)
		const forwardedFor = req.headers["x-forwarded-for"];
		let ip = req.socket.remoteAddress ?? "unknown";
		
		if (forwardedFor) {
			const forwardedIp = Array.isArray(forwardedFor) 
				? forwardedFor[0] ?? ""
				: forwardedFor;
			const firstIp = forwardedIp.split(",")[0];
			if (firstIp) {
				ip = normalizeClientIp(firstIp);
			}
		}

		ip = normalizeClientIp(ip);

		// We are only interested in the query, the base url is therefore not relevant
		const { searchParams } = new URL(req.url ?? "", "https://peerjs");
		const { id, token, key } = Object.fromEntries(searchParams.entries());

		if (!id || !token || !key) {
			this._sendErrorAndClose(socket, Errors.INVALID_WS_PARAMETERS);
			return;
		}

		if (key !== this.config.key) {
			this._sendErrorAndClose(socket, Errors.INVALID_KEY);
			return;
		}

		const client = this.realm.getClientById(id);

		if (client) {
			if (token !== client.getToken()) {
				// ID-taken, invalid token
				socket.send(
					JSON.stringify({
						type: MessageType.ID_TAKEN,
						payload: { msg: "ID is taken" },
					}),
				);

				socket.close();
				return;
			}

			this._configureWS(socket, client);
			return;
		}

		this._registerClient({ socket, id, token, ip });
	}

	private _onSocketError(error: Error): void {
		// handle error
		this.emit("error", error);
	}

	private _buildPeerPayload(client: IClient): {
		id: string;
		alias: string;
		name: string;
		displayName: string;
		hasPin: boolean;
		ip: string;
	} {
		return {
			id: client.getId(),
			alias: client.getAlias(),
			name: client.getName(),
			displayName: client.getDisplayName(),
			hasPin: client.getPin() !== null,
			ip: client.getIpAddress(),
		};
	}

	private _handleProfileUpdate(client: IClient, payload: ClientProfilePayload): void {
		client.setName(normalizeProfileName(payload.name));
		client.setPin(normalizeProfilePin(payload.pin));

		const clientIp = client.getIpAddress();
		if (!clientIp) {
			return;
		}

		this._notifyIpGroup(clientIp, client.getId(), {
			type: MessageType.PEER_METADATA_UPDATED,
			payload: this._buildPeerPayload(client),
		});
	}

	private _registerClient({
		socket,
		id,
		token,
		ip,
	}: {
		socket: WebSocket;
		id: string;
		token: string;
		ip: string;
	}): void {
		// Check concurrent limit
		const clientsCount = this.realm.getClientsIds().length;

		if (clientsCount >= this.config.concurrent_limit) {
			this._sendErrorAndClose(socket, Errors.CONNECTION_LIMIT_EXCEED);
			return;
		}

		const newClient: IClient = new Client({ id, token });
		newClient.setIpAddress(ip);
		newClient.setAlias(generateAlias());
		this.realm.setClient(newClient, id);
		socket.send(JSON.stringify({ type: MessageType.OPEN }));

		this._configureWS(socket, newClient);

		// Notify other clients in the same IP group about the new peer
		this._notifyIpGroup(ip, newClient.getId(), {
			type: MessageType.PEER_JOINED_IP_GROUP,
			payload: this._buildPeerPayload(newClient),
		});
	}

	private _configureWS(socket: WebSocket, client: IClient): void {
		client.setSocket(socket);

		// Cleanup after a socket closes.
		socket.on("close", () => {
			if (client.getSocket() === socket) {
				const clientIp = client.getIpAddress();
				const clientId = client.getId();
				const peerPayload = this._buildPeerPayload(client);

				this.realm.removeClientById(clientId);

				// Notify other clients in the same IP group about the peer leaving
				if (clientIp) {
					this._notifyIpGroup(clientIp, clientId, {
						type: MessageType.PEER_LEFT_IP_GROUP,
						payload: peerPayload,
					});
				}

				this.emit("close", client);
			}
		});

		// Handle messages from peers.
		socket.on("message", (data) => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				const message = JSON.parse(data.toString()) as Writable<IMessage>;

				if (message.type === MessageType.SET_PEER_PROFILE) {
					this._handleProfileUpdate(
						client,
						(message.payload as ClientProfilePayload | undefined) ?? {},
					);
					return;
				}

				message.src = client.getId();

				this.emit("message", client, message);
			} catch (e) {
				this.emit("error", e);
			}
		});

		this.emit("connection", client);
	}

	private _sendErrorAndClose(socket: WebSocket, msg: Errors): void {
		socket.send(
			JSON.stringify({
				type: MessageType.ERROR,
				payload: { msg },
			}),
		);

		socket.close();
	}

	/**
	 * Notify all clients in the same IP group about a peer event
	 * @param ip - The IP address of the group
	 * @param excludeClientId - Client ID to exclude from notification (usually the one triggering the event)
	 * @param message - The message to send
	 */
	private _notifyIpGroup(
		ip: string,
		excludeClientId: string,
		message: { type: MessageType; payload: unknown },
	): void {
		const ipGroup = this.realm.getClientsByIp(ip);
		if (!ipGroup) return;

		for (const [clientId, client] of ipGroup) {
			// Don't notify the client that triggered the event
			if (clientId === excludeClientId) continue;

			const socket = client.getSocket();
			if (socket && socket.readyState === 1) {
				// WebSocket.OPEN = 1
				try {
					socket.send(JSON.stringify(message));
				} catch (e) {
					// Ignore send errors for now
				}
			}
		}
	}
}

type Writable<T> = {
	-readonly [K in keyof T]: T[K];
};
