export enum Errors {
	INVALID_KEY = "Invalid key provided",
	INVALID_TOKEN = "Invalid token provided",
	INVALID_WS_PARAMETERS = "No id, token, or key supplied to websocket server",
	CONNECTION_LIMIT_EXCEED = "Server has reached its concurrent user limit",
	INVALID_PIN = "Invalid PIN provided for peer connection",
}

export enum MessageType {
	OPEN = "OPEN",
	LEAVE = "LEAVE",
	CANDIDATE = "CANDIDATE",
	OFFER = "OFFER",
	ANSWER = "ANSWER",
	EXPIRE = "EXPIRE",
	HEARTBEAT = "HEARTBEAT",
	ID_TAKEN = "ID-TAKEN",
	ERROR = "ERROR",
	PEER_JOINED_IP_GROUP = "PEER-JOINED-IP-GROUP",
	PEER_LEFT_IP_GROUP = "PEER-LEFT-IP-GROUP",
	PEER_METADATA_UPDATED = "PEER-METADATA-UPDATED",
	SET_PEER_PROFILE = "SET-PEER-PROFILE",
}
