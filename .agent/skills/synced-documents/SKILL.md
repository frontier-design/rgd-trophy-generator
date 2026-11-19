---
name: synced-documents
description: Set up a small server-owned Document that one or more browser tabs (and scripts) edit live over a websocket, with instant local edits, undo/redo, and durable storage. Use when a project needs live-synced state between a Node server and a browser client, from a single file up.
---

# Synced Documents

A Document (plain JSON) lives on a Node server. Browsers connect over a websocket, send edits, and see everyone's edits live. No framework, no build step; only the `ws` package.

## Vocabulary

- **Document**: the JSON state, e.g. `{ items: {} }`. The server owns it.
- **Operation**: one primitive change at a path: `set`, `insert` or `remove`.
  `{ type: "insert", path: ["items", "a"], value: { text: "hi" } }`
- **Transaction**: a named group of operations that apply, and undo, together. `{ id, name, author, operations }`.
- **Log**: the append-only list of committed transactions. Each entry gets a `position` (1, 2, 3…) and its `inverse` (the operations that undo it).
- **Snapshot**: the current Document saved to disk, so a restart doesn't replay everything.
- **Pending**: a transaction this tab sent that the server hasn't confirmed yet. Shown immediately anyway.
- **Preview**: operations shown locally during a drag and never sent; the finished gesture is sent as one transaction.

## How it works

1. The browser sends a transaction and shows it at once.
2. The server applies transactions one at a time in arrival order, appends each to `log.jsonl`, then sends the entry to every connected browser (the sender included).
3. Each browser applies the server's entries to its confirmed copy, and re-applies its own pending transactions on top. The server's order wins.
4. Undo appends the inverse of the latest not-yet-undone entry; redo re-applies it.

## Files

```
operations.js     shared by server and browser: apply set/insert/remove, compute inverses
server.js         http + websocket + log + snapshot + undo/redo (one file)
public/
  index.html      your UI
  client.js       browser module: connect(), transact(), undo(), …
data/             created on first run: log.jsonl, document.json
```

Resources to copy: [resources/operations.js](resources/operations.js), [resources/server.js](resources/server.js), [resources/client.js](resources/client.js) (goes in `public/`).
A complete working UI: [examples/public/index.html](examples/public/index.html). A test: [examples/test.js](examples/test.js).

## Setup

```bash
npm init -y && npm pkg set type=module && npm i ws
# copy the three resource files as shown above, then
node server.js        # http://localhost:3000
```

Change the starting Document with the `initial` option of `startServer({ initial: { ... } })`. `server.js` serves `public/` and `operations.js` itself.

## Using it in the browser

```js
import { connect } from "/client.js";
const doc = connect("me");                    // "me" is the author name stored on each transaction
doc.subscribe(({ document, status }) => render(document));   // runs on every change; status: connecting | live | offline

doc.transact("add item", [{ type: "insert", path: ["items", id], value: { text: "hi" } }]);
doc.transact("rename", [{ type: "set", path: ["items", id, "text"], value: "yo" }]);
doc.transact("delete", [{ type: "remove", path: ["items", id] }]);

doc.preview(ops);   // while dragging: show without sending
doc.transact(...);  // on release: send the final change (clears the preview)
doc.undo(); doc.redo();
```

Rules for operations: `set` and `remove` need the path to exist; `insert` needs it not to exist (or, in an array, an index from 0 to length). A transaction that fails is dropped and nothing changes. Generate ids and random values when you build the transaction, never inside `operations.js`.

## Using it from a script or agent on the server

```js
import { startServer } from "./server.js";
const server = await startServer({ port: 3000 });
await server.apply({ name: "seed", author: "script", operations: [/* ... */] });
server.read();   // the current Document
```

The edit reaches every open browser live, like any other transaction.

## Messages (JSON over `/ws`)

| direction | message |
|---|---|
| browser → server | `{ type: "transaction", transaction }`, `{ type: "undo", id, author }`, `{ type: "redo", id, author }`, `{ type: "snapshot" }` |
| server → browser | `{ type: "document", document, position, log }` on connect, `{ type: "transaction", entry }` for each commit, `{ type: "rejected", id, message }` to the sender of a failed one |

## Check it works

```bash
cp examples/test.js ./test.js && node --test test.js
```

Run it from the folder holding `server.js`, `client.js` and `operations.js` (copy `client.js` next to them for the test). It starts a server, connects two clients, and checks they converge, undo/redo work, scripts can edit, and a restart keeps the data.

## Extending

- **New kinds of edit**: write small functions that return `{ name, operations }`, e.g. `addItem(doc, text)`. Use them from the UI and from scripts so each gesture is one undo step.
- **Several Documents**: make `startServer` take a name per connection and keep one `data/<name>/` folder per Document.
- **Per-user view state** (pan, zoom, selection): keep it out of the Document; send it as its own message and store it per connection on the server.
- **Reactive UI**: `subscribe` is plain callbacks. Wrap `doc.state` in your framework's signal/store, or vendor Solid.js and set a signal inside the `subscribe` callback.
