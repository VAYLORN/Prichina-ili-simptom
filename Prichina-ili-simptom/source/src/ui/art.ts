import type { SectorId } from '../../shared/types';

// Pictures behind the case screens and in the board quarters (public/theme/CREDITS.txt).
// `art` marks the illustrations drawn for the game: they keep their own colours, while the
// stock photos are toned into the sector colour.
export const SECTOR_ART: Record<SectorId, { src: string; at: string; art: boolean }> = {
  supply: { src: '/theme/art-supply.webp', at: '50% 55%', art: true },
  // shifted up so the sign at the top right sits between the case counter and the timer label
  production: { src: '/theme/art-production.webp', at: '50% 25%', art: true },
  quality: { src: '/theme/art-quality.webp', at: '50% 50%', art: true },
  people: { src: '/theme/art-people.webp', at: '50% 50%', art: true },
};

// The final «Доклад директору»; bottom-aligned so the trophy on the wall screen sits above the timer.
export const FINAL_ART = { src: '/theme/art-final.webp', at: '50% 100%', art: true };

// 3D icons drawn for the game (public/theme/icons): transparent squares, the picture centred.
const icon = (name: string) => `/theme/icons/${name}.webp`;

export const SECTOR_ICON: Record<SectorId, string> = {
  supply: icon('sector-supply'),
  production: icon('sector-production'),
  quality: icon('sector-quality'),
  people: icon('sector-people'),
};

export const CARD_ICON = {
  situation: icon('card-situation'),
  fact: icon('card-fact'),
  noise: icon('card-noise'),
  opinion: icon('card-opinion'),
  hidden: icon('card-hidden'),
  trap: icon('card-trap'),
};

// By role id (shared/content/roles.ts); a role without a picture keeps its line icon.
export const ROLE_ICON: Record<string, string> = {
  lead: icon('role-lead'),
  analyst: icon('role-analyst'),
  expert: icon('role-expert'),
  secretary: icon('role-secretary'),
  skeptic: icon('role-skeptic'),
  timekeeper: icon('role-timekeeper'),
};
