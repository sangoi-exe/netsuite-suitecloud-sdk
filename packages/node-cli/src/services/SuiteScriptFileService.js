/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { FOLDERS } = require('../ApplicationConstants');

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeFileCabinetPath(fileCabinetPath) {
	if (!fileCabinetPath) {
		return '';
	}
	let p = `${fileCabinetPath}`.trim();
	p = p.replaceAll('\\', '/');
	p = p.replace(/^\/+/, ''); // keep relative to FileCabinet
	return p;
}

function toIdentifier(moduleId, existingNames) {
	const lastSegment = `${moduleId}`.split('/').filter(Boolean).slice(-1)[0] || 'mod';
	const base = lastSegment.replace(/[^a-zA-Z0-9_]/g, '_');
	let name = base.charAt(0).match(/[a-zA-Z_]/) ? base : `mod_${base}`;

	let counter = 2;
	while (existingNames.has(name)) {
		name = `${base}${counter}`;
		counter += 1;
	}
	existingNames.add(name);
	return name;
}

function parseModuleList(modulesValue) {
	if (!modulesValue) {
		return [];
	}
	const raw = `${modulesValue}`.trim();
	if (!raw) {
		return [];
	}

	// Accept either a space-separated list of quoted modules ("N/record" "N/log")
	// or a single unquoted value (N/record).
	const quoted = [];
	const regex = /"([^"]+)"/g;
	let match;
	while ((match = regex.exec(raw)) !== null) {
		quoted.push(match[1]);
	}
	if (quoted.length > 0) {
		return quoted;
	}
	return raw.split(/\s+/).filter(Boolean);
}

function buildScriptStubs(scriptType) {
	switch (scriptType) {
		case 'ClientScript':
			return `\tfunction pageInit(context) {\n\t}\n\n\treturn { pageInit };\n`;
		case 'UserEventScript':
			return `\tfunction beforeLoad(context) {\n\t}\n\n\tfunction beforeSubmit(context) {\n\t}\n\n\tfunction afterSubmit(context) {\n\t}\n\n\treturn { beforeLoad, beforeSubmit, afterSubmit };\n`;
		case 'MapReduceScript':
			return `\tfunction getInputData() {\n\t}\n\n\tfunction map(context) {\n\t}\n\n\tfunction reduce(context) {\n\t}\n\n\tfunction summarize(summary) {\n\t}\n\n\treturn { getInputData, map, reduce, summarize };\n`;
		case 'ScheduledScript':
			return `\tfunction execute(context) {\n\t}\n\n\treturn { execute };\n`;
		case 'Suitelet':
			return `\tfunction onRequest(context) {\n\t}\n\n\treturn { onRequest };\n`;
		case 'Restlet':
			return `\tfunction get(context) {\n\t}\n\n\tfunction post(context) {\n\t}\n\n\tfunction put(context) {\n\t}\n\n\tfunction del(context) {\n\t}\n\n\treturn { get, post, put, delete: del };\n`;
		case 'Portlet':
			return `\tfunction render(context) {\n\t}\n\n\treturn { render };\n`;
		case 'MassUpdateScript':
			return `\tfunction each(params) {\n\t}\n\n\treturn { each };\n`;
		case 'WorkflowActionScript':
			return `\tfunction onAction(context) {\n\t}\n\n\treturn { onAction };\n`;
		default:
			return `\tfunction main() {\n\t}\n\n\treturn { main };\n`;
	}
}

function buildSuiteScriptFileContents({ scriptType, modules }) {
	const moduleIds = Array.isArray(modules) ? modules : [];
	const moduleNames = new Set();
	const argNames = moduleIds.map((id) => toIdentifier(id, moduleNames));

	const headerLines = ['/**', ' * @NApiVersion 2.1'];
	if (scriptType) {
		headerLines.push(` * @NScriptType ${scriptType}`);
	}
	headerLines.push(' */');

	const defineDeps = JSON.stringify(moduleIds);
	const defineArgs = argNames.join(', ');

	return (
		`${headerLines.join('\n')}\n` +
		`define(${defineDeps}, function(${defineArgs}) {\n` +
		`\t'use strict';\n\n` +
		`${buildScriptStubs(scriptType)}` +
		`});\n`
	);
}

module.exports = class SuiteScriptFileService {
	createFile({ projectFolder, fileCabinetPath, scriptType, modules }) {
		if (!projectFolder || !fs.existsSync(projectFolder)) {
			return { ok: false, errorMessages: ['Project folder does not exist.'] };
		}

		const normalized = normalizeFileCabinetPath(fileCabinetPath);
		if (!normalized) {
			return { ok: false, errorMessages: ['Missing "path" for SuiteScript file.'] };
		}

		const fileCabinetRoot = path.resolve(projectFolder, FOLDERS.FILE_CABINET);
		const absPath = path.resolve(fileCabinetRoot, normalized);
		if (!absPath.startsWith(fileCabinetRoot + path.sep) && absPath !== fileCabinetRoot) {
			return { ok: false, errorMessages: ['Invalid path (must be within FileCabinet).'] };
		}

		ensureDir(path.dirname(absPath));

		if (fs.existsSync(absPath)) {
			return { ok: false, errorMessages: [`File already exists: ${absPath}`] };
		}

		const content = buildSuiteScriptFileContents({
			scriptType,
			modules: parseModuleList(modules),
		});

		fs.writeFileSync(absPath, content, 'utf8');
		return { ok: true, absolutePath: absPath };
	}
};
