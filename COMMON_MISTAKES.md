Wrong command: `rg -n "Resolve `clientId`|prioridade|suitecloud-sdk-settings" .sangoi/task-logs/2026-02-11-account-setup-pkce-java-free.md`
Cause and fix: Backticks inside double quotes triggered shell command substitution (`clientId: command not found`). Escape/remove backticks or use single quotes around the regex.
Correct command: `rg -n 'Resolve `clientId`|prioridade|suitecloud-sdk-settings' .sangoi/task-logs/2026-02-11-account-setup-pkce-java-free.md`
