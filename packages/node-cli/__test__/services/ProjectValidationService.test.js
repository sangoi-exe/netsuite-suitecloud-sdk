'use strict';

const path = require('path');

const ProjectValidationService = require('../../src/services/ProjectValidationService');
const SdkExecutor = require('../../src/SdkExecutor');
const SdkExecutionContext = require('../../src/SdkExecutionContext');
const CommandUtils = require('../../src/utils/CommandUtils');

describe('ProjectValidationService', () => {
	it('returns no errors for a valid fixture project', async () => {
		const projectFolder = path.resolve(__dirname, '../fixtures/project-acp');
		const service = new ProjectValidationService();
		const result = await service.validateProject({ projectFolder });

		expect(Array.isArray(result.errors)).toBe(true);
		expect(Array.isArray(result.warnings)).toBe(true);
		expect(result.errors.length).toBe(0);
	});
});

describe('SdkExecutor validate (Node)', () => {
	it('returns structured output (SUCCESS) for local validation', async () => {
		const projectFolder = path.resolve(__dirname, '../fixtures/project-acp');
		const executor = new SdkExecutor('');
		const ctx = SdkExecutionContext.Builder.forCommand('validate')
			.integration()
			.addParam('project', CommandUtils.quoteString(projectFolder))
			.build();

		const result = await executor.execute(ctx);
		expect(result.status).toBe('SUCCESS');
		expect(result.data).toBeDefined();
		expect(result.data.errors.length).toBe(0);
	});
});

