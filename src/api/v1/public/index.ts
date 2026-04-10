import express from "express";
import type { IConfig } from "../../../config/index.ts";
import type { IRealm } from "../../../models/realm.ts";

function serializePeer(client: ReturnType<IRealm["getClientById"]> extends infer T ? Exclude<T, undefined> : never) {
	return {
		id: client.getId(),
		alias: client.getAlias(),
		name: client.getName(),
		displayName: client.getDisplayName(),
		hasPin: client.getPin() !== null,
	};
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

function isGroupsEndpointAuthorized(req: express.Request): boolean {
	const groupsToken = process.env["PEERJS_GROUPS_TOKEN"];

	if (!groupsToken) {
		return false;
	}

	const headerToken = req.header("x-peerjs-groups-token");
	const queryToken = typeof req.query["token"] === "string" ? req.query["token"] : undefined;

	return headerToken === groupsToken || queryToken === groupsToken;
}

export default ({
	config,
	realm,
}: {
	config: IConfig;
	realm: IRealm;
}): express.Router => {
	const app = express.Router();

	// Retrieve guaranteed random ID.
	app.get("/id", (_, res: express.Response) => {
		res.contentType("html");
		res.send(realm.generateClientId(config.generateClientId));
	});

	// Get a list of all peers for a key, enabled by the `allowDiscovery` flag.
	app.get("/peers", (_, res: express.Response) => {
		if (config.allow_discovery) {
			const clientsIds = realm.getClientsIds();

			return res.send(clientsIds);
		}

		return res.sendStatus(401);
	});

	// Get all peers from the same IP as the requesting client
	app.get("/by-ip", (req: express.Request, res: express.Response) => {
		if (config.allow_discovery) {
			// Extract client's IP address from request
			const forwardedFor = req.headers["x-forwarded-for"];
			let clientIp = req.socket.remoteAddress ?? "unknown";
			
			if (forwardedFor) {
				const forwardedIp = Array.isArray(forwardedFor) 
					? forwardedFor[0] ?? ""
					: forwardedFor;
				const firstIp = forwardedIp.split(",")[0];
				if (firstIp) {
					clientIp = normalizeClientIp(firstIp);
				}
			}

			clientIp = normalizeClientIp(clientIp);

			const ipGroup = realm.getClientsByIp(clientIp);

			if (!ipGroup) {
				return res.send([]);
			}

			const peers = Array.from(ipGroup.values()).map((client) => serializePeer(client));

			return res.send(peers);
		}

		return res.sendStatus(401);
	});

	// Get all IP groups (admin/debugging endpoint)
	app.get("/groups", (req: express.Request, res: express.Response) => {
		if (!isGroupsEndpointAuthorized(req)) {
			return res.sendStatus(404);
		}

		if (config.allow_discovery) {
			const result: Record<
				string,
				{ id: string; alias: string; name: string; displayName: string; hasPin: boolean }[]
			> = {};

			const ipGroups = Array.from(realm.getAllIpGroups().entries());
			for (const [ip, clients] of ipGroups) {
				result[ip] = Array.from(clients.values()).map((client) => serializePeer(client));
			}

			return res.send(result);
		}

		return res.sendStatus(401);
	});

	return app;
};
