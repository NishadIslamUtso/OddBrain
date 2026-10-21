'use strict'
// One place for every machine-specific path. Override with environment variables.
const path = require('node:path'), os = require('node:os')
const APP_ROOT = process.env.OB_APP_ROOT || path.resolve(__dirname, '../../apps/03_oddbrain')
const WORK = process.env.AUDIT_WORK || path.join(os.tmpdir(), 'oddbrain-audit')
const MEDIA_BIN = process.env.AUDIT_MEDIA_BIN || path.join(WORK, 'media', 'bin')      // folder holding ffmpeg + ffprobe
const MEDIA_WORK = process.env.AUDIT_MEDIA_WORK || path.join(WORK, 'media', 'work')   // test videos made by make-media.sh
const YTDLP = process.env.AUDIT_YTDLP || ''                                           // absolute path to a yt-dlp executable
const DASH_PORT = Number(process.env.AUDIT_DASH_PORT || 8099)
module.exports = { APP_ROOT, WORK, MEDIA_BIN, MEDIA_WORK, YTDLP, DASH_PORT, OUT: path.join(__dirname, 'out') }
