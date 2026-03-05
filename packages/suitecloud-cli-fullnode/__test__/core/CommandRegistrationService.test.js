'use strict';

const { Command } = require('commander');
const CommandRegistrationService = require('../../src/core/CommandRegistrationService');

function createCommandMetadata() {
	return {
		name: 'project:adddependencies',
		description: 'Adds dependencies',
		supportsInteractiveMode: false,
		options: {
			all: {
				name: 'all',
				description: 'Add all missing dependencies',
				type: 'FLAG',
				mandatory: false,
				disableInIntegrationMode: true,
			},
			authid: {
				name: 'authid',
				description: 'Auth id',
				type: 'SINGLE',
				mandatory: false,
				disableInIntegrationMode: false,
			},
		},
	};
}

function registerCommand(runInIntegrationMode) {
	const service = new CommandRegistrationService();
	const program = new Command();
	const commandMetadata = createCommandMetadata();

	service.register({
		commandMetadata,
		program,
		runInInteractiveMode: false,
		runInIntegrationMode,
		executeCommandFunction: async () => ({
			isSuccess: () => true,
		}),
	});

	return program.commands[0];
}

describe('CommandRegistrationService', () => {
	it('registers disableInIntegrationMode options in normal CLI mode', () => {
		const registeredCommand = registerCommand(false);
		const longOptions = registeredCommand.options.map((option) => option.long);

		expect(longOptions).toContain('--all');
		expect(longOptions).toContain('--authid');
	});

	it('filters disableInIntegrationMode options in integration mode', () => {
		const registeredCommand = registerCommand(true);
		const longOptions = registeredCommand.options.map((option) => option.long);

		expect(longOptions).not.toContain('--all');
		expect(longOptions).toContain('--authid');
	});
});
