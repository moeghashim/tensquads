const deliveryLabel = {
	ready: "Ready",
	queued: "Queued",
	delivered: "Delivered",
	acknowledged: "Acknowledged",
	dead: "Dead letter",
};

export const title = "Bus event and shared state";

export const state = (v) => {
	if (v.guard === "waiting") return "Waiting";
	const name = deliveryLabel[v.delivery];
	if (v.hidden && (v.delivery === "acknowledged" || v.delivery === "dead")) return `${name}, filtered`;
	return name;
};

const hidden = new Set(["Pause", "Resume", "Repeat", "SendWhileWaiting", "QueuedDrain"]);

const labels = {
	SendNext: "the next event",
	QueuedSend: "the next event",
	LiveCommit: "the next event",
	LiveStart: "the live tick starts",
	LiveExpire: "the wait ends",
	Stage: "the bus queues the event",
	Deliver: "the bus delivers the event",
	Ack: "the bus acknowledges the event",
	Dead: "the bus dead-letters the event",
	Filter: "you filter the list",
	Clear: "you clear the filter",
};

export const step = (action, from) => {
	if (hidden.has(action)) return null;
	if (action === "LiveStart" && from.delivery !== "ready") return null;
	if (action === "LiveExpire" && from.delivery !== "ready") return null;
	if (action === "Filter" && from.delivery !== "acknowledged" && from.delivery !== "dead") return null;
	if (action === "Clear" && from.delivery !== "acknowledged" && from.delivery !== "dead") return null;
	return labels[action] ?? null;
};

export const group = (v) => {
	if (v.guard === "waiting") return "Waiting";
	if (v.delivery === "dead") return "Dead letter";
	if (v.delivery === "acknowledged") return "Acknowledged";
	if (v.delivery === "queued" || v.delivery === "delivered") return "In flight";
	return "Ready";
};

export const colors = {
	Ready: "blue",
	Waiting: "orange",
	"In flight": "teal",
	Acknowledged: "purple",
	"Dead letter": "pink",
};
