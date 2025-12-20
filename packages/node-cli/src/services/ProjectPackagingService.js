/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const fg = require('fast-glob');
const yazl = require('yazl');

const ProjectInfoService = require('./ProjectInfoService');
const DeployXmlService = require('./DeployXmlService');

const MANIFEST_XML_FILE = 'manifest.xml';
const DEPLOY_XML_FILE = 'deploy.xml';

function normalizeProjectName(value) {
	if (Array.isArray(value)) {
		return value.length > 0 ? `${value[0]}` : '';
	}
	return value ? `${value}` : '';
}

function pad2(num) {
	return `${num}`.padStart(2, '0');
}

function formatZipTimestamp(date) {
	// Matches the Oracle jar format: YYYY-MM-DD_HH-mm-ss (local time)
	const yyyy = date.getFullYear();
	const mm = pad2(date.getMonth() + 1);
	const dd = pad2(date.getDate());
	const hh = pad2(date.getHours());
	const min = pad2(date.getMinutes());
	const ss = pad2(date.getSeconds());
	return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

function sanitizeZipBaseName(name) {
	// Keep it readable, but avoid path separators.
	return `${name}`.replaceAll('/', '_').replaceAll('\\', '_').trim() || 'SuiteCloudProject';
}

function isSubPath(rootDir, candidatePath) {
	const relative = path.relative(rootDir, candidatePath);
	return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeZipPath(p) {
	return `${p}`.replaceAll('\\', '/');
}

async function resolveDeployEntries(projectFolder, patterns) {
	const options = {
		cwd: projectFolder,
		dot: true,
		onlyFiles: false,
		unique: true,
		markDirectories: true,
		followSymbolicLinks: false,
	};

	const baseMatches = await fg(patterns, options);
	const directories = new Set();
	const files = new Set();

	for (const match of baseMatches) {
		const normalizedMatch = normalizeZipPath(match);
		const isDirectory = normalizedMatch.endsWith('/');
		const resolvedPath = path.resolve(projectFolder, isDirectory ? normalizedMatch.slice(0, -1) : normalizedMatch);

		if (!isSubPath(projectFolder, resolvedPath)) {
			// Security: never include files outside of the project folder.
			continue;
		}

		if (isDirectory) {
			directories.add(normalizedMatch);
			const recursiveMatches = await fg([`${normalizedMatch}**`], options);
			for (const recursiveMatch of recursiveMatches) {
				const normalizedRecursive = normalizeZipPath(recursiveMatch);
				const recursiveIsDir = normalizedRecursive.endsWith('/');
				const resolvedRecursivePath = path.resolve(
					projectFolder,
					recursiveIsDir ? normalizedRecursive.slice(0, -1) : normalizedRecursive
				);
				if (!isSubPath(projectFolder, resolvedRecursivePath)) {
					continue;
				}
				if (recursiveIsDir) {
					directories.add(normalizedRecursive);
				} else {
					files.add(normalizedRecursive);
				}
			}
		} else {
			files.add(normalizedMatch);
		}
	}

	// Do not include root metadata files via patterns; we'll add them explicitly in stable order.
	files.delete(MANIFEST_XML_FILE);
	files.delete(DEPLOY_XML_FILE);

	return { directories: Array.from(directories), files: Array.from(files) };
}

function createZip({ projectFolder, outputZipPath, packagingTime, directories, files }) {
	return new Promise((resolve, reject) => {
		const zipfile = new yazl.ZipFile();

		const addFile = (relativePath) => {
			const absPath = path.join(projectFolder, relativePath);
			zipfile.addFile(absPath, normalizeZipPath(relativePath), { mtime: packagingTime });
		};

		// Root metadata first (matches jar expectations)
		addFile(DEPLOY_XML_FILE);
		addFile(MANIFEST_XML_FILE);

		// Directories and files
		for (const dir of directories.sort()) {
			zipfile.addEmptyDirectory(dir, { mtime: packagingTime });
		}
		for (const file of files.sort()) {
			addFile(file);
		}

		fs.mkdirSync(path.dirname(outputZipPath), { recursive: true });
		const outStream = fs.createWriteStream(outputZipPath);
		outStream.on('error', reject);
		zipfile.outputStream
			.pipe(outStream)
			.on('close', () => resolve())
			.on('error', reject);
		zipfile.end();
	});
}

module.exports = class ProjectPackagingService {
	async packageProject({ projectFolder, destinationFolder }) {
		if (!projectFolder || !fs.existsSync(projectFolder)) {
			return { ok: false, errorMessages: [`Project folder "${projectFolder}" does not exist.`] };
		}

		const projectInfoService = new ProjectInfoService(projectFolder);
		const projectName = sanitizeZipBaseName(normalizeProjectName(projectInfoService.getProjectName()));
		const packagingTime = new Date();

		const deployXmlService = new DeployXmlService(projectFolder);
		const variables = {
			applicationId: projectInfoService.getApplicationId(),
			publisherId: projectInfoService.getPublisherId(),
			projectId: projectInfoService.getProjectId(),
		};

		const deployPatternsResult = await deployXmlService.getDeployPathPatterns(variables);
		if (!deployPatternsResult.ok) {
			return { ok: false, errorMessages: deployPatternsResult.errorMessages };
		}

		const { directories, files } = await resolveDeployEntries(projectFolder, deployPatternsResult.patterns);

		const zipFileName = `${projectName}-${formatZipTimestamp(packagingTime)}.zip`;
		const outputZipPath = path.join(destinationFolder || os.tmpdir(), zipFileName);

		try {
			await createZip({ projectFolder, outputZipPath, packagingTime, directories, files });
		} catch (error) {
			return {
				ok: false,
				errorMessages: [`Failed to create zip: ${error && error.message ? error.message : error}`],
			};
		}

		return {
			ok: true,
			outputZipPath,
			resultMessage: `The ${outputZipPath} file has been successfully created.`,
		};
	}
};

