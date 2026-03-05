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

module.exports = class ProjectPreviewService {
	async previewProject({ projectFolder }) {
		if (!projectFolder || !fs.existsSync(projectFolder)) {
			return { ok: false, errorMessages: [`Project folder "${projectFolder}" does not exist.`] };
		}

		const projectInfoService = new ProjectInfoService(projectFolder);
		const variables = {
			applicationId: projectInfoService.getApplicationId(),
			publisherId: projectInfoService.getPublisherId(),
			projectId: projectInfoService.getProjectId(),
		};

		const deployXmlService = new DeployXmlService(projectFolder);
		const deployPatternsResult = await deployXmlService.getDeployPathPatterns(variables);
		if (!deployPatternsResult.ok) {
			return { ok: false, errorMessages: deployPatternsResult.errorMessages };
		}

		const matches = await fg(deployPatternsResult.patterns, {
			cwd: projectFolder,
			dot: true,
			onlyFiles: false,
			unique: true,
			markDirectories: true,
			followSymbolicLinks: false,
		});

		const entries = new Set(['deploy.xml', 'manifest.xml']);
		for (const match of matches) {
			entries.add(match.replaceAll('\\', '/'));
		}

		return { ok: true, entries: Array.from(entries).sort() };
	}
};

