import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const svgCandidates = [
  resolve(root, 'public/icon.svg'),
  resolve(root, 'build/icon.svg'),
]
const svgPath = svgCandidates.find((candidate) => existsSync(candidate))

if (!svgPath) {
  throw new Error(`Missing icon source. Expected one of: ${svgCandidates.join(', ')}`)
}

const svg = readFileSync(svgPath)

const targets = [
  { out: 'build/icon.png', size: 1024 },
  { out: 'public/icon-512.png', size: 512 },
  { out: 'public/icon-256.png', size: 256 },
]

for (const { out, size } of targets) {
  const buf = await sharp(svg, { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  writeFileSync(resolve(root, out), buf)
  console.log(`wrote ${out} (${size}x${size})`)
}
