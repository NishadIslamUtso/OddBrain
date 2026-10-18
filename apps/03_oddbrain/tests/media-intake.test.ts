import test from 'node:test'
import assert from 'node:assert/strict'
import {
  base64ToFile,
  ENGINE_IMAGE_MIME,
  fileFamily,
  intakeVerdict,
  isConvertibleImage,
  reencodeToPng,
} from '../src/shared/lib/mediaIntake'

/**
 * The front door for dropped files.
 *
 * The owner's rule: take and decode audio, video, pictures and files in any
 * format — and when the chosen provider cannot use something, explain the limit
 * BEFORE sending. So these tests check the refusals as carefully as the
 * acceptances. A refusal that names the wrong reason, or one that implies the
 * file was read when it was not, is a failure of the rule, not a detail.
 */

const CAN_SEE = { vision: true }
const BLIND = { vision: false }
const BLIND_WITH_BRIDGE = { vision: false, bridge: 'llava:7b' }

test('the family is read from the MIME first and the name second', () => {
  // What the operating system reported wins: a file named notes.pdf that the
  // system says is text should be treated as text, not refused as a PDF.
  assert.equal(fileFamily('notes.pdf', 'text/plain'), 'text')
  assert.equal(fileFamily('photo.dat', 'image/png'), 'image')
  // And the name answers when the system said nothing useful.
  assert.equal(fileFamily('report.pdf', ''), 'pdf')
  assert.equal(fileFamily('clip.mov', ''), 'video')
  assert.equal(fileFamily('voice.m4a', ''), 'audio')
  assert.equal(fileFamily('sheet.xlsx', ''), 'office')
  assert.equal(fileFamily('bundle.zip', ''), 'archive')
  assert.equal(fileFamily('mystery', ''), 'unknown')
  // Office MIME types are specific strings; each one is recognised.
  assert.equal(
    fileFamily('document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    'office',
  )
  assert.equal(fileFamily('document', 'application/msword'), 'office')
  assert.equal(fileFamily('page', 'application/pdf'), 'pdf')
})

test('pictures the wire already carries go straight through', () => {
  for (const mime of ENGINE_IMAGE_MIME) {
    const verdict = intakeVerdict(`photo.${mime.split('/')[1]}`, mime, BLIND)
    assert.equal(verdict.ok, true, `${mime} is accepted`)
    assert.ok(verdict.ok && verdict.route === 'image')
  }
})

test('a convertible picture is accepted, and only when somewhere can see it', () => {
  // Chromium decodes gif, so it can be re-encoded to PNG locally.
  const seen = intakeVerdict('animation.gif', 'image/gif', CAN_SEE)
  assert.equal(seen.ok, true)
  assert.ok(seen.ok && seen.route === 'image')
  assert.match(seen.ok ? seen.note ?? '' : '', /re-encoded to PNG/, 'and it says so out loud')

  // A blind provider with a verified bridge still gets there.
  assert.equal(intakeVerdict('animation.gif', 'image/gif', BLIND_WITH_BRIDGE).ok, true)

  // A blind provider with no bridge does not, and the reason names the choice.
  const refused = intakeVerdict('animation.gif', 'image/gif', BLIND)
  assert.equal(refused.ok, false)
  assert.ok(!refused.ok)
  assert.match(refused.reason, /the provider you chose cannot see/)
  assert.match(refused.reason, /nothing is downloaded automatically/, 'no silent model install')
})

test('a picture nothing here can open is refused without pretending', () => {
  for (const name of ['photo.heic', 'scan.tiff', 'art.psd']) {
    const verdict = intakeVerdict(name, '', CAN_SEE)
    assert.equal(verdict.ok, false, `${name} is not silently accepted`)
    assert.ok(!verdict.ok)
    assert.match(verdict.reason, /nothing on this machine can open/)
    assert.match(verdict.reason, /Convert it to PNG or JPEG/, 'and it gives the way through')
  }
})

test('video rides as frames when it can be decoded and seen', () => {
  const ok = intakeVerdict('clip.mp4', 'video/mp4', CAN_SEE)
  assert.equal(ok.ok, true)
  assert.ok(ok.ok && ok.route === 'video-frames')
  assert.equal(intakeVerdict('clip.webm', 'video/webm', BLIND_WITH_BRIDGE).ok, true)

  // A container this machine cannot decode is named, not attempted.
  const refused = intakeVerdict('movie.mkv', '', CAN_SEE)
  assert.equal(refused.ok, false)
  assert.ok(!refused.ok)
  assert.match(refused.reason, /cannot decode/)
  assert.match(refused.reason, /MP4 and WebM/)

  // Decodable but nowhere to send the frames.
  const blind = intakeVerdict('clip.mp4', 'video/mp4', BLIND)
  assert.equal(blind.ok, false)
  assert.ok(!blind.ok && blind.reason.includes('would be read as still frames'))
})

test('audio is refused honestly: nothing listened, nothing sent', () => {
  for (const name of ['meeting.mp3', 'voice.m4a', 'take.flac', 'note.ogg']) {
    const verdict = intakeVerdict(name, '', CAN_SEE)
    assert.equal(verdict.ok, false, `${name} is not accepted`)
    assert.ok(!verdict.ok)
    assert.equal(verdict.family, 'audio')
    // The three things that must be true of the sentence: nothing transcribes
    // it here, the chosen provider was never verified to listen, and it was not
    // sent. Claiming any part was read would be the exact lie this app forbids.
    assert.match(verdict.reason, /Nothing on this machine transcribes it/)
    assert.match(verdict.reason, /not verified to listen/)
    assert.match(verdict.reason, /it was not sent/)
    assert.match(verdict.reason, /no part of it was read/)
    // And the alternative that does exist is offered.
    assert.match(verdict.reason, /Dictation/)
  }
  // Even with a vision model, audio is not picture-shaped.
  assert.equal(intakeVerdict('song.wav', 'audio/wav', CAN_SEE).ok, false)
})

test('documents are refused with the real reason, not a blanket no', () => {
  const pdf = intakeVerdict('contract.pdf', 'application/pdf', CAN_SEE)
  assert.equal(pdf.ok, false)
  assert.ok(!pdf.ok && pdf.family === 'pdf')
  assert.match(pdf.reason, /text is not parsed here/)
  assert.match(pdf.reason, /inventing contents/, 'and it says why guessing is worse')

  const docx = intakeVerdict('memo.docx', '', CAN_SEE)
  assert.equal(docx.ok, false)
  assert.ok(!docx.ok && docx.reason.includes('compressed inside the file'))

  // Each one still gives the way through.
  assert.match(pdf.ok ? '' : pdf.reason, /Export it as text/)
  assert.match(docx.ok ? '' : docx.reason, /Export it as text/)
})

test('an archive is not opened, because opening it runs what is inside', () => {
  const verdict = intakeVerdict('project.zip', 'application/zip', CAN_SEE)
  assert.equal(verdict.ok, false)
  assert.ok(!verdict.ok && verdict.family === 'archive')
  assert.match(verdict.reason, /run whatever is inside/)
})

test('text and code still go through as text', () => {
  assert.equal(intakeVerdict('notes.md', 'text/markdown', BLIND).ok, true)
  const verdict = intakeVerdict('notes.md', 'text/markdown', BLIND)
  assert.ok(verdict.ok && verdict.route === 'text')
})

test('an unknown format is refused with the list of what IS read', () => {
  const verdict = intakeVerdict('firmware.bin', 'application/octet-stream', CAN_SEE)
  assert.equal(verdict.ok, false)
  assert.ok(!verdict.ok && verdict.family === 'unknown')
  assert.match(verdict.reason, /Text, code, pictures and MP4\/WebM video/)
})

test('convertibility is exactly the pictures worth re-encoding', () => {
  // Already on the wire: no work needed, so not "convertible".
  assert.equal(isConvertibleImage('a.png', 'image/png'), false)
  assert.equal(isConvertibleImage('a.jpeg', 'image/jpeg'), false)
  // Decodable here, not on the wire: convertible.
  for (const [name, mime] of [
    ['a.gif', 'image/gif'],
    ['a.bmp', 'image/bmp'],
    ['a.svg', 'image/svg+xml'],
    ['a.avif', 'image/avif'],
    ['a.ico', 'image/x-icon'],
  ] as const) {
    assert.equal(isConvertibleImage(name, mime), true, `${name} converts`)
  }
  // Not decodable at all: refusing is right, converting is not offered.
  assert.equal(isConvertibleImage('a.heic', ''), false)
  assert.equal(isConvertibleImage('a.tiff', ''), false)
  // And a non-picture is never called convertible.
  assert.equal(isConvertibleImage('a.pdf', 'application/pdf'), false)
})

test('re-encoding produces real PNG bytes, drawn from the decoded picture', async () => {
  // The PNG header, so what comes back is checkable as a picture and not just
  // as "some base64".
  const PNG_MAGIC = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  const source = new File([new Uint8Array([1, 2, 3, 4])], 'animation.gif', { type: 'image/gif' })

  const drawn: Array<{ width: number; height: number }> = []
  let askedFor = ''
  const scope = {
    createImageBitmap: async () => ({
      width: 320,
      height: 180,
      close: () => { closed = true },
    }),
    OffscreenCanvas: class {
      constructor(public width: number, public height: number) {}
      getContext(type: string) {
        assert.equal(type, '2d')
        return {
          drawImage: (_image: unknown, x: number, y: number) => {
            assert.equal(x, 0)
            assert.equal(y, 0)
            drawn.push({ width: this.width, height: this.height })
          },
        }
      }
      async convertToBlob(options?: { type?: string }) {
        askedFor = options?.type ?? ''
        return new Blob([PNG_MAGIC], { type: 'image/png' })
      }
    },
  }
  let closed = false

  const base64 = await reencodeToPng(source, scope as never)
  const back = Uint8Array.from(Buffer.from(base64, 'base64'))

  assert.equal(askedFor, 'image/png', 'the PNG encoder was the one asked for')
  assert.deepEqual(drawn, [{ width: 320, height: 180 }], 'the decoded picture was drawn once, at full size')
  assert.deepEqual(Array.from(back), Array.from(PNG_MAGIC), 'and real PNG bytes came back')
  assert.equal(closed, true, 'the decoded bitmap was released')
  assert.ok(!base64.startsWith('data:'), 'no data: prefix, matching how pictures are stored here')
})

test('re-encoding says so when the picture cannot be decoded here', async () => {
  const source = new File([new Uint8Array([9, 9])], 'broken.gif', { type: 'image/gif' })
  const scope = {
    // A real runtime rejects a corrupt or unsupported picture; so does this.
    createImageBitmap: async () => {
      throw new Error('The source image could not be decoded.')
    },
    OffscreenCanvas: class {
      constructor(public width: number, public height: number) {}
      getContext() { return null }
    },
  }
  await assert.rejects(reencodeToPng(source, scope as never), /could not be decoded/)
})

test('a re-encoded picture comes back as a File the normal path can check', async () => {
  // The round trip matters: a converted picture must travel the SAME door as a
  // dropped one, so the size cap and the shape checks apply to it too. A second
  // looser path would be where the caps get quietly skipped.
  const PNG_MAGIC = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
  const source = new File([new Uint8Array([5, 6])], 'chart.svg', { type: 'image/svg+xml' })
  const scope = {
    createImageBitmap: async () => ({ width: 12, height: 9 }),
    OffscreenCanvas: class {
      constructor(public width: number, public height: number) {}
      getContext() { return { drawImage: () => undefined } }
      async convertToBlob() { return new Blob([PNG_MAGIC], { type: 'image/png' }) }
    },
  }

  const base64 = await reencodeToPng(source, scope as never)
  const file = base64ToFile(base64, `${source.name}.png`)

  assert.equal(file.name, 'chart.svg.png', 'the new name says what it became')
  assert.equal(file.type, 'image/png', 'and it is a picture the wire carries')
  assert.equal(file.size, PNG_MAGIC.length, 'no bytes were added or lost')
  assert.deepEqual(Array.from(new Uint8Array(await file.arrayBuffer())), Array.from(PNG_MAGIC))
  // Which means the front door now accepts it on the same terms as any picture.
  assert.equal(intakeVerdict(file.name, file.type, CAN_SEE).ok, true)
})
