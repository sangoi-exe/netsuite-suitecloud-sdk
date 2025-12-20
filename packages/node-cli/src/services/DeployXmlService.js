/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const DEPLOY_XML_FILE = 'deploy.xml';

function substituteVariables(input, variables) {
	if (!variables) {
		return input;
	}
	return input.replace(/\$\{([^}]+)}/g, (_, variableName) => {
		if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
			return `${variables[variableName]}`;
		}
		return `\${${variableName}}`;
	});
}

function normalizeDeployPathPattern(rawPath) {
	if (!rawPath) {
		return '';
	}
	let pattern = `${rawPath}`.trim();
	// Accept both "~/"-prefixed and plain relative patterns (jar seems to accept both).
	if (pattern.startsWith('~/') || pattern.startsWith('~\\')) {
		pattern = pattern.slice(2);
	}
	if (pattern.startsWith('./') || pattern.startsWith('.\\')) {
		pattern = pattern.slice(2);
	}
	// Normalize separators to posix for globbing.
	pattern = pattern.replaceAll('\\', '/');
	// Avoid absolute patterns; treat as project-relative.
	if (pattern.startsWith('/')) {
		pattern = pattern.slice(1);
	}
	return pattern;
}

function lineNumberAtIndex(text, index) {
	// 1-based line numbers
	return text.slice(0, index).split(/\r?\n/).length;
}

function extractPathEntriesFromXml(xml) {
	const entries = [];
	const regex = /<path>([\s\S]*?)<\/path>/g;
	let match;
	while ((match = regex.exec(xml)) !== null) {
		entries.push({
			rawPath: `${match[1]}`.trim(),
			lineNumber: lineNumberAtIndex(xml, match.index),
		});
	}
	return entries;
}

module.exports = class DeployXmlService {
	constructor(projectFolder) {
		this._projectFolder = projectFolder;
	}

	getDeployXmlPath() {
		return path.join(this._projectFolder, DEPLOY_XML_FILE);
	}

	readDeployXml() {
		const deployXmlPath = this.getDeployXmlPath();
		if (!fs.existsSync(deployXmlPath)) {
			return {
				ok: false,
				errorMessages: [
					'There is no deploy.xml file in the project folder. Download a template and paste it into your project folder. ' +
						'To download a template for a deploy.xml file, see https://system.netsuite.com/app/help/helpcenter.nl?fid=section_4737888643.html.',
				],
			};
		}
		return { ok: true, deployXmlPath, xml: fs.readFileSync(deployXmlPath, 'utf8') };
	}

	async getDeployPathPatterns(variables) {
		const entriesResult = await this.getDeployPathEntries(variables);
		if (!entriesResult.ok) {
			return entriesResult;
		}
		return { ok: true, patterns: entriesResult.entries.map((entry) => entry.pattern).filter(Boolean) };
	}

	async getDeployPathEntries(variables) {
		const deployXmlRead = this.readDeployXml();
		if (!deployXmlRead.ok) {
			return deployXmlRead;
		}

		let parsed;
		try {
			const parser = new xml2js.Parser({ explicitArray: false, trim: true });
			parsed = await parser.parseStringPromise(deployXmlRead.xml);
		} catch (error) {
			return {
				ok: false,
				errorMessages: ['The deploy.xml file contains errors. Check the file structure.'],
			};
		}

		const rootKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
		if (rootKeys.length !== 1 || rootKeys[0] !== 'deploy') {
			return {
				ok: false,
				errorMessages: [
					'The deploy.xml root tag name must be "deploy".\nThe deploy.xml file contains errors. Check the file structure.',
				],
			};
		}

		const rawEntries = extractPathEntriesFromXml(deployXmlRead.xml);
		const entries = rawEntries.map((rawEntry) => {
			const substituted = substituteVariables(rawEntry.rawPath, variables);
			return {
				...rawEntry,
				pattern: normalizeDeployPathPattern(substituted),
			};
		});

		return { ok: true, entries };
	}
};
