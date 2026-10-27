// The register menu
//
// One menu of seven, offered to Jev as one question and sampled from the distribution it
// answers with. Keeping the menu here, built from the registers themselves, means a register
// cannot be added to the code and left out of the menu, or described one way to Jev and
// another way to the writer (D-27).

import type { LensKey, Register, RegisterKey } from './register.js';
import { drawLabel } from '../weighted-draw.js';
import { SupertextRegister } from './supertext-register.js';
import { SubtextRegister } from './subtext-register.js';
import { ArchitextRegister } from './architext-register.js';
import { PsychotextRegister } from './psychotext-register.js';
import { PoemRegister } from './poem-register.js';
import { OnelinerRegister } from './oneliner-register.js';
import { SilenceRegister } from './silence-register.js';

export { Register } from './register.js';
export type { LensKey, RegisterKey, Occasion, ReplyOccasion, OpeningOccasion } from './register.js';
export { LensRegister } from './lens-register.js';

export const REGISTERS: { [K in RegisterKey]: Register } = {
  supertext: new SupertextRegister(),
  subtext: new SubtextRegister(),
  architext: new ArchitextRegister(),
  psychotext: new PsychotextRegister(),
  poem: new PoemRegister(),
  oneliner: new OnelinerRegister(),
  silence: new SilenceRegister(),
};

export const REGISTER_KEYS = Object.keys(REGISTERS) as RegisterKey[];

/**
 * The four lenses, which are what Oblique did before there was a menu. They are the fallback
 * for every way the choice can fail to arrive, so a broken or unconfigured Jev leaves the bot
 * answering exactly as it used to rather than falling silent (D-27).
 */
export const LENS_KEYS: LensKey[] = ['supertext', 'subtext', 'architext', 'psychotext'];

/** The menu as Jev reads it: option label -> what choosing it would mean. */
export const registerMenu = (): { [label: string]: string } => {
  const menu: { [label: string]: string } = {};

  for (const key of REGISTER_KEYS) {
    menu[key] = REGISTERS[key].criterion;
  }

  return menu;
};

export const isRegisterKey = (key: string): key is RegisterKey => {
  return Object.prototype.hasOwnProperty.call(REGISTERS, key);
};

/** Uniform over the four lenses. */
export const randomLensRegister = (random: () => number): Register => {
  return REGISTERS[LENS_KEYS[Math.floor(random() * LENS_KEYS.length)]];
};

/**
 * Draw a register from Jev's distribution, weighted by it.
 *
 * Deliberately not the top choice. Most posts people send a bot are personal, so the
 * best-scoring register would be psychotext most days and the bot would settle into one
 * register — the thing the uniform random pick existed to prevent. Sampling keeps a reply
 * responsive to the post and still varied across a thread: the register Jev gives 0.6 is
 * taken three times in five, not five times in five (D-27).
 *
 * Unknown labels are ignored rather than trusted, and a distribution with nothing recognizable
 * in it falls back to the lenses.
 */
export const sampleRegister = (
  probabilities: { [label: string]: number } | undefined,
  random: () => number
): Register => {
  const label = drawLabel(probabilities, isRegisterKey, random);

  if (!label) {
    return randomLensRegister(random);
  }

  return REGISTERS[label as RegisterKey];
};
