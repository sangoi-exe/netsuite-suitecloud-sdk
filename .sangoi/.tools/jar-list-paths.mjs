#!/usr/bin/env node
/*
 * Lists URL-like path strings found in a jar:
 * - from `.properties` and other text entries (regex on bytes)
 * - from `.class` entries (constant pool UTF-8 strings)
 *
 * Usage:
 *   node .sangoi/.tools/jar-list-paths.mjs --jar /path/to/cli.jar
 *
 * Env:
 *   SUITECLOUD_ORACLE_JAR_PATH: default jar path
 */
'use strict';

import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';

function parseArgs(argv) {
	const args = { jar: process.env.SUITECLOUD_ORACLE_JAR_PATH || path.join(process.env.HOME || '', '.netsuite', 'cli-2025.1.0.jar') };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--jar') args.jar = argv[++i];
		if (argv[i] === '--json') args.json = true;
		if (argv[i] === '--all') args.all = true;
	}
	return args;
}

function extractUtf8ConstantsFromClass(classBytes) {
	if (classBytes.length < 10 || classBytes.readUInt32BE(0) !== 0xcafebabe) {
		return [];
	}
	let offset = 4;
	offset += 4; // minor+major
	const cpCount = classBytes.readUInt16BE(offset);
	offset += 2;

	const out = [];
	for (let index = 1; index < cpCount; index++) {
		const tag = classBytes.readUInt8(offset);
		offset += 1;
		switch (tag) {
			case 1: {
				const len = classBytes.readUInt16BE(offset);
				offset += 2;
				out.push(classBytes.slice(offset, offset + len).toString('utf8'));
				offset += len;
				break;
			}
			case 3:
			case 4:
				offset += 4;
				break;
			case 5:
			case 6:
				offset += 8;
				index += 1;
				break;
			case 7:
			case 8:
			case 16:
			case 19:
			case 20:
				offset += 2;
				break;
			case 9:
			case 10:
			case 11:
			case 12:
			case 17:
			case 18:
				offset += 4;
				break;
			case 15:
				offset += 3;
				break;
			default:
				return out;
		}
	}
	return out;
}

function extractPathsFromBuffer(buffer) {
	// Rough heuristic: keep only absolute-like paths that look like NetSuite endpoints.
	const text = buffer.toString('latin1');
	const rx = /\/(?:app|rest|services)\/[A-Za-z0-9._%?=\\-\\/]+/g;
	const out = [];
	let match;
	while ((match = rx.exec(text)) !== null) {
		const value = match[0];
		// Trim obvious junk
		if (value.length > 200) continue;
		if (value.includes('\u0000')) continue;
		out.push(value);
	}
	return out;
}

function isRelevantPath(p, includeAll) {
	if (includeAll) return p.startsWith('/');
	return p.startsWith('/app/') || p.startsWith('/rest/') || p.startsWith('/services/');
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.jar || !fs.existsSync(args.jar)) {
		console.error(`Jar not found: ${args.jar}`);
		process.exit(2);
	}

	const found = new Map(); // path -> {count, sources:Set}

	const add = (p, source) => {
		if (!found.has(p)) found.set(p, { count: 0, sources: new Set() });
		const info = found.get(p);
		info.count += 1;
		info.sources.add(source);
	};

	await new Promise((resolve, reject) => {
		yauzl.open(args.jar, { lazyEntries: true }, (err, zipfile) => {
			if (err) return reject(err);

			const readNext = () => zipfile.readEntry();
			readNext();

			zipfile.on('entry', (entry) => {
				const entryName = entry.fileName;
				if (entryName.endsWith('/')) {
					return readNext();
				}

				const isClass = entryName.endsWith('.class');
				const isTextish =
					entryName.endsWith('.properties') || entryName.endsWith('.xml') || entryName.endsWith('.json') || entryName.endsWith('.txt');
				if (!isClass && !isTextish) {
					return readNext();
				}

				zipfile.openReadStream(entry, (streamErr, stream) => {
					if (streamErr) return reject(streamErr);
					const chunks = [];
					stream.on('data', (c) => chunks.push(c));
					stream.on('end', () => {
						const data = Buffer.concat(chunks);
						if (isClass) {
							for (const s of extractUtf8ConstantsFromClass(data)) {
								if (isRelevantPath(s, args.all)) add(s, entryName);
							}
						} else {
							for (const p of extractPathsFromBuffer(data)) {
								if (isRelevantPath(p, args.all)) add(p, entryName);
							}
						}
						readNext();
					});
					stream.on('error', reject);
				});
			});

			zipfile.on('end', () => {
				zipfile.close();
				resolve();
			});
			zipfile.on('error', reject);
		});
	});

	const result = Array.from(found.entries())
		.map(([p, info]) => ({ path: p, count: info.count, sources: Array.from(info.sources).sort() }))
		.sort((a, b) => a.path.localeCompare(b.path));

	if (args.json) {
		console.log(JSON.stringify({ jar: args.jar, paths: result }, null, 2));
		return;
	}
	for (const r of result) {
		console.log(r.path);
	}
}

main().catch((err) => {
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
