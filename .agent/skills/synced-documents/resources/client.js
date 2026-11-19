// Browser side: connects to /ws, keeps the Document, shows your edits instantly.
//
//   import { connect } from "./client.js";
//   const doc = connect("me");
//   doc.subscribe((state) => render(state.document));
//   doc.transact("add item", [{ type: "insert", path: ["items", "a"], value: { text: "hi" } }]);
//
// state = { document, recent, status }  status: "connecting" | "live" | "offline"

import { applyTransaction } from "./operations.js";

export function connect(author, { url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`, WebSocketImpl = WebSocket } = {}) {
	const listeners = new Set();
	const state = { document: null, recent: [], status: "connecting" };
	let confirmed = null; // the server's Document
	let position = 0; // last log position applied
	let pending = []; // my transactions the server has not echoed yet
	let preview = null; // operations of a drag in progress: shown, never sent
	let socket;
	let attempts = 0;
	let closed = false;

	const show = () => {
		const queue = [...pending, ...(preview ? [{ operations: preview }] : [])];
		state.document = queue.reduce((doc, transaction) => {
			try {
				return applyTransaction(doc, transaction);
			} catch {
				return doc;
			}
		}, confirmed);
		listeners.forEach((fn) => fn(state));
	};
	const send = (message) => socket?.readyState === WebSocketImpl.OPEN && socket.send(JSON.stringify(message));

	function open() {
		socket = new WebSocketImpl(url);
		socket.addEventListener("message", ({ data }) => {
			const message = JSON.parse(data);
			if (message.type === "document") {
				confirmed = message.document;
				position = message.position;
				state.recent = message.log;
				const seen = new Set(message.log.map((entry) => entry.id));
				pending = pending.filter((transaction) => !seen.has(transaction.id));
				state.status = "live";
				for (const transaction of pending) send({ type: "transaction", transaction }); // resend after a reconnect
			} else if (message.type === "transaction") {
				const { entry } = message;
				if (entry.position <= position) return;
				confirmed = applyTransaction(confirmed, entry);
				position = entry.position;
				pending = pending.filter((transaction) => transaction.id !== entry.id);
				state.recent = [...state.recent.slice(-19), entry];
			} else if (message.type === "rejected") {
				console.warn("rejected:", message.message);
				pending = pending.filter((transaction) => transaction.id !== message.id);
			}
			show();
		});
		socket.addEventListener("open", () => (attempts = 0));
		socket.addEventListener("close", () => {
			state.status = "offline";
			listeners.forEach((fn) => fn(state));
			if (!closed) setTimeout(open, Math.min(10_000, 250 * 2 ** attempts++));
		});
	}
	open();

	return {
		state,
		subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
		// Shows operations without sending them (a drag). Pass null to clear.
		preview(operations) {
			preview = operations;
			show();
		},
		// Sends one transaction: a named group of operations that apply (and undo) together.
		transact(name, operations) {
			const transaction = { id: crypto.randomUUID(), name, author, operations };
			preview = null;
			pending.push(transaction);
			show();
			send({ type: "transaction", transaction });
		},
		undo: () => send({ type: "undo", id: crypto.randomUUID(), author }),
		redo: () => send({ type: "redo", id: crypto.randomUUID(), author }),
		snapshot: () => send({ type: "snapshot" }),
		close() {
			closed = true;
			socket.close();
		},
	};
}
