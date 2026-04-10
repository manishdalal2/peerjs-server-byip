import { MessageType } from "../../../enums.ts";
import type { IClient } from "../../../models/client.ts";
import type { IMessage } from "../../../models/message.ts";
import type { IRealm } from "../../../models/realm.ts";

function getRequestedPin(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const metadata = (payload as { metadata?: unknown }).metadata;

  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const pin = (metadata as { pin?: unknown }).pin;

  return typeof pin === "string" && pin.trim() ? pin.trim() : null;
}

export const TransmissionHandler = ({
  realm,
}: {
  realm: IRealm;
}): ((client: IClient | undefined, message: IMessage) => boolean) => {
  const handle = (client: IClient | undefined, message: IMessage) => {
    const type = message.type;
    const srcId = message.src;
    const dstId = message.dst;

    const destinationClient = realm.getClientById(dstId);

    if (destinationClient) {
      if (type === MessageType.OFFER) {
        const expectedPin = destinationClient.getPin();
        const requestedPin = getRequestedPin(message.payload);

        if (expectedPin && requestedPin !== expectedPin) {
          client?.send({
            type: MessageType.ERROR,
            payload: { msg: "Invalid PIN provided for peer connection" },
          });

          return true;
        }
      }

      const socket = destinationClient.getSocket();

      try {
        if (socket) {
          const data = JSON.stringify(message);

          socket.send(data);
        } else {
          throw new Error("Peer dead");
        }
      } catch (e) {
        if (socket) {
          socket.close();
        } else {
          realm.removeClientById(destinationClient.getId());
        }

        handle(client, {
          type: MessageType.LEAVE,
          src: dstId,
          dst: srcId,
        });
      }
    } else {
      const ignoredTypes = [MessageType.LEAVE, MessageType.EXPIRE];

      if (!ignoredTypes.includes(type) && dstId) {
        realm.addMessageToQueue(dstId, message);
      } else if (type === MessageType.LEAVE && !dstId) {
        realm.removeClientById(srcId);
      }
    }

    return true;
  };

  return handle;
};
