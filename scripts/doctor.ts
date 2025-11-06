#!/usr/bin/env bun
/**
 * Legacy wrapper for uiMatch Doctor - delegates to CLI command
 *
 * This script is maintained for backward compatibility.
 * Please use: bun run packages/uimatch-plugin/src/cli/index.ts doctor
 * Or after building: uimatch doctor
 */

// Load environment variables from .env file
import 'dotenv/config';

async function main() {
  console.log('⚠️  Using legacy doctor script. Consider using: uimatch doctor\n');

  // Delegate to the CLI command
  const { runDoctor } = await import('../packages/uimatch-plugin/src/cli/doctor/index.js');
  await runDoctor(process.argv.slice(2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
