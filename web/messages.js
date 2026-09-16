/**
 * messages.js -- the goofy writing. Kept apart from logic so it is easy to edit.
 */

export const LOADING_LINES = [
  'Hatching the dino…',
  'Teaching Python to run…',
  'Inflating the clouds…',
  'Watering the cacti…',
  'Bribing the pterodactyls…',
  'Warming up tiny legs…',
];

/** Shown briefly when you pass a score milestone. */
export const MILESTONE_CHEERS = [
  'nice!', 'wowee!', 'look at you go!', 'unstoppable!', 'certified speedy',
  'the cacti fear you', 'majestic!', 'big dino energy', 'yippee!',
  'you are doing amazing', 'chomp chomp chomp',
];

/** Shown on the game-over card. */
export const DEATH_LINES = [
  'oopsie.',
  'that cactus had it coming.',
  'you were so close to nothing in particular.',
  'the dino is fine. emotionally, unclear.',
  'skill issue (affectionate).',
  'have you considered… not hitting that?',
  'a valiant flop.',
  'the pterodactyl sends its regards.',
  'RIP. briefly.',
];

/** Milestones that unlock a little congratulation banner. */
export const BADGES = [
  { score: 100, emoji: '🌱', label: 'Sprout' },
  { score: 250, emoji: '🌵', label: 'Cactus Dodger' },
  { score: 500, emoji: '🌙', label: 'Night Owl' },
  { score: 1000, emoji: '⭐', label: 'Star Runner' },
  { score: 2000, emoji: '👑', label: 'Dino Royalty' },
];

export function pick(list, seed) {
  if (seed === undefined) return list[Math.floor(Math.random() * list.length)];
  return list[Math.abs(Math.floor(seed)) % list.length];
}

export function badgeFor(score) {
  let earned = null;
  for (const badge of BADGES) {
    if (score >= badge.score) earned = badge;
  }
  return earned;
}
