import type { IMessageQueue } from "./messageQueue.ts";
import { MessageQueue } from "./messageQueue.ts";
import { randomUUID } from "node:crypto";
import type { IClient } from "./client.ts";
import type { IMessage } from "./message.ts";

export interface IRealm {
	getClientsIds(): string[];

	getClientById(clientId: string): IClient | undefined;

	getClientsIdsWithQueue(): string[];

	setClient(client: IClient, id: string): void;

	removeClientById(id: string): boolean;

	getMessageQueueById(id: string): IMessageQueue | undefined;

	addMessageToQueue(id: string, message: IMessage): void;

	clearMessageQueue(id: string): void;

	generateClientId(generateClientId?: () => string): string;

	getClientsByIp(ipAddress: string): Map<string, IClient> | undefined;

	getAllIpGroups(): Map<string, Map<string, IClient>>;
}

export class Realm implements IRealm {
	private readonly clients = new Map<string, IClient>();
	private readonly messageQueues = new Map<string, IMessageQueue>();
	private readonly clientsByIp = new Map<string, Map<string, IClient>>();

	public getClientsIds(): string[] {
		return [...this.clients.keys()];
	}

	public getClientById(clientId: string): IClient | undefined {
		return this.clients.get(clientId);
	}

	public getClientsIdsWithQueue(): string[] {
		return [...this.messageQueues.keys()];
	}

	public setClient(client: IClient, id: string): void {
		this.clients.set(id, client);

		// Add to IP-based grouping
		const ip = client.getIpAddress();
		if (ip) {
			if (!this.clientsByIp.has(ip)) {
				this.clientsByIp.set(ip, new Map());
			}
			this.clientsByIp.get(ip)!.set(id, client);
		}
	}

	public removeClientById(id: string): boolean {
		const client = this.getClientById(id);

		if (!client) return false;

		// Remove from IP-based grouping
		const ip = client.getIpAddress();
		if (ip) {
			const ipGroup = this.clientsByIp.get(ip);
			if (ipGroup) {
				ipGroup.delete(id);
				if (ipGroup.size === 0) {
					this.clientsByIp.delete(ip);
				}
			}
		}

		this.clients.delete(id);

		return true;
	}

	public getMessageQueueById(id: string): IMessageQueue | undefined {
		return this.messageQueues.get(id);
	}

	public addMessageToQueue(id: string, message: IMessage): void {
		if (!this.getMessageQueueById(id)) {
			this.messageQueues.set(id, new MessageQueue());
		}

		this.getMessageQueueById(id)?.addMessage(message);
	}

	public clearMessageQueue(id: string): void {
		this.messageQueues.delete(id);
	}

	public generateClientId(generateClientId?: () => string): string {
		const generateId = generateClientId ? generateClientId : randomUUID;

		let clientId = generateId();

		while (this.getClientById(clientId)) {
			clientId = generateId();
		}

		return clientId;
	}

	public getClientsByIp(ipAddress: string): Map<string, IClient> | undefined {
		return this.clientsByIp.get(ipAddress);
	}

	public getAllIpGroups(): Map<string, Map<string, IClient>> {
		return this.clientsByIp;
	}
}
