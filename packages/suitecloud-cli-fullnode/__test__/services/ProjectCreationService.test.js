'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ProjectCreationService = require('../../src/services/ProjectCreationService');

function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-project-create-test-'));
}

function rmrf(p) {
	fs.rmSync(p, { recursive: true, force: true });
}

describe('ProjectCreationService', () => {
	it('creates an ACP project like the SDK (manifest + deploy)', () => {
		const tmp = makeTempDir();
		try {
			const service = new ProjectCreationService();
			const projectPath = service.createProject({
				parentDirectory: tmp,
				type: 'ACCOUNTCUSTOMIZATION',
				projectName: 'src',
			});

			expect(projectPath).toEqual(path.join(tmp, 'src'));
			expect(fs.existsSync(path.join(projectPath, 'manifest.xml'))).toBe(true);
			expect(fs.existsSync(path.join(projectPath, 'deploy.xml'))).toBe(true);

			const manifest = fs.readFileSync(path.join(projectPath, 'manifest.xml'), 'utf8');
			expect(manifest).toContain('<manifest projecttype="ACCOUNTCUSTOMIZATION">');
			expect(manifest).toContain('<projectname>src</projectname>');
			expect(manifest).toContain('<frameworkversion>1.0</frameworkversion>');

			const deploy = fs.readFileSync(path.join(projectPath, 'deploy.xml'), 'utf8');
			expect(deploy).toContain('<deploy>');
			expect(deploy).toContain('~/FileCabinet/*');
			expect(deploy).toContain('~/Objects/*');
			expect(deploy).toContain('~/AccountConfiguration/*');
		} finally {
			rmrf(tmp);
		}
	});

	it('creates a SuiteApp project like the SDK (manifest + deploy + InstallationPreferences)', () => {
		const tmp = makeTempDir();
		try {
			const service = new ProjectCreationService();
			const projectPath = service.createProject({
				parentDirectory: tmp,
				type: 'SUITEAPP',
				projectName: 'src',
				publisherId: 'com.example',
				projectId: 'exampleproj',
				projectVersion: '1.2.3',
			});

			const expected = path.join(tmp, 'com.example.exampleproj');
			expect(projectPath).toEqual(expected);
			expect(fs.existsSync(path.join(projectPath, 'manifest.xml'))).toBe(true);
			expect(fs.existsSync(path.join(projectPath, 'deploy.xml'))).toBe(true);
			expect(fs.existsSync(path.join(projectPath, 'InstallationPreferences', 'locking.xml'))).toBe(true);
			expect(fs.existsSync(path.join(projectPath, 'InstallationPreferences', 'hiding.xml'))).toBe(true);
			expect(fs.existsSync(path.join(projectPath, 'InstallationPreferences', 'overwriting.xml'))).toBe(true);

			const deploy = fs.readFileSync(path.join(projectPath, 'deploy.xml'), 'utf8');
			expect(deploy).toContain('~/FileCabinet/SuiteApps/com.example.exampleproj/*');
		} finally {
			rmrf(tmp);
		}
	});
});

