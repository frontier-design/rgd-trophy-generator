// Operations: set / insert / remove at a path. Shared by server (authoritative) and browser (optimistic).
// DOM-free and deterministic: the same operations on the same Document give the same result everywhere.

export function applyTransaction(document, transaction) {
	return applyWithInverse(document, transaction.operations).document;
}

// All-or-nothing on a copy. Returns the result and the inverse operations (already in reverse order).
export function applyWithInverse(document, operations) {
	const next = structuredClone(document);
	const inverse = operations.map((operation) => applyOperation(next, operation)).reverse();
	return { document: next, inverse };
}

function applyOperation(document, { type, path, value }) {
	if (!Array.isArray(path) || path.length === 0) throw new Error(`${type}: path must be a non-empty array`);
	const parent = walk(document, path.slice(0, -1));
	const key = path.at(-1);
	if (type === "set") {
		if (!(key in parent)) throw new Error(`nothing at ${path.join("/")}`);
		const old = parent[key];
		parent[key] = structuredClone(value);
		return { type: "set", path, value: old };
	}
	if (type === "insert") {
		if (Array.isArray(parent)) {
			if (!Number.isInteger(key) || key < 0 || key > parent.length) throw new Error(`insert: bad index ${path.join("/")}`);
			parent.splice(key, 0, structuredClone(value));
		} else if (key in parent) throw new Error(`insert: ${path.join("/")} already exists`);
		else parent[key] = structuredClone(value);
		return { type: "remove", path };
	}
	if (type === "remove") {
		if (!(key in parent)) throw new Error(`nothing at ${path.join("/")}`);
		const old = parent[key];
		if (Array.isArray(parent)) parent.splice(key, 1);
		else delete parent[key];
		return { type: "insert", path, value: old };
	}
	throw new Error(`unknown operation "${type}"`);
}

function walk(document, path) {
	let at = document;
	for (const key of path) {
		if (at === null || typeof at !== "object" || !(key in at)) throw new Error(`nothing at ${path.join("/")}`);
		at = at[key];
	}
	if (at === null || typeof at !== "object") throw new Error(`${path.join("/")} is not a container`);
	return at;
}
