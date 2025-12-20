'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

const ProjectPackagingService = require('../../src/services/ProjectPackagingService');
const SdkExecutor = require('../../src/SdkExecutor');
const SdkExecutionContext = require('../../src/SdkExecutionContext');
const CommandUtils = require('../../src/utils/CommandUtils');

function listZipEntries(zipPath) {
	return new Promise((resolve, reject) => {
		yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
			if (err) return reject(err);
			const entries = [];
			zipfile.readEntry();
			zipfile.on('entry', (entry) => {
				entries.push(entry.fileName);
				zipfile.readEntry();
			});
			zipfile.on('end', () => {
				zipfile.close();
				resolve(entries);
			});
			zipfile.on('error', reject);
		});
	});
}

function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-packaging-test-'));
}

function rmrf(p) {
	fs.rmSync(p, { recursive: true, force: true });
}

describe('ProjectPackagingService', () => {
	it('packages an ACP project according to deploy.xml', async () => {
		const destinationFolder = makeTempDir();
		try {
			const projectFolder = path.resolve(__dirname, '../fixtures/project-acp');
			const service = new ProjectPackagingService();
			const result = await service.packageProject({ projectFolder, destinationFolder });

			expect(result.ok).toBe(true);
			expect(fs.existsSync(result.outputZipPath)).toBe(true);

			const entries = await listZipEntries(result.outputZipPath);
			expect(new Set(entries)).toEqual(
				new Set([
					'deploy.xml',
					'manifest.xml',
					'AccountConfiguration/features.xml',
					'FileCabinet/SomeFolder/',
					'FileCabinet/SomeFolder/hello.txt',
					'Objects/customobject.xml',
				])
			);
		} finally {
			rmrf(destinationFolder);
		}
	});

	it('includes nested directories when a glob matches a directory', async () => {
		const destinationFolder = makeTempDir();
		try {
			const projectFolder = path.resolve(__dirname, '../fixtures/project-acp-deep');
			const service = new ProjectPackagingService();
			const result = await service.packageProject({ projectFolder, destinationFolder });

			expect(result.ok).toBe(true);
			const entries = await listZipEntries(result.outputZipPath);
			expect(entries).toContain('FileCabinet/SomeFolder/Sub/');
			expect(entries).toContain('FileCabinet/SomeFolder/Sub/inner.txt');
		} finally {
			rmrf(destinationFolder);
		}
	});

	it('returns an error when deploy.xml is missing', async () => {
		const destinationFolder = makeTempDir();
		try {
			const projectFolder = path.resolve(__dirname, '../fixtures/project-acp-nodeploy');
			const service = new ProjectPackagingService();
			const result = await service.packageProject({ projectFolder, destinationFolder });

			expect(result.ok).toBe(false);
			expect(result.errorMessages[0]).toContain('There is no deploy.xml file');
		} finally {
			rmrf(destinationFolder);
		}
	});

	it('returns an error when deploy.xml has an invalid root tag', async () => {
		const destinationFolder = makeTempDir();
		try {
			const projectFolder = path.resolve(__dirname, '../fixtures/project-acp-badroottag');
			const service = new ProjectPackagingService();
			const result = await service.packageProject({ projectFolder, destinationFolder });

			expect(result.ok).toBe(false);
			expect(result.errorMessages[0]).toContain('root tag name must be "deploy"');
		} finally {
			rmrf(destinationFolder);
		}
	});
});

describe('SdkExecutor (Node engine)', () => {
	it('routes project:package to the Node engine (no jar required)', async () => {
		const destinationFolder = makeTempDir();
		try {
			const projectFolder = path.resolve(__dirname, '../fixtures/project-acp');
			const executor = new SdkExecutor('');
			const ctx = SdkExecutionContext.Builder.forCommand('package')
				.integration()
				.addParam('project', CommandUtils.quoteString(projectFolder))
				.addParam('destination', CommandUtils.quoteString(destinationFolder))
				.build();

			const result = await executor.execute(ctx);
			expect(result.status).toBe('SUCCESS');
			expect(fs.existsSync(result.data)).toBe(true);
		} finally {
			rmrf(destinationFolder);
		}
	});
});
