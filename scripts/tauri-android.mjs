// Wrapper for `tauri android <cmd>`: fills in JAVA_HOME / ANDROID_HOME / NDK_HOME
// when they are missing from the current shell (e.g. IDE terminals spawned before
// setx took effect), then delegates to the local tauri CLI.
// Usage: node scripts/tauri-android.mjs dev|build [extra args...]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findJavaHome() {
  const adoptium = 'C:\\Program Files\\Eclipse Adoptium';
  if (!existsSync(adoptium)) return null;
  // Prefer JDK 17 (Android Gradle Plugin requirement), newest patch first
  const jdks = readdirSync(adoptium).filter((d) => d.startsWith('jdk-17')).sort().reverse();
  return jdks.length ? join(adoptium, jdks[0]) : null;
}

function findNdkHome(androidHome) {
  const ndkRoot = join(androidHome, 'ndk');
  if (!existsSync(ndkRoot)) return null;
  const versions = readdirSync(ndkRoot).sort().reverse();
  return versions.length ? join(ndkRoot, versions[0]) : null;
}

const env = { ...process.env };

if (!env.JAVA_HOME || !existsSync(env.JAVA_HOME)) {
  const java = findJavaHome();
  if (java) env.JAVA_HOME = java;
}
if (!env.ANDROID_HOME || !existsSync(env.ANDROID_HOME)) {
  const sdk = join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (env.ANDROID_HOME && (!env.NDK_HOME || !existsSync(env.NDK_HOME))) {
  const ndk = findNdkHome(env.ANDROID_HOME);
  if (ndk) env.NDK_HOME = ndk;
}

// Enable sccache if available
try {
  spawnSync('sccache', ['--version'], { stdio: 'ignore' });
  env.RUSTC_WRAPPER = 'sccache';
} catch {}

let args = process.argv.slice(2);
// Default to arm64 (aarch64) target for release build to avoid compiling 4 ABIs.
// For `dev`, let Tauri CLI automatically detect the connected target device.
if (args[0] === 'build' && !args.includes('--target')) {
  args.push('--target', 'aarch64');
}

console.log(`[tauri-android] JAVA_HOME=${env.JAVA_HOME ?? '(not found)'}`);
console.log(`[tauri-android] ANDROID_HOME=${env.ANDROID_HOME ?? '(not found)'}`);
console.log(`[tauri-android] NDK_HOME=${env.NDK_HOME ?? '(not found)'}`);
if (env.RUSTC_WRAPPER) {
  console.log(`[tauri-android] RUSTC_WRAPPER=${env.RUSTC_WRAPPER}`);
}

const result = spawnSync('pnpm', ['exec', 'tauri', 'android', ...args], {
  stdio: 'inherit',
  env,
  shell: true, // pnpm is a .cmd shim on Windows
});
process.exit(result.status ?? 1);
