/**
 * Custom tapir spinner for ArchGuard CLI.
 *
 * Features a cute running tapir ASCII animation in the terminal,
 * inspired by the Claude Code loading experience.
 */

import ora, { type Ora } from 'ora';

// ─── Tapir animation frames ────────────────────────────────────────
// A compact tapir trotting along. Tapirs have a distinctive short trunk
// and stocky body. These frames cycle to give a running effect.

const TAPIR_FRAMES = [
  '  ~(o  )>   ',
  '  ~( o )>   ',
  '  ~(  o)>   ',
  '  ~( o )>   ',
  '   ~(o  )>  ',
  '   ~( o )>  ',
  '   ~(  o)>  ',
  '   ~( o )>  ',
];

// Fancier multi-line tapir frames for the initial startup banner
const TAPIR_RUN_FRAMES = [
  // Frame 1: legs forward
  `    ╭───╮
    │ o ├╮
  ╭─┤   │╯
  │ ╰┬─┬╯
    │ │  `,
  // Frame 2: mid-stride
  `    ╭───╮
    │ o ├╮
  ╭─┤   │╯
  │ ╰┬─┬╯
   / │  `,
  // Frame 3: legs back
  `    ╭───╮
    │ o ├╮
  ╭─┤   │╯
  │ ╰┬─┬╯
  │   / `,
  // Frame 4: mid-stride back
  `    ╭───╮
    │ o ├╮
  ╭─┤   │╯
  │ ╰┬─┬╯
   \\ │  `,
];

// Simple inline spinner frames with a tapir character
const TAPIR_INLINE_FRAMES = [
  ' 🐽 ∙ ',
  ' 🐽 ∙∙ ',
  ' 🐽 ∙∙∙',
  ' 🐽 ∙∙ ',
];

// ─── Create a tapir-themed ora spinner ──────────────────────────────

export interface TapirSpinnerOptions {
  /** Initial text to show beside the spinner */
  text?: string;
  /** Use simple ASCII mode (no emoji) for terminals that don't support it */
  asciiOnly?: boolean;
}

/**
 * Create an `ora` spinner instance with the tapir animation.
 */
export function createTapirSpinner(opts: TapirSpinnerOptions = {}): Ora {
  const frames = opts.asciiOnly ? TAPIR_FRAMES : TAPIR_INLINE_FRAMES;

  return ora({
    text: opts.text ?? '',
    spinner: {
      interval: 200,
      frames,
    },
    color: 'magenta',
  });
}

/**
 * Simple string-based tapir frames for contexts where ora isn't available
 * (e.g. log file headers).
 */
export const TAPIR_ASCII = `
    ╭───╮
    │ o ├╮  ArchGuard
  ╭─┤   │╯  Architectural Analysis
  │ ╰┬─┬╯
    │ │
`;
