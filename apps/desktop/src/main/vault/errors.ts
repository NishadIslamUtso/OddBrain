/**
 * The one error type the vault raises for a bad request.
 *
 * Anything the caller could fix — an unsafe name, a missing field, a bad
 * timestamp — is an InputError, and it is answered with 400 and the sentence it
 * carries. Anything else is a genuine failure and is answered as one. Nothing in
 * between: the vault never reports success it did not write.
 */
export class InputError extends Error {}

/**
 * There is no vault where the app was told to look.
 *
 * This is not the caller's mistake, so it is not an InputError: it is answered
 * 503 with a sentence that says what to do. It exists because the app must be
 * able to open, show its empty state and explain itself when the vault folder is
 * missing — rather than either crashing or, far worse, silently creating an
 * empty replacement vault over the one that was meant to be there.
 */
export class VaultMissingError extends Error {}
