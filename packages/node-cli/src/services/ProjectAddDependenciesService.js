/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const ProjectInfoService = require('./ProjectInfoService');

function toArray(value) {
	if (value === undefined || value === null) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

function normalizeScriptId(value) {
	const raw = `${value || ''}`.trim();
	if (!raw) {
		return '';
	}
	return raw.split('.')[0];
}

function listFilesRecursive(rootDir, predicate) {
	const found = [];
	if (!rootDir || !fs.existsSync(rootDir)) {
		return found;
	}

	const stack = [rootDir];
	while (stack.length > 0) {
		const current = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch (e) {
			continue;
		}

		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(fullPath);
				continue;
			}
			if (entry.isFile() && (!predicate || predicate(fullPath))) {
				found.push(fullPath);
			}
		}
	}
	return found;
}

function extractBracketDependencies(xmlText) {
	const text = `${xmlText || ''}`;
	if (!text) {
		return [];
	}

	const out = [];
	const regex = /<dependency>\s*\[([^\]]+)\]\s*<\/dependency>/gi;
	let match;
	while ((match = regex.exec(text)) !== null) {
		out.push(match[1]);
	}
	return out;
}

function parseDependencyQualifierString(input) {
	const raw = `${input || ''}`.trim();
	if (!raw) {
		return {};
	}

	const qualifiers = {};
	for (const part of raw.split(',')) {
		const trimmed = `${part || ''}`.trim();
		if (!trimmed) {
			continue;
		}
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex === -1) {
			continue;
		}
		const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
		const value = trimmed.slice(eqIndex + 1).trim();
		if (!key || !value) {
			continue;
		}
		qualifiers[key] = value;
	}

	return {
		appId: qualifiers.appid || '',
		bundleId: qualifiers.bundleid || '',
		scriptId: qualifiers.scriptid || '',
		objectType: qualifiers.objecttype || '',
	};
}

function buildFeatureNode(value, required) {
	return {
		_: value,
		$: { required: required ? 'true' : 'false' },
	};
}

function normalizeFeatureValue(value) {
	return `${value || ''}`.trim();
}

function normalizeBooleanAttribute(value) {
	return `${value || ''}`.trim().toLowerCase() === 'true';
}

function readFeatureNodes(existing) {
	const nodes = toArray(existing);
	return nodes
		.map((node) => {
			if (typeof node === 'string') {
				return { value: normalizeFeatureValue(node), required: false };
			}
			const value = normalizeFeatureValue(node && node._ ? node._ : '');
			const required = normalizeBooleanAttribute(node && node.$ ? node.$.required : false);
			return { value, required };
		})
		.filter((f) => f.value);
}

function hasAnyFileWithExtension(rootDir, extensionLowerCase) {
	const files = listFilesRecursive(rootDir, (p) => {
		const lower = `${p}`.toLowerCase();
		if (!lower.endsWith(extensionLowerCase)) {
			return false;
		}
		return !lower.includes(`${path.sep}.attributes${path.sep}`);
	});
	return files.length > 0;
}

module.exports = class ProjectAddDependenciesService {
	async addDependencies(options) {
		const projectFolder = options && options.projectFolder ? `${options.projectFolder}` : '';
		if (!projectFolder) {
			return { ok: false, errorMessages: ['Missing project folder.'] };
		}

		const manifestPath = path.join(projectFolder, 'manifest.xml');
		if (!fs.existsSync(manifestPath)) {
			return { ok: false, errorMessages: [`The file ${manifestPath} was not found in the project.`] };
		}

		try {
			fs.accessSync(manifestPath, fs.constants.W_OK);
		} catch (e) {
			return { ok: false, errorMessages: [`The file ${manifestPath} must be writable.`] };
		}

		const projectInfo = new ProjectInfoService(projectFolder);
		if (!projectInfo.isSuiteAppProject()) {
			return { ok: true, addedDependencies: [] };
		}

		const all = Boolean(options && options.all);
		const featureRefs = (options && options.featureRefs) || [];
		const fileRefs = (options && options.fileRefs) || [];
		const objectRefs = (options && options.objectRefs) || [];

		let parsed;
		try {
			const parser = new xml2js.Parser({ explicitArray: false, trim: true });
			parsed = await parser.parseStringPromise(fs.readFileSync(manifestPath, 'utf8'));
		} catch (e) {
			return { ok: false, errorMessages: ['The manifest.xml file contains errors. Check the file structure.'] };
		}

		if (!parsed || !parsed.manifest) {
			return { ok: false, errorMessages: ['The manifest.xml file contains errors. Check the file structure.'] };
		}

		const manifest = parsed.manifest;
		manifest.dependencies = manifest.dependencies || {};

		const addedDependencies = [];

		const existingFeatures = readFeatureNodes(manifest.dependencies.features && manifest.dependencies.features.feature);
		const existingFeatureByValue = new Map(existingFeatures.map((f) => [f.value, f]));

		const ensureFeature = (value, required) => {
			const normalized = normalizeFeatureValue(value);
			if (!normalized) {
				return;
			}

			const existing = existingFeatureByValue.get(normalized);
			if (!existing) {
				existingFeatureByValue.set(normalized, { value: normalized, required });
				addedDependencies.push({ type: 'FEATURE', value: normalized, required: Boolean(required) });
				return;
			}
			if (required && existing.required !== true) {
				existing.required = true;
				addedDependencies.push({ type: 'FEATURE', value: normalized, required: true });
			}
		};

		const existingObjects = new Set(toArray(manifest.dependencies.objects && manifest.dependencies.objects.object).map((o) => `${o}`.trim()).filter(Boolean));

		const existingObjectsByAppId = new Map();
		const applications = toArray(manifest.dependencies.applications && manifest.dependencies.applications.application);
		for (const app of applications) {
			const id = app && app.$ ? `${app.$.id || ''}`.trim() : '';
			if (!id) {
				continue;
			}
			const objects = new Set(toArray(app.objects && app.objects.object).map((o) => `${o}`.trim()).filter(Boolean));
			existingObjectsByAppId.set(id, objects);
		}

		const ensureApplicationObject = (appId, scriptId) => {
			const app = `${appId || ''}`.trim();
			const script = normalizeScriptId(scriptId);
			if (!app || !script) {
				return;
			}
			const set = existingObjectsByAppId.get(app) || new Set();
			if (set.has(script)) {
				return;
			}
			set.add(script);
			existingObjectsByAppId.set(app, set);
			addedDependencies.push({ type: 'OBJECT', scriptId: script, appId: app });
		};

		const ensureRootObject = (scriptId) => {
			const script = normalizeScriptId(scriptId);
			if (!script) {
				return;
			}
			if (existingObjects.has(script)) {
				return;
			}
			existingObjects.add(script);
			addedDependencies.push({ type: 'OBJECT', scriptId: script });
		};

		const ensureFile = (filePath) => {
			const normalized = `${filePath || ''}`.trim();
			if (!normalized) {
				return;
			}
			manifest.dependencies.files = manifest.dependencies.files || {};
			const existing = new Set(
				toArray(manifest.dependencies.files.file).map((f) => `${f}`.trim()).filter(Boolean)
			);
			if (existing.has(normalized)) {
				return;
			}
			existing.add(normalized);
			manifest.dependencies.files.file = [...existing].sort();
			addedDependencies.push({ type: 'FILE', value: normalized });
		};

		if (!all) {
			for (const featureRef of featureRefs) {
				const [featureName, requirement] = `${featureRef || ''}`.split(':');
				if (!featureName) {
					continue;
				}
				ensureFeature(featureName, `${requirement || ''}`.trim().toLowerCase() !== 'optional');
			}
			for (const fileRef of fileRefs) {
				ensureFile(fileRef);
			}
			for (const objectRef of objectRefs) {
				ensureRootObject(objectRef);
			}
		} else {
			const selfAppId = projectInfo.getApplicationId();

			if (hasAnyFileWithExtension(path.join(projectFolder, 'FileCabinet'), '.js')) {
				ensureFeature('SERVERSIDESCRIPTING', true);
			}

			const objectsDir = path.join(projectFolder, 'Objects');
			const objectXmlFiles = listFilesRecursive(objectsDir, (p) => `${p}`.toLowerCase().endsWith('.xml'));
			for (const xmlPath of objectXmlFiles) {
				let xmlText;
				try {
					xmlText = fs.readFileSync(xmlPath, 'utf8');
				} catch (e) {
					continue;
				}

				if (/<customrecordtype\b/i.test(xmlText)) {
					ensureFeature('CUSTOMRECORDS', true);
				}

				for (const qualifierText of extractBracketDependencies(xmlText)) {
					const dep = parseDependencyQualifierString(qualifierText);
					const depScriptId = normalizeScriptId(dep.scriptId);
					if (!depScriptId) {
						continue;
					}

					if (dep.appId && dep.appId !== selfAppId) {
						ensureApplicationObject(dep.appId, depScriptId);
						continue;
					}
				}
			}
		}

		if (addedDependencies.length === 0) {
			return { ok: true, addedDependencies: [] };
		}

		if (existingFeatureByValue.size > 0) {
			manifest.dependencies.features = manifest.dependencies.features || {};
			manifest.dependencies.features.feature = [...existingFeatureByValue.values()]
				.sort((a, b) => a.value.localeCompare(b.value))
				.map((f) => buildFeatureNode(f.value, f.required));
		} else {
			delete manifest.dependencies.features;
		}

		if (existingObjects.size > 0) {
			manifest.dependencies.objects = manifest.dependencies.objects || {};
			manifest.dependencies.objects.object = [...existingObjects].sort();
		}

		if (existingObjectsByAppId.size > 0) {
			manifest.dependencies.applications = manifest.dependencies.applications || {};
			manifest.dependencies.applications.application = [...existingObjectsByAppId.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([appId, objectsSet]) => ({
					$: { id: appId },
					objects: { object: [...objectsSet].sort() },
				}));
		}

		try {
			const builder = new xml2js.Builder({
				headless: true,
				renderOpts: { pretty: true, indent: '  ', newline: '\n' },
			});
			const xml = builder.buildObject(parsed);
			fs.writeFileSync(manifestPath, xml.endsWith('\n') ? xml : `${xml}\n`, 'utf8');
		} catch (e) {
			return { ok: false, errorMessages: ['Unable to write manifest.xml with dependencies.'] };
		}

		return { ok: true, addedDependencies };
	}
};
