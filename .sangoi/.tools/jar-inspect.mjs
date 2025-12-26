#!/usr/bin/env node
/*
 * Quick jar inspection helper for reverse engineering (no decompilation).
 *
 * Usage:
 *   node .sangoi/.tools/jar-inspect.mjs --jar /path/to/cli.jar
 *
 * Prints:
 * - endpoint property files (app/rest)
 * - candidate NetSuite endpoint paths found in class constant pools (delegates)
 */
'use strict';

import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';

import { spawnSync } from 'child_process';

function parseArgs(argv) {
	const args = { jar: process.env.SUITECLOUD_ORACLE_JAR_PATH || path.join(process.env.HOME || '', '.netsuite', 'cli-2025.1.0.jar') };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--jar') args.jar = argv[++i];
	}
	return args;
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
				if (!found) reject(new Error(`Entry not found: ${entryName}`));
			});
			zipfile.on('error', reject);
		});
	});
}

function parseProperties(text) {
	const out = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const idx = line.indexOf('=');
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		out[key] = value;
	}
	return out;
}

function extractInterestingStrings(strings) {
	return strings.filter((s) => s.startsWith('/') && /\/app\/|\/rest\/|\/services\//.test(s));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.jar || !fs.existsSync(args.jar)) {
		console.error(`Jar not found: ${args.jar}`);
		process.exit(2);
	}

	const appEndpoints = parseProperties((await readJarEntry(args.jar, 'app.endpoint.paths.properties')).toString('utf8'));
	const restEndpoints = parseProperties((await readJarEntry(args.jar, 'rest.endpoint.properties')).toString('utf8'));

	console.log('== app.endpoint.paths.properties');
	console.log(JSON.stringify(appEndpoints, null, 2));
	console.log('\n== rest.endpoint.properties');
	console.log(JSON.stringify(restEndpoints, null, 2));

	// Delegate classes that show deploy/preview/validation endpoints and parameter names.
	const delegateClasses = [
		'com/netsuite/ide/core/suiteapp/delegate/DeployDelegate.class',
		'com/netsuite/ide/core/suiteapp/delegate/PreviewDelegate.class',
		'com/netsuite/ide/core/suiteapp/delegate/ServerValidationDelegate.class',
		'com/netsuite/ide/core/webservice/filecabinetupload/FileCabinetUploadService.class',
		'com/netsuite/ide/core/authentication/AuthConstants.class',
		'com/netsuite/ide/core/authentication/service/DatacenterDomainsServiceImpl.class',
	];

	console.log('\n== class constants (filtered)');
	for (const cls of delegateClasses) {
		const proc = spawnSync('node', [path.join('.sangoi', '.tools', 'jar-class-strings.mjs'), '--jar', args.jar, '--class', cls, '--json'], {
			encoding: 'utf8',
		});
		if (proc.status !== 0) {
			console.log(`\n# ${cls}\n<error reading class strings>`);
			continue;
		}
		const parsed = JSON.parse(proc.stdout);
		const interesting = extractInterestingStrings(parsed.strings);
		console.log(`\n# ${cls}`);
		for (const s of interesting) {
			console.log(s);
		}
	}
}

main().catch((err) => {
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
