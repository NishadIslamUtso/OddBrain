#!/usr/bin/env node
/**
 * Put the failing test names into the check output.
 *
 * The junit artifact cannot be fetched from here, and the job log is behind a
 * redirect; a GitHub annotation is readable through the API. This script reads
 * the junit file the test step just wrote and prints one `::error::` line per
 * failing or erroring testcase (plus a notice when the file is missing or has
 * no failures), so a red run says which test went red instead of only "exit 1".
 */
const { readFileSync, existsSync } = require('node:fs')

const file = process.argv[2] || 'junit-windows.xml'
if (!existsSync(file)) {
  console.log('::warning::' + file + ' was not written, so no failing test can be named')
  process.exit(0)
}

const raw = readFileSync(file, 'utf8')
const unescape = (text) => String(text || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const oneLine = (text) => unescape(text).replace(/\s+/g, ' ').trim().slice(0, 400)

let failures = 0
for (const suite of raw.split(/(?=<testsuite )/)) {
  const head = /<testsuite\b[^>]*\bname="([^"]*)"/.exec(suite)
  for (const match of suite.matchAll(/<testcase\b[^>]*>([\s\S]*?)<\/testcase>/g)) {
    const body = match[1]
    const failure = /<failure\b([^>]*)>/.exec(body) || /<error\b([^>]*)>/.exec(body)
    if (!failure) continue
    const name = /<testcase\b[^>]*\bname="([^"]*)"/.exec(match[0])
    const className = /<testcase\b[^>]*\bclassname="([^"]*)"/.exec(match[0])
    const message = /message="([^"]*)"/.exec(failure[1])
    failures += 1
    const where = [className ? unescape(className[1]) : head ? unescape(head[1]) : 'unknown file', name ? unescape(name[1]) : 'unnamed test'].join(' › ')
    // Escape % first: GitHub reads %xx as a URL escape inside ::error:: lines.
    const text = oneLine(message ? message[1] : body).replace(/%/g, '%25')
    console.log('::error title=' + encodeURIComponent(where).slice(0, 120) + '::' + text)
  }
}
console.log('::notice::' + failures + ' failing testcase(s) named from ' + file)
