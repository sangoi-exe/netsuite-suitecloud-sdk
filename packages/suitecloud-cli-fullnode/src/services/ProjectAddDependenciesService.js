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
		bundleIds: `${qualifiers.bundleid || ''}`
			.split('|')
			.map((value) => `${value}`.trim())
			.filter(Boolean),
		scriptId: qualifiers.scriptid || '',
		objectType: qualifiers.objecttype || '',
		filePath: qualifiers.file || qualifiers.filepath || qualifiers.path || qualifiers.fileref || '',
		folderPath: qualifiers.folder || qualifiers.folderpath || '',
		feature: qualifiers.feature || '',
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

function normalizeFileCabinetPath(value) {
	const raw = `${value || ''}`.trim().replaceAll('\\', '/');
	if (!raw) {
		return '';
	}

	const withoutQuotes = raw.replaceAll(/^[\"']+|[\"']+$/g, '');
	const normalized = withoutQuotes.replaceAll(/[),;\]]+$/g, '');
	if (!normalized) {
		return '';
	}

	if (normalized.startsWith('/FileCabinet/')) {
		return normalized.slice('/FileCabinet'.length);
	}
	if (normalized.startsWith('FileCabinet/')) {
		return `/${normalized.slice('FileCabinet/'.length)}`;
	}
	return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeBooleanAttribute(value) {
	return `${value || ''}`.trim().toLowerCase() === 'true';
}

function readBundleNodes(existing) {
	const bundlesById = new Map();
	for (const node of toArray(existing)) {
		if (!node) {
			continue;
		}

		if (typeof node === 'string') {
			const ids = `${node}`
				.split('|')
				.map((id) => `${id}`.trim())
				.filter(Boolean);
			for (const id of ids) {
				if (!bundlesById.has(id)) {
					bundlesById.set(id, new Set());
				}
			}
			continue;
		}

		const id = `${(node.$ && node.$.id) || node.id || node._ || ''}`.trim();
		if (!id) {
			continue;
		}
		const objects = new Set(
			toArray(node.objects && node.objects.object)
				.map((objectValue) => normalizeScriptId(objectValue))
				.filter(Boolean)
		);
		bundlesById.set(id, objects);
	}
	return bundlesById;
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

			const existingObjects = new Set(
				toArray(manifest.dependencies.objects && manifest.dependencies.objects.object)
					.map((objectValue) => normalizeScriptId(objectValue))
					.filter(Boolean)
			);

			const appDependenciesById = new Map();
			const applications = toArray(manifest.dependencies.applications && manifest.dependencies.applications.application);
			for (const app of applications) {
				const id = `${(app && app.$ && app.$.id) || ''}`.trim();
				if (!id) {
					continue;
				}
				const objects = new Set(
					toArray(app.objects && app.objects.object)
						.map((objectValue) => normalizeScriptId(objectValue))
						.filter(Boolean)
				);
				const platformExtensions = new Set(
					toArray(app.platformextensions && app.platformextensions.platformextension)
						.map((platformExtension) => {
							if (typeof platformExtension === 'string') {
								return `${platformExtension}`.trim();
							}
							return `${(platformExtension && platformExtension.objecttype) || ''}`.trim();
						})
						.filter(Boolean)
				);
				appDependenciesById.set(id, { objects, platformExtensions });
			}

			const existingFiles = new Set(
				toArray(manifest.dependencies.files && manifest.dependencies.files.file)
					.map((fileValue) => normalizeFileCabinetPath(fileValue))
					.filter(Boolean)
			);
			const existingFolders = new Set(
				toArray(manifest.dependencies.folders && manifest.dependencies.folders.folder)
					.map((folderValue) => normalizeFileCabinetPath(folderValue))
					.filter(Boolean)
			);
			const bundleDependenciesById = readBundleNodes(manifest.dependencies.bundles && manifest.dependencies.bundles.bundle);

			const ensureApplicationObject = (appId, scriptId) => {
				const app = `${appId || ''}`.trim();
				const script = normalizeScriptId(scriptId);
				if (!app || !script) {
					return;
				}
				const existing = appDependenciesById.get(app) || { objects: new Set(), platformExtensions: new Set() };
				if (existing.objects.has(script)) {
					return;
				}
				existing.objects.add(script);
				appDependenciesById.set(app, existing);
				addedDependencies.push({ type: 'OBJECT', scriptId: script, appId: app });
			};

			const ensureApplicationPlatformExtension = (appId, objectType) => {
				const app = `${appId || ''}`.trim();
				const normalizedObjectType = `${objectType || ''}`.trim();
				if (!app || !normalizedObjectType) {
					return;
				}
				const existing = appDependenciesById.get(app) || { objects: new Set(), platformExtensions: new Set() };
				if (existing.platformExtensions.has(normalizedObjectType)) {
					return;
				}
				existing.platformExtensions.add(normalizedObjectType);
				appDependenciesById.set(app, existing);
				addedDependencies.push({ type: 'PLATFORMEXTENSION', appId: app, objectType: normalizedObjectType });
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
				const normalized = normalizeFileCabinetPath(filePath);
				if (!normalized) {
					return;
				}
				if (existingFiles.has(normalized)) {
					return;
				}
				existingFiles.add(normalized);
				addedDependencies.push({ type: 'FILE', value: normalized });
			};

			const ensureFolder = (folderPath) => {
				const normalized = normalizeFileCabinetPath(folderPath);
				if (!normalized) {
					return;
				}
				if (existingFolders.has(normalized)) {
					return;
				}
				existingFolders.add(normalized);
				addedDependencies.push({ type: 'FOLDER', value: normalized });
			};

			const ensureBundleDependency = (bundleId) => {
				const normalized = `${bundleId || ''}`.trim();
				if (!normalized) {
					return;
				}
				if (bundleDependenciesById.has(normalized)) {
					return;
				}
				bundleDependenciesById.set(normalized, new Set());
				addedDependencies.push({ type: 'BUNDLE', value: normalized });
			};

			const ensureBundleObjectDependency = (bundleId, scriptId) => {
				const normalizedBundleId = `${bundleId || ''}`.trim();
				const normalizedScriptId = normalizeScriptId(scriptId);
				if (!normalizedBundleId || !normalizedScriptId) {
					return;
				}
				const existingObjectsForBundle = bundleDependenciesById.get(normalizedBundleId) || new Set();
				if (existingObjectsForBundle.has(normalizedScriptId)) {
					return;
				}
				existingObjectsForBundle.add(normalizedScriptId);
				bundleDependenciesById.set(normalizedBundleId, existingObjectsForBundle);
				addedDependencies.push({ type: 'OBJECT', scriptId: normalizedScriptId, bundleIds: normalizedBundleId });
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

						if (dep.feature) {
							const [featureName, requirement] = `${dep.feature}`.split(':');
							ensureFeature(featureName, `${requirement || ''}`.trim().toLowerCase() !== 'optional');
						}
						if (dep.filePath) {
							ensureFile(dep.filePath);
						}
						if (dep.folderPath) {
							ensureFolder(dep.folderPath);
						}
						if (dep.appId && dep.objectType && dep.appId !== selfAppId) {
							ensureApplicationPlatformExtension(dep.appId, dep.objectType);
						}
						if (dep.bundleIds && dep.bundleIds.length > 0) {
							for (const bundleId of dep.bundleIds) {
								if (depScriptId) {
									ensureBundleObjectDependency(bundleId, depScriptId);
								} else {
									ensureBundleDependency(bundleId);
								}
							}
						}
						if (dep.appId && depScriptId && dep.appId !== selfAppId) {
							ensureApplicationObject(dep.appId, depScriptId);
							continue;
						}
						if (!dep.appId && (!dep.bundleIds || dep.bundleIds.length === 0) && depScriptId) {
							ensureRootObject(depScriptId);
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
			} else {
				delete manifest.dependencies.objects;
			}

			if (existingFiles.size > 0) {
				manifest.dependencies.files = manifest.dependencies.files || {};
				manifest.dependencies.files.file = [...existingFiles].sort();
			} else {
				delete manifest.dependencies.files;
			}

			if (existingFolders.size > 0) {
				manifest.dependencies.folders = manifest.dependencies.folders || {};
				manifest.dependencies.folders.folder = [...existingFolders].sort();
			} else {
				delete manifest.dependencies.folders;
			}

			const applicationEntries = [...appDependenciesById.entries()]
				.map(([appId, dependencyInfo]) => ({
					appId,
					objects: dependencyInfo && dependencyInfo.objects ? dependencyInfo.objects : new Set(),
					platformExtensions:
						dependencyInfo && dependencyInfo.platformExtensions ? dependencyInfo.platformExtensions : new Set(),
				}))
				.filter((entry) => entry.objects.size > 0 || entry.platformExtensions.size > 0);
			if (applicationEntries.length > 0) {
				manifest.dependencies.applications = manifest.dependencies.applications || {};
				manifest.dependencies.applications.application = applicationEntries
					.sort((left, right) => left.appId.localeCompare(right.appId))
					.map((entry) => {
						const applicationDependency = { $: { id: entry.appId } };
						if (entry.objects.size > 0) {
							applicationDependency.objects = { object: [...entry.objects].sort() };
						}
						if (entry.platformExtensions.size > 0) {
							applicationDependency.platformextensions = {
								platformextension: [...entry.platformExtensions]
									.sort()
									.map((objectType) => ({ objecttype: objectType })),
							};
						}
						return applicationDependency;
					});
			} else {
				delete manifest.dependencies.applications;
			}

			const bundleEntries = [...bundleDependenciesById.entries()]
				.map(([bundleId, objectsSet]) => ({ bundleId, objectsSet: objectsSet || new Set() }))
				.filter((entry) => entry.bundleId);
			if (bundleEntries.length > 0) {
				manifest.dependencies.bundles = manifest.dependencies.bundles || {};
				manifest.dependencies.bundles.bundle = bundleEntries
					.sort((left, right) => left.bundleId.localeCompare(right.bundleId))
					.map((entry) => {
						if (entry.objectsSet.size === 0) {
							return entry.bundleId;
						}
						return {
							$: { id: entry.bundleId },
							objects: { object: [...entry.objectsSet].sort() },
						};
					});
			} else {
				delete manifest.dependencies.bundles;
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
