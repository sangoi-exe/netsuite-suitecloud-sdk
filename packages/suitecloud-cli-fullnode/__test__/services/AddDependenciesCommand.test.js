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
				'<dependency>[appid=com.other.app, objecttype=customrecordtype]</dependency>' +
				'<dependency>[appid=com.example.myapp, objecttype=customrecordtype]</dependency>' +
				'<dependency>[bundleid=3006, scriptid=customrecord_bundledep.custrecord_flag]</dependency>' +
				'<dependency>[bundleid=8205]</dependency>' +
				'<dependency>[file=/SuiteScripts/libs/helper.js]</dependency>' +
				'<dependency>[folder=/SuiteScripts/libs]</dependency>' +
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
		expect(addedTypes.has('FILE')).toBe(true);
		expect(addedTypes.has('FOLDER')).toBe(true);
		expect(addedTypes.has('PLATFORMEXTENSION')).toBe(true);
		expect(addedTypes.has('BUNDLE')).toBe(true);
		expect(result.data).toContainEqual({
			type: 'OBJECT',
			scriptId: 'customrecord_dep',
			appId: 'com.other.app'
		});
		expect(result.data).toContainEqual({
			type: 'OBJECT',
			scriptId: 'customrecord_bundledep',
			bundleIds: '3006'
		});
		expect(result.data).toContainEqual({ type: 'FILE', value: '/SuiteScripts/libs/helper.js' });
		expect(result.data).toContainEqual({ type: 'FOLDER', value: '/SuiteScripts/libs' });
		expect(result.data).toContainEqual({ type: 'BUNDLE', value: '8205' });
		expect(result.data).toContainEqual({
			type: 'PLATFORMEXTENSION',
			appId: 'com.other.app',
			objectType: 'customrecordtype'
		});
		expect(
			(result.data || []).some(
				(dependency) => dependency.type === 'PLATFORMEXTENSION' && dependency.appId === 'com.example.myapp'
			)
		).toBe(false);

		const manifestText = fs.readFileSync(path.join(projectFolder, 'manifest.xml'), 'utf8');
		expect(manifestText).toContain('<dependencies>');
		expect(manifestText).toContain('SERVERSIDESCRIPTING');
		expect(manifestText).toContain('CUSTOMRECORDS');
		expect(manifestText).toContain('<applications>');
		expect(manifestText).toContain('application id="com.other.app"');
		expect(manifestText).not.toContain('application id="com.example.myapp"');
		expect(manifestText).toContain('<object>customrecord_dep</object>');
		expect(manifestText).toContain('<platformextensions>');
		expect(manifestText).toContain('<objecttype>customrecordtype</objecttype>');
		expect(manifestText).toContain('<bundles>');
		expect(manifestText).toContain('bundle id="3006"');
		expect(manifestText).toContain('<object>customrecord_bundledep</object>');
		expect(manifestText).toContain('<bundle>8205</bundle>');
		expect(manifestText).toContain('<files>');
		expect(manifestText).toContain('<file>/SuiteScripts/libs/helper.js</file>');
		expect(manifestText).toContain('<folders>');
		expect(manifestText).toContain('<folder>/SuiteScripts/libs</folder>');

		const resultSecondRun = await executor.execute(ctx);
		expect(resultSecondRun.status).toBe('SUCCESS');
		expect(resultSecondRun.data).toEqual([]);
		expect(fs.readFileSync(path.join(projectFolder, 'manifest.xml'), 'utf8')).toBe(manifestText);
	});
});
