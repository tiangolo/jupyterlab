import path = require('path');
import glob = require('glob');
import fs = require('fs-extra');
import childProcess = require('child_process');
import sortPackageJson = require('sort-package-json');
import coreutils = require('@phosphor/coreutils');

/**
 * Get all of the lerna package paths.
 */
export function getLernaPaths(basePath = '.'): string[] {
  basePath = path.resolve(basePath);
  let baseConfig = require(path.join(basePath, 'package.json'));
  let paths: string[] = [];
  for (let config of baseConfig.workspaces) {
    paths = paths.concat(glob.sync(path.join(basePath, config)));
  }
  return paths.filter(pkgPath => {
    return fs.existsSync(path.join(pkgPath, 'package.json'));
  });
}

/**
 * Get all of the core package paths.
 */
export function getCorePaths(): string[] {
  let spec = path.resolve(path.join('.', 'packages', '*'));
  return glob.sync(spec);
}

/**
 * Write a package.json if necessary.
 *
 * @param data - The package data.
 *
 * @oaram pkgJsonPath - The path to the package.json file.
 *
 * @returns Whether the file has changed.
 */
export function writePackageData(pkgJsonPath: string, data: any): boolean {
  let text = JSON.stringify(sortPackageJson(data), null, 2) + '\n';
  let orig = fs
    .readFileSync(pkgJsonPath, 'utf8')
    .split('\r\n')
    .join('\n');
  if (text !== orig) {
    fs.writeFileSync(pkgJsonPath, text, 'utf8');
    return true;
  }
  return false;
}

/**
 * Read a json file.
 */
export function readJSONFile(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Write a json file.
 */
export function writeJSONFile(filePath: string, data: any): boolean {
  function sortObjByKey(value: any): any {
    // https://stackoverflow.com/a/35810961
    return typeof value === 'object'
      ? Array.isArray(value)
        ? value.map(sortObjByKey)
        : Object.keys(value)
            .sort()
            .reduce((o: any, key) => {
              const v = value[key];
              o[key] = sortObjByKey(v);
              return o;
            }, {})
      : value;
  }
  let text = JSON.stringify(data, sortObjByKey(data), 2) + '\n';
  let orig = {};
  try {
    orig = readJSONFile(filePath);
  } catch (e) {
    // no-op
  }
  if (!coreutils.JSONExt.deepEqual(data, orig)) {
    fs.writeFileSync(filePath, text, 'utf8');
    return true;
  }
  return false;
}

/**
 *
 * Call a command, checking its status.
 */
export function checkStatus(cmd: string) {
  const data = childProcess.spawnSync(cmd, { shell: true });
  return data.status;
}

/**
 * Get the current version of JupyterLab
 */
export function getVersion() {
  const cmd = 'python setup.py --version';
  return run(cmd, { stdio: 'pipe' });
}

/**
 * Pre-bump.
 */
export function prebump() {
  // Ensure bump2version is installed (active fork of bumpversion)
  run('python -m pip install bump2version');

  // Make sure we start in a clean git state.
  if (checkStatus('git diff --quiet') !== 0) {
    throw new Error('Must be in a clean git state');
  }
}

/**
 * Post-bump.
 */
export function postbump() {
  // Get the current version.
  const curr = getVersion();

  // Update the dev mode version.
  let filePath = path.resolve(path.join('.', 'dev_mode', 'package.json'));
  let data = readJSONFile(filePath);
  data.jupyterlab.version = curr;
  writeJSONFile(filePath, data);

  // Update core mode.
  run('node buildutils/lib/update-core-mode.js');

  // Create a git tag and commit.
  run(`git tag v${curr}`);
  run(`git commit -am "Publish ${curr}"`);
}

/**
 * Run a command with terminal output.
 *
 * @param cmd - The command to run.
 */
export function run(
  cmd: string,
  options: childProcess.ExecSyncOptions = {},
  quiet?: boolean
): string {
  options = options || {};
  options['stdio'] = options.stdio || 'inherit';
  if (!quiet) {
    console.log('>', cmd);
  }
  const value = childProcess.execSync(cmd, options);
  if (value === null) {
    return '';
  }
  return value
    .toString()
    .replace(/(\r\n|\n)$/, '')
    .trim();
}
