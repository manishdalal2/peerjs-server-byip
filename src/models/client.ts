import type WebSocket from "ws";

export interface IClient {
	getId(): string;

	getToken(): string;

	getSocket(): WebSocket | null;

	setSocket(socket: WebSocket | null): void;

	getLastPing(): number;

	setLastPing(lastPing: number): void;

	getIpAddress(): string;

	setIpAddress(ip: string): void;

	getAlias(): string;

	setAlias(alias: string): void;

	send<T>(data: T): void;
}

export class Client implements IClient {
	private readonly id: string;
	private readonly token: string;
	private socket: WebSocket | null = null;
	private lastPing: number = new Date().getTime();
	private ipAddress: string = "";
	private alias: string = "";

	constructor({ id, token }: { id: string; token: string }) {
		this.id = id;
		this.token = token;
	}

	public getId(): string {
		return this.id;
	}

	public getToken(): string {
		return this.token;
	}

	public getSocket(): WebSocket | null {
		return this.socket;
	}

	public setSocket(socket: WebSocket | null): void {
		this.socket = socket;
	}

	public getLastPing(): number {
		return this.lastPing;
	}

	public setLastPing(lastPing: number): void {
		this.lastPing = lastPing;
	}

	public getIpAddress(): string {
		return this.ipAddress;
	}

	public setIpAddress(ip: string): void {
		this.ipAddress = ip;
	}

	public getAlias(): string {
		return this.alias;
	}

	public setAlias(alias: string): void {
		this.alias = alias;
	}

	public send<T>(data: T): void {
		this.socket?.send(JSON.stringify(data));
	}
}
