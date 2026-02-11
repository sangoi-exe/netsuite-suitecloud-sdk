/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const NodeSdkExecutor = require('../../src/core/sdkexecutor/NodeSdkExecutor');
const SdkExecutionContext = require('../../src/SdkExecutionContext');

function mkTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-adddeps-test-'));
}

function writeManifestSuiteApp(projectFolder) {
	const manifestXml =
		'<manifest projecttype="SUITEAPP">' +
		'<publisherid>com.example</publisherid>' +
		'<projectid>myapp</projectid>' +
		'<projectname>Test</projectname>' +
		'<projectversion>1.0.0</projectversion>' +
		'<frameworkversion>1.0</frameworkversion>' +
		'</manifest>';
	fs.writeFileSync(path.join(projectFolder, 'manifest.xml'), manifestXml, 'utf8');
}

describe('NodeSdkExecutor adddependencies', () => {
	test('adddependencies -all updates manifest.xml with required features and application object dependencies', async () => {
		const projectFolder = mkTempDir();
		writeManifestSuiteApp(projectFolder);

		fs.mkdirSync(path.join(projectFolder, 'Objects'), { recursive: true });
		fs.mkdirSync(path.join(projectFolder, 'FileCabinet', 'SuiteApps', 'com.example.myapp', 'SuiteScripts'), { recursive: true });

		fs.writeFileSync(
			path.join(projectFolder, 'FileCabinet', 'SuiteApps', 'com.example.myapp', 'SuiteScripts', 'hello.js'),
			"console.log('hello')\n",
			'utf8'
		);

		fs.writeFileSync(path.join(projectFolder, 'Objects', 'customrecordtype_test.xml'), '<customrecordtype />', 'utf8');
		fs.writeFileSync(
			path.join(projectFolder, 'Objects', 'customsearch_test.xml'),
			'<savedsearch scriptid="customsearch_test">' +
				'<dependencies>' +
				'<dependency>[appid=com.other.app, scriptid=customrecord_dep.custrecord_field]</dependency>' +
				'</dependencies>' +
				'</savedsearch>',
			'utf8'
		);

		const executor = new NodeSdkExecutor(mkTempDir());
		const ctx = SdkExecutionContext.Builder.forCommand('adddependencies')
			.integration()
			.addParam('project', projectFolder)
			.addFlag('all')
			.build();

		const result = await executor.execute(ctx);
		expect(result.status).toBe('SUCCESS');

		const addedTypes = new Set((result.data || []).map((d) => d.type));
		expect(addedTypes.has('FEATURE')).toBe(true);
		expect(addedTypes.has('OBJECT')).toBe(true);

		const manifestText = fs.readFileSync(path.join(projectFolder, 'manifest.xml'), 'utf8');
		expect(manifestText).toContain('<dependencies>');
		expect(manifestText).toContain('SERVERSIDESCRIPTING');
		expect(manifestText).toContain('CUSTOMRECORDS');
		expect(manifestText).toContain('<applications>');
		expect(manifestText).toContain('application id="com.other.app"');
		expect(manifestText).toContain('<object>customrecord_dep</object>');
	});
});

