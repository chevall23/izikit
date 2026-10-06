// Constants shared by the server home page (page.tsx) and its client
// sections — a 'use client' module's exports are client references on the
// server, so plain values must live in a neutral module like this one.
// 12 = four full rows of the 3-column "Annonces à la une" grid.
export const FEATURED_LISTINGS_LIMIT = 12;
export const HOME_AGENTS_LIMIT = 4;
