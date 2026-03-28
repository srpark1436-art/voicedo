// 아이콘 생성 스크립트 (선택적으로 실행)
// 실행: node scripts/generate-icons.js
// 참고: sharp 패키지가 필요합니다 (npm install -D sharp)
//
// 대안: public/icons/ 폴더에 192x192, 512x512 PNG 파일을 직접 추가하세요.
// https://realfavicongenerator.net/ 에서 생성할 수 있습니다.

import { createCanvas } from 'canvas'
import { writeFileSync } from 'fs'

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // 배경
  ctx.fillStyle = '#6366f1'
  ctx.beginPath()
  const radius = size * 0.2
  ctx.moveTo(radius, 0)
  ctx.lineTo(size - radius, 0)
  ctx.quadraticCurveTo(size, 0, size, radius)
  ctx.lineTo(size, size - radius)
  ctx.quadraticCurveTo(size, size, size - radius, size)
  ctx.lineTo(radius, size)
  ctx.quadraticCurveTo(0, size, 0, size - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fill()

  // 마이크 아이콘
  ctx.fillStyle = 'white'
  ctx.font = `${size * 0.5}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🎙', size / 2, size / 2)

  return canvas.toBuffer('image/png')
}

try {
  writeFileSync('public/icons/icon-192x192.png', generateIcon(192))
  writeFileSync('public/icons/icon-512x512.png', generateIcon(512))
  console.log('아이콘 생성 완료!')
} catch (e) {
  console.log('canvas 패키지가 없습니다. 직접 PNG 파일을 추가해주세요.')
}
