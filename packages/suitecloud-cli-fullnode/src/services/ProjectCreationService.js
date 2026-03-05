/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { FILES, FOLDERS, PROJECT_ACP, PROJECT_SUITEAPP } = require('../ApplicationConstants');

const FRAMEWORK_VERSION = '1.0';

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, content, 'utf8');
}

function escapeXml(value) {
	return `${value}`
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function buildAcpManifestXml(projectName) {
	return (
		`<manifest projecttype="${PROJECT_ACP}">\n` +
		`  <projectname>${escapeXml(projectName)}</projectname>\n` +
		`  <frameworkversion>${FRAMEWORK_VERSION}</frameworkversion>\n` +
		`</manifest>\n`
	);
}

function buildSuiteAppManifestXml({ publisherId, projectId, projectName, projectVersion }) {
	return (
		`<manifest projecttype="${PROJECT_SUITEAPP}">\n` +
		`  <publisherid>${escapeXml(publisherId)}</publisherid>\n` +
		`  <projectid>${escapeXml(projectId)}</projectid>\n` +
		`  <projectname>${escapeXml(projectName)}</projectname>\n` +
		`  <projectversion>${escapeXml(projectVersion)}</projectversion>\n` +
		`  <frameworkversion>${FRAMEWORK_VERSION}</frameworkversion>\n` +
		`</manifest>\n`
	);
}

function buildAcpDeployXml() {
	return (
		`<deploy>\n` +
		`    <configuration>\n` +
		`        <path>~/AccountConfiguration/*</path>\n` +
		`    </configuration>\n` +
		`    <files>\n` +
		`        <path>~/FileCabinet/*</path>\n` +
		`    </files>\n` +
		`    <objects>\n` +
		`        <path>~/Objects/*</path>\n` +
		`    </objects>\n` +
		`    <translationimports>\n` +
		`        <path>~/Translations/*</path>\n` +
		`    </translationimports>\n` +
		`</deploy>\n`
	);
}

function buildSuiteAppDeployXml(applicationId) {
	return (
		`<deploy>\n` +
		`    <files>\n` +
		`        <path>~/FileCabinet/SuiteApps/${escapeXml(applicationId)}/*</path>\n` +
		`    </files>\n` +
		`    <objects>\n` +
		`        <path>~/Objects/*</path>\n` +
		`    </objects>\n` +
		`    <translationimports>\n` +
		`        <path>~/Translations/*</path>\n` +
		`    </translationimports>\n` +
		`</deploy>\n`
	);
}

function buildLockingXml() {
	return (
		`<!-- SuiteCloud installation preference (locking). See NetSuite docs for details. -->\n` +
		`<preference type="LOCKING" defaultAction="LOCK">\n` +
		`    <apply action="UNLOCK">\n` +
		`    </apply>\n` +
		`</preference>\n`
	);
}

function buildHidingXml() {
	return (
		`<!-- SuiteCloud installation preference (hiding). See NetSuite docs for details. -->\n` +
		`<preference type="HIDING" defaultAction="HIDE">\n` +
		`    <apply action="UNHIDE">\n` +
		`    </apply>\n` +
		`</preference>\n`
	);
}

function buildOverwritingXml() {
	return (
		`<!-- SuiteCloud installation preference (overwriting). See NetSuite docs for details. -->\n` +
		`<preference type="OVERWRITING">\n` +
		`</preference>\n`
	);
}

module.exports = class ProjectCreationService {
	createProject(params) {
		const parentDirectory = params.parentDirectory;
		const projectType = params.type;
		const projectName = params.projectName;

		if (projectType === PROJECT_ACP) {
			const projectPath = path.join(parentDirectory, projectName);
			ensureDir(projectPath);
			writeFile(path.join(projectPath, FILES.MANIFEST_XML), buildAcpManifestXml(projectName));
			writeFile(path.join(projectPath, 'deploy.xml'), buildAcpDeployXml());
			return projectPath;
		}

		if (projectType === PROJECT_SUITEAPP) {
			const applicationId = `${params.publisherId}.${params.projectId}`;
			const projectPath = path.join(parentDirectory, applicationId);
			ensureDir(projectPath);
			writeFile(
				path.join(projectPath, FILES.MANIFEST_XML),
				buildSuiteAppManifestXml({
					publisherId: params.publisherId,
					projectId: params.projectId,
					projectName: projectName,
					projectVersion: params.projectVersion,
				})
			);
			writeFile(path.join(projectPath, 'deploy.xml'), buildSuiteAppDeployXml(applicationId));

			const installationPrefsDir = path.join(projectPath, FOLDERS.INSTALLATION_PREFERENCES);
			ensureDir(installationPrefsDir);
			writeFile(path.join(installationPrefsDir, FILES.LOCKING_PREFERENCE), buildLockingXml());
			writeFile(path.join(installationPrefsDir, FILES.HIDING_PREFERENCE), buildHidingXml());
			writeFile(path.join(installationPrefsDir, 'overwriting.xml'), buildOverwritingXml());

			return projectPath;
		}

		throw new Error(`Unsupported project type "${projectType}".`);
	}
};

