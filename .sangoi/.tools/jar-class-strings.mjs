#!/usr/bin/env node
/*
 * Extracts UTF-8 string constants from a `.class` entry inside a `.jar` file.
 *
 * Usage:
 *   node .sangoi/.tools/jar-class-strings.mjs --jar /path/to/cli.jar --class com/foo/Bar.class
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
		if (argv[i] === '--class') args.classPath = argv[++i];
		if (argv[i] === '--json') args.json = true;
	}
	return args;
}

function readUint16BE(buffer, offset) {
	return buffer.readUInt16BE(offset);
}

function readUint32BE(buffer, offset) {
	return buffer.readUInt32BE(offset);
}

function extractClassUtf8Constants(classBytes) {
	if (classBytes.length < 10 || classBytes.readUInt32BE(0) !== 0xcafebabe) {
		throw new Error('Not a valid .class file (missing CAFEBABE).');
	}
	let offset = 4;
	// minor + major
	offset += 4;
	const cpCount = readUint16BE(classBytes, offset);
	offset += 2;

	const strings = [];
	for (let index = 1; index < cpCount; index++) {
		const tag = classBytes.readUInt8(offset);
		offset += 1;

		switch (tag) {
			case 1: {
				const length = readUint16BE(classBytes, offset);
				offset += 2;
				const value = classBytes.slice(offset, offset + length).toString('utf8');
				offset += length;
				strings.push(value);
				break;
			}
			case 3: // Integer
			case 4: // Float
				offset += 4;
				break;
			case 5: // Long
			case 6: // Double
				offset += 8;
				index += 1; // takes two entries
				break;
			case 7: // Class
			case 8: // String
			case 16: // MethodType
			case 19: // Module
			case 20: // Package
				offset += 2;
				break;
			case 9: // Fieldref
			case 10: // Methodref
			case 11: // InterfaceMethodref
			case 12: // NameAndType
			case 17: // Dynamic
			case 18: // InvokeDynamic
				offset += 4;
				break;
			case 15: // MethodHandle
				offset += 3;
				break;
			default:
				throw new Error(`Unsupported constant pool tag ${tag} at index ${index}.`);
		}
	}
	return Array.from(new Set(strings)).sort();
}

function readJarEntry(jarPath, entryName) {
	return new Promise((resolve, reject) => {
		yauzl.open(jarPath, { lazyEntries: true }, (err, zipfile) => {
			if (err) return reject(err);
			let found = false;

			zipfile.readEntry();
			zipfile.on('entry', (entry) => {
				if (entry.fileName === entryName) {
					found = true;
					zipfile.openReadStream(entry, (streamErr, stream) => {
						if (streamErr) return reject(streamErr);
						const chunks = [];
						stream.on('data', (c) => chunks.push(c));
						stream.on('end', () => {
							zipfile.close();
							resolve(Buffer.concat(chunks));
						});
						stream.on('error', reject);
					});
				} else {
					zipfile.readEntry();
				}
			});
			zipfile.on('end', () => {
				if (!found) {
					reject(new Error(`Class entry not found in jar: ${entryName}`));
				}
			});
			zipfile.on('error', reject);
		});
	});
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.classPath) {
		console.error('Missing --class <path/in/jar>.');
		process.exit(2);
	}
	if (!args.jar || !fs.existsSync(args.jar)) {
		console.error(`Jar not found: ${args.jar}`);
		process.exit(2);
	}

	const classBytes = await readJarEntry(args.jar, args.classPath);
	const strings = extractClassUtf8Constants(classBytes);
	if (args.json) {
		console.log(JSON.stringify({ jar: args.jar, classPath: args.classPath, strings }, null, 2));
		return;
	}
	for (const s of strings) {
		console.log(s);
	}
}

main().catch((err) => {
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});

