// Plain-language reasons why an axis is structurally unreachable on Earth.
//
// scoring.ts decides which axes no site can score on (structuralMismatch).
// This file only words the reason, using the active profile's own target so
// the sentence is correct for the Moon profile, the Mars profile and any
// custom profile built from them.

import type { ParameterKey, Profile } from './types';

const REASONS: Partial<Record<ParameterKey, (target: number) => string>> = {
  radiation: (t) =>
    `Earth's atmosphere and magnetic field shield the surface, so no site approaches a dose of ${t} µSv/day`,
  tempRange: (t) => `no site has a day-to-night swing close to ${t} °C`,
  daylight: (t) => `no Earth day lasts ${t} hours`,
  pressure: (t) => `no site has air as thin as ${t} kPa`,
};

/** One short clause per unreachable axis, in the order given. */
export function structuralNotes(profile: Profile, keys: ParameterKey[]): string[] {
  return keys.map((key) => {
    const target = profile.targets[key].target;
    const reason = REASONS[key];
    return reason ? reason(target) : `no site comes within tolerance of the ${key} target`;
  });
}
