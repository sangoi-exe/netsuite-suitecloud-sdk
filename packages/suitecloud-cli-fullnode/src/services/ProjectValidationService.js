/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');

const DeployXmlService = require('./DeployXmlService');
const ProjectInfoService = require('./ProjectInfoService');

module.exports = class ProjectValidationService {
	async validateProject({ projectFolder }) {
		const warnings = [];
		const errors = [];

		if (!projectFolder || !fs.existsSync(projectFolder)) {
			return {
				warnings,
				errors: [
					{
						filePath: projectFolder || '<project>',
						lineNumber: 1,
						message: `Project folder "${projectFolder}" does not exist.`,
					},
				],
			};
		}

		const manifestPath = path.join(projectFolder, 'manifest.xml');
		if (!fs.existsSync(manifestPath)) {
			errors.push({
				filePath: manifestPath,
				lineNumber: 1,
				message: `The file ${manifestPath} was not found in the project.`,
			});
			return { warnings, errors };
		}

		let projectInfoService;
		try {
			projectInfoService = new ProjectInfoService(projectFolder);
		} catch (error) {
			errors.push({
				filePath: manifestPath,
				lineNumber: 1,
				message: error && error.getErrorMessage ? error.getErrorMessage() : `${error}`,
			});
			return { warnings, errors };
		}

		const variables = {
			applicationId: projectInfoService.getApplicationId(),
			publisherId: projectInfoService.getPublisherId(),
			projectId: projectInfoService.getProjectId(),
		};

		const deployXmlService = new DeployXmlService(projectFolder);
		const deployRead = deployXmlService.readDeployXml();
		if (!deployRead.ok) {
			errors.push({
				filePath: path.join(projectFolder, 'deploy.xml'),
				lineNumber: 1,
				message: deployRead.errorMessages[0],
			});
			return { warnings, errors };
		}

		const deployEntriesResult = await deployXmlService.getDeployPathEntries(variables);
		if (!deployEntriesResult.ok) {
			errors.push({
				filePath: path.join(projectFolder, 'deploy.xml'),
				lineNumber: 1,
				message: deployEntriesResult.errorMessages.join('\n'),
			});
			return { warnings, errors };
		}

		const patterns = deployEntriesResult.entries.map((e) => e.pattern).filter(Boolean);
		for (const entry of deployEntriesResult.entries) {
			const pattern = entry.pattern;
			if (!pattern) {
				continue;
			}
			if (pattern.includes('..')) {
				errors.push({
					filePath: path.join(projectFolder, 'deploy.xml'),
					lineNumber: entry.lineNumber || 1,
					message: `Invalid deploy.xml path pattern: "${entry.rawPath}".`,
				});
				continue;
			}

			const matches = await fg([pattern], {
				cwd: projectFolder,
				dot: true,
				onlyFiles: false,
				followSymbolicLinks: false,
			});
			if (!matches || matches.length === 0) {
				warnings.push({
					filePath: path.join(projectFolder, 'deploy.xml'),
					lineNumber: entry.lineNumber || 1,
					message: `Pattern did not match any files: "${entry.rawPath}".`,
				});
			}
		}

		// If deploy.xml has no <path> entries at all, that's almost certainly a config error.
		if (patterns.length === 0) {
			warnings.push({
				filePath: path.join(projectFolder, 'deploy.xml'),
				lineNumber: 1,
				message: 'No <path> entries were found in deploy.xml.',
			});
		}

		return { warnings, errors };
	}
};

