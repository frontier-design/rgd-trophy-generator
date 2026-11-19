// Run from the folder holding server.js, client.js and operations.js:  node --test test.js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { startServer } from "./server.js";
import { connect } from "./client.js";

const until = async (predicate, ms = 3000) => {
	for (const end = Date.now() + ms; !predicate(); await new Promise((r) => setTimeout(r, 10)))
		if (Date.now() > end) throw new Error("timed out");
};
const add = (id) => [{ type: "insert", path: ["items", id], value: { text: id } }];

test("edits converge, undo works, a restart keeps the data", async () => {
	const data = join(await mkdtemp(join(tmpdir(), "doc-")), "data");
	let server = await startServer({ port: 0, data, publicDir: "." });
	const open = (author) => connect(author, { url: `ws://127.0.0.1:${server.port}/ws`, WebSocketImpl: WebSocket });
	const a = open("a");
	const b = open("b");
	await until(() => a.state.document && b.state.document);

	a.transact("add a", add("a"));
	assert.ok(a.state.document.items.a, "own edit shows before the echo");
	await until(() => b.state.document.items.a);
	b.transact("add b", add("b"));
	await until(() => a.state.document.items.b);
	assert.deepEqual(a.state.document, b.state.document);

	a.undo(); // undoes b's edit
	await until(() => !b.state.document.items.b);
	b.redo();
	await until(() => a.state.document.items.b);

	await server.apply({ name: "from script", author: "script", operations: add("c") });
	await until(() => a.state.document.items.c);

	a.close();
	b.close();
	await server.close();
	server = await startServer({ port: 0, data, publicDir: "." });
	assert.deepEqual(Object.keys(server.read().items), ["a", "b", "c"]);
	await server.close();
});
