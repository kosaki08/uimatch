import { createRequire } from 'node:module';

interface PackageJson {
  version: string;
}

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as PackageJson;

export const CLI_VERSION = pkg.version;
