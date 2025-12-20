'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SuiteScriptFileService = require('../../src/services/SuiteScriptFileService');

function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'suitecloud-createfile-test-'));
}

function rmrf(p) {
	fs.rmSync(p, { recursive: true, force: true });
}

describe('SuiteScriptFileService', () => {
	it('creates a suitescript file under FileCabinet', () => {
		const tmp = makeTempDir();
		try {
			const service = new SuiteScriptFileService();
			const result = service.createFile({
				projectFolder: tmp,
				fileCabinetPath: '/SuiteScripts/hello.js',
				scriptType: 'ClientScript',
				modules: '"N/record" "N/log"',
			});

			expect(result.ok).toBe(true);
			expect(fs.existsSync(path.join(tmp, 'FileCabinet', 'SuiteScripts', 'hello.js'))).toBe(true);
			const contents = fs.readFileSync(path.join(tmp, 'FileCabinet', 'SuiteScripts', 'hello.js'), 'utf8');
			expect(contents).toContain('@NScriptType ClientScript');
			expect(contents).toContain('define(["N/record","N/log"]');
		} finally {
			rmrf(tmp);
		}
	});

	it('rejects path traversal outside FileCabinet', () => {
		const tmp = makeTempDir();
		try {
			const service = new SuiteScriptFileService();
			const result = service.createFile({
				projectFolder: tmp,
				fileCabinetPath: '/../pwned.js',
				scriptType: 'ClientScript',
			});

			expect(result.ok).toBe(false);
			expect(result.errorMessages[0]).toContain('must be within FileCabinet');
			expect(fs.existsSync(path.join(tmp, 'pwned.js'))).toBe(false);
		} finally {
			rmrf(tmp);
		}
	});
});

