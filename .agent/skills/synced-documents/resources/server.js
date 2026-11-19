// One file: serves a folder over http and keeps ONE Document, live over a websocket at /ws.
// Run: node server.js   (needs `npm i ws`, Node 19+, "type": "module")
//
// data/log.jsonl      every committed transaction, one JSON line each (append-only)
// data/document.json  snapshot { logPosition, document }

import { createServer } from "node:http";
import { readFile, writeFile, appendFile, mkdir, rename } from "node:fs/promises";
import { join, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { applyWithInverse, applyTransaction } from "./operations.js";

export async function startServer({ port = 3000, data = "data", publicDir = "public", initial = { items: {} } } = {}) {
	await mkdir(data, { recursive: true });

	// Load: snapshot, then replay log entries written after it.
	const snapshot = await readFile(join(data, "document.json"), "utf8").then(JSON.parse, () => ({ logPosition: 0, document: initial }));
	const log = await readFile(join(data, "log.jsonl"), "utf8").then((t) => t.split("\n").filter(Boolean).map(JSON.parse), () => []);
	let document = snapshot.document;
	for (const entry of log) if (entry.position > snapshot.logPosition) document = applyTransaction(document, entry);

	// Undo / redo stacks, derived from the log alone.
	let undoStack = [];
	let redoStack = [];
	const track = (entry) => {
		if (entry.undoes !== undefined) (undoStack.pop(), redoStack.push(entry));
		else if (entry.redoes !== undefined) (redoStack.pop(), undoStack.push(entry));
		else (undoStack.push(entry), (redoStack = []));
	};
	log.forEach(track);

	const sockets = new Set();
	const broadcast = (message) => {
		const text = JSON.stringify(message);
		for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(text);
	};

	// Commits happen one at a time, in arrival order.
	let queue = Promise.resolve();
	const commit = (describe) => {
		const done = queue.then(async () => {
			const transaction = describe();
			const { document: next, inverse } = applyWithInverse(document, transaction.operations);
			const entry = { position: log.length + 1, ...transaction, inverse };
			await appendFile(join(data, "log.jsonl"), JSON.stringify(entry) + "\n");
			document = next;
			log.push(entry);
			track(entry);
			broadcast({ type: "transaction", entry });
			return entry;
		});
		queue = done.catch(() => {});
		return done;
	};

	const saveSnapshot = async () => {
		const file = join(data, "document.json");
		await writeFile(file + ".tmp", JSON.stringify({ logPosition: log.length, document }, null, "\t"));
		await rename(file + ".tmp", file);
	};
	const timer = setInterval(() => saveSnapshot().catch(() => {}), 10_000);
	timer.unref();

	const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
	const http = createServer(async (request, response) => {
		const path = new URL(request.url, "http://x").pathname;
		const file = path === "/" ? "index.html" : path.slice(1);
		// operations.js is shared with the browser; everything else comes from publicDir.
		const from = file === "operations.js" ? "." : publicDir;
		try {
			if (file.includes("..")) throw new Error("bad path");
			response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
			response.end(await readFile(join(from, file)));
		} catch {
			response.writeHead(404).end("not found");
		}
	});

	new WebSocketServer({ server: http, path: "/ws" }).on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		const send = (message) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
		// Document and position are sent together; this socket is already in `sockets`, so every later
		// commit reaches it too.
		send({ type: "document", document, position: log.length, log: log.slice(-20) });

		socket.on("message", async (raw) => {
			let message = {};
			try {
				message = JSON.parse(raw);
				if (message.type === "transaction") {
					const { id, name, author, operations } = message.transaction;
					await commit(() => ({ id, name, author, operations }));
				} else if (message.type === "undo") {
					await commit(() => {
						const target = undoStack.at(-1);
						if (!target) throw new Error("nothing to undo");
						return { id: message.id, name: `undo ${target.name}`, author: message.author, operations: target.inverse, undoes: target.position };
					});
				} else if (message.type === "redo") {
					await commit(() => {
						const target = redoStack.at(-1);
						if (!target) throw new Error("nothing to redo");
						return { id: message.id, name: `redo ${target.name}`, author: message.author, operations: target.inverse, redoes: target.position };
					});
				} else if (message.type === "snapshot") {
					await saveSnapshot();
				}
			} catch (error) {
				send({ type: "rejected", id: message.transaction?.id ?? message.id, message: error.message });
			}
		});
	});

	await new Promise((resolve) => http.listen(port, resolve));
	return {
		port: http.address().port,
		read: () => document,
		// Server-side edits (scripts, agents): same path as a browser's.
		apply: (transaction) => commit(() => transaction),
		async close() {
			clearInterval(timer);
			await saveSnapshot();
			for (const socket of sockets) socket.close();
			await new Promise((resolve) => http.close(resolve));
		},
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { port } = await startServer({ port: Number(process.env.PORT ?? 3000) });
	console.log(`http://localhost:${port}`);
}
