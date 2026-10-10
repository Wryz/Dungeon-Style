/**
 * The story is told in loops. Each time the character erases their memories and runs
 * the dungeon again, the world leaks a little more of what it really is: first
 * glitches, then UI-like shapes, then a desktop / computer motif, and finally the
 * explicit realization.
 */

export interface Beat {
  title: string;
  lines: string[];
}

export const BEATS: Beat[] = [
  {
    title: 'A screen in the stone',
    lines: [
      "There's no door here. Just a screen, humming, warm to the touch.",
      "It offers to make the next run easier. All it asks is that you forget this one.",
    ],
  },
  {
    title: 'Again',
    lines: [
      "The walls are the same. You're certain you've never been here — and certain you have.",
      'Something above the dungeon keeps opening and closing, like a window.',
    ],
  },
  {
    title: 'The cursor',
    lines: [
      'There is an arrow in the sky. It moved when you looked at it.',
      'Somewhere far above, a fan spins up.',
    ],
  },
  {
    title: 'Somebody yawns',
    lines: [
      'You hear a chair creak. A man yawns. A key is pressed, and the light goes white.',
      "You've done this before. Many times.",
    ],
  },
  {
    title: 'His computer',
    lines: [
      "You know now: this dungeon is a program running on a man's computer.",
      "Erasing won't change that. But the runs will keep getting easier — and the pay better.",
    ],
  },
];

export function beatFor(loop: number): Beat {
  return BEATS[Math.min(loop, BEATS.length - 1)];
}

/** How strongly the simulation shows through (drives environmental hints). */
export interface Leak {
  /** Occasional screen glitches per minute. */
  glitchesPerMinute: number;
  /** Misplaced "missing texture" blocks in walls. */
  missingBlocks: number;
  /** Floating UI window frames above the dungeon. */
  windows: number;
  /** Giant mouse cursor in the sky. */
  cursor: boolean;
  /** Taskbar on the horizon, monitor-blue sky. */
  desktop: boolean;
}

export function leakFor(loop: number): Leak {
  return {
    glitchesPerMinute: [1, 3, 5, 8, 12][Math.min(loop, 4)],
    missingBlocks: Math.min(6, 1 + loop),
    windows: loop >= 1 ? Math.min(6, loop * 2) : 0,
    cursor: loop >= 2,
    desktop: loop >= 3,
  };
}
