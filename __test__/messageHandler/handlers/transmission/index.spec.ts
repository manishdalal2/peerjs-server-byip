import { describe, expect, it } from "@jest/globals";

import { Client } from "../../../../src/models/client.ts";
import { TransmissionHandler } from "../../../../src/messageHandler/handlers/index.ts";
import { Realm } from "../../../../src/models/realm.ts";
import { MessageType } from "../../../../src/enums.ts";
import type WebSocket from "ws";

const createFakeSocket = (): WebSocket => {
	/* eslint-disable @typescript-eslint/no-empty-function */
	const sock = {
		send: (): void => {},
		close: (): void => {},
		on: (): void => {},
	};
	/* eslint-enable @typescript-eslint/no-empty-function */

	return sock as unknown as WebSocket;
};

describe("Transmission handler", () => {
	it("should save message in queue when destination client not connected", () => {
		const realm = new Realm();
		const handleTransmission = TransmissionHandler({ realm });

		const clientFrom = new Client({ id: "id1", token: "" });
		const idTo = "id2";
		realm.setClient(clientFrom, clientFrom.getId());

		handleTransmission(clientFrom, {
			type: MessageType.OFFER,
			src: clientFrom.getId(),
			dst: idTo,
		});

		expect(realm.getMessageQueueById(idTo)?.getMessages().length).toBe(1);
	});

	it("should not save LEAVE and EXPIRE messages in queue when destination client not connected", () => {
		const realm = new Realm();
		const handleTransmission = TransmissionHandler({ realm });

		const clientFrom = new Client({ id: "id1", token: "" });
		const idTo = "id2";
		realm.setClient(clientFrom, clientFrom.getId());

		handleTransmission(clientFrom, {
			type: MessageType.LEAVE,
			src: clientFrom.getId(),
			dst: idTo,
		});
		handleTransmission(clientFrom, {
			type: MessageType.EXPIRE,
			src: clientFrom.getId(),
			dst: idTo,
		});

		expect(realm.getMessageQueueById(idTo)).toBeUndefined();
	});

	it("should send message to destination client when destination client connected", () => {
		const realm = new Realm();
		const handleTransmission = TransmissionHandler({ realm });

		const clientFrom = new Client({ id: "id1", token: "" });
		const clientTo = new Client({ id: "id2", token: "" });
		const socketTo = createFakeSocket();
		clientTo.setSocket(socketTo);
		realm.setClient(clientTo, clientTo.getId());

		let sent = false;
		socketTo.send = (): void => {
			sent = true;
		};

		handleTransmission(clientFrom, {
			type: MessageType.OFFER,
			src: clientFrom.getId(),
			dst: clientTo.getId(),
		});

		expect(sent).toBe(true);
	});

	it("should reject offer when destination peer requires a PIN and none is provided", () => {
		const realm = new Realm();
		const handleTransmission = TransmissionHandler({ realm });

		const clientFrom = new Client({ id: "id1", token: "" });
		const clientTo = new Client({ id: "id2", token: "" });
		const socketFrom = createFakeSocket();
		const socketTo = createFakeSocket();

		clientFrom.setSocket(socketFrom);
		clientTo.setSocket(socketTo);
		clientTo.setPin("1234");
		realm.setClient(clientFrom, clientFrom.getId());
		realm.setClient(clientTo, clientTo.getId());

		let errorSent = false;
		let forwarded = false;

		socketFrom.send = (data: string): void => {
			const parsed = JSON.parse(data);
			if (parsed?.type === MessageType.ERROR) {
				errorSent = parsed.payload?.msg === "Invalid PIN provided for peer connection";
			}
		};

		socketTo.send = (): void => {
			forwarded = true;
		};

		handleTransmission(clientFrom, {
			type: MessageType.OFFER,
			src: clientFrom.getId(),
			dst: clientTo.getId(),
			payload: { metadata: {} },
		});

		expect(errorSent).toBe(true);
		expect(forwarded).toBe(false);
	});

	it("should send LEAVE message to source client when sending to destination client failed", () => {
		const realm = new Realm();
		const handleTransmission = TransmissionHandler({ realm });

		const clientFrom = new Client({ id: "id1", token: "" });
		const clientTo = new Client({ id: "id2", token: "" });
		const socketFrom = createFakeSocket();
		const socketTo = createFakeSocket();
		clientFrom.setSocket(socketFrom);
		clientTo.setSocket(socketTo);
		realm.setClient(clientFrom, clientFrom.getId());
		realm.setClient(clientTo, clientTo.getId());

		let sent = false;
		socketFrom.send = (data: string): void => {
			if (JSON.parse(data)?.type === MessageType.LEAVE) {
				sent = true;
			}
		};

		socketTo.send = (): void => {
			throw Error();
		};

		handleTransmission(clientFrom, {
			type: MessageType.OFFER,
			src: clientFrom.getId(),
			dst: clientTo.getId(),
		});

		expect(sent).toBe(true);
	});
});
