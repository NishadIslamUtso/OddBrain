# Restored coverage

No tests remain parked here. The obsolete JSX-era checks were rewritten against the current app rather than made to pass on source substrings:

- `tests/renderer-contracts.test.ts`: the TypeScript compiler checks actual imports, bindings, required JSX props and signatures throughout the application. Replaces `props.test.js` and `wiring.test.js`.
- `tests/composer-menu.test.tsx`: renders the real composer and exercises slash-template navigation, insertion, dismissal, send/stop behavior, attachments and retained tools. Replaces `composer-menu.test.js`.
- `tests/dictation-lifecycle.test.tsx`: microphone authorization, cancel/revocation, late permission resolution and late native transcripts, using controlled media-device fixtures rather than claiming real microphone acceptance.

The vault/API/extension suites remain active in `tests/`. Native Windows microphone, speech-language and installer acceptance still require a Windows machine.
