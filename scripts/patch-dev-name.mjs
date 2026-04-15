// Patches node_modules/electron so that in dev mode the macOS dock shows
// "Lyria Studio" instead of "Electron". Three things are required:
//   1. Rename the .app bundle directory (macOS falls back to the filename).
//   2. Update Info.plist CFBundleName / CFBundleDisplayName.
//   3. Re-register the bundle with LaunchServices and restart the Dock so the
//      hover label refreshes.
//
// Electron's npm launcher reads the binary path from `path.txt`, so we also
// rewrite that to point inside the renamed bundle.
//
// The packaged app gets its name from electron-builder.yml (productName),
// so this script is strictly for dev-mode cosmetics. Safe on non-mac hosts.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

if (process.platform !== 'darwin') process.exit(0)

const APP_NAME = 'Lyria Studio'
const RENAMED_BUNDLE = `${APP_NAME}.app`
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister'

const distDir = resolve(root, 'node_modules/electron/dist')
const oldBundle = resolve(distDir, 'Electron.app')
const newBundle = resolve(distDir, RENAMED_BUNDLE)
const pathTxt = resolve(root, 'node_modules/electron/path.txt')

if (!existsSync(distDir)) process.exit(0)

// 1. Rename the bundle directory.
if (existsSync(oldBundle) && !existsSync(newBundle)) {
  renameSync(oldBundle, newBundle)
}

const bundle = existsSync(newBundle) ? newBundle : oldBundle
if (!existsSync(bundle)) process.exit(0)

// 2. Rewrite Info.plist names.
const plist = resolve(bundle, 'Contents/Info.plist')
if (existsSync(plist)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    try {
      execSync(`/usr/libexec/PlistBuddy -c "Set :${key} ${APP_NAME}" "${plist}"`)
    } catch {
      try {
        execSync(`/usr/libexec/PlistBuddy -c "Add :${key} string ${APP_NAME}" "${plist}"`)
      } catch (err) {
        console.warn(`[patch-dev-name] could not set ${key}:`, err instanceof Error ? err.message : err)
      }
    }
  }
}

// 3. Update path.txt so the electron npm launcher finds the binary.
if (existsSync(pathTxt)) {
  const current = readFileSync(pathTxt, 'utf-8').trim()
  const desired = `${RENAMED_BUNDLE}/Contents/MacOS/Electron`
  if (current !== desired) writeFileSync(pathTxt, desired)
}

// 4. Reset LaunchServices + Dock so the hover label refreshes on next launch.
try {
  execSync(`touch "${bundle}"`)
} catch {
  /* ignore */
}
try {
  execSync(`"${LSREGISTER}" -f "${bundle}"`)
} catch {
  /* ignore */
}
try {
  execSync('killall Dock')
} catch {
  /* ignore */
}

console.log(`[patch-dev-name] bundle → ${RENAMED_BUNDLE}, dock label → ${APP_NAME}`)
