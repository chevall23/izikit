// Dev seed script. Creates exactly 3 OWNER_AGENT users, each with 3
// VERIFIED listings (one primary photo apiece), so the admin back-office
// and public listing surfaces have predictable data to test against.
// Mirrors seed-agents.ts: idempotent (upsert keyed on email), refuses to
// run in production, exports main(args, deps) for unit testing with an
// injected PrismaClient.
//
// Usage: pnpm seed:test-agents

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

interface SeedListing {
  title: string;
  propertyType: string;
  transactionType: string;
  price: number;
  surfaceM2: number;
  bedrooms?: number;
  bathrooms?: number;
  description: string;
  photoUrl: string;
  // Total photos to attach (first one is primary). Extra photos cycle
  // through PHOTO_POOL so the gallery "+N" preview has real data to show.
  photoCount?: number;
}

interface SeedAgent {
  email: string;
  name: string;
  city: string;
  country: string;
  phone: string;
  bio: string;
  avatarUrl: string;
  listings: SeedListing[];
}

const PHOTO_A =
  'https://storage.googleapis.com/banani-generated-images/generated-images/aeb3b3b2-0485-4a4a-a4f5-16674c826a8e.jpg';
const PHOTO_B =
  'https://storage.googleapis.com/banani-generated-images/generated-images/4957ee68-0565-4368-9433-203197e44eb9.jpg';
const PHOTO_C =
  'https://storage.googleapis.com/banani-generated-images/generated-images/eeae1866-66b5-4155-890f-f3c987e2996f.jpg';
const PHOTO_D =
  'https://storage.googleapis.com/banani-generated-images/generated-images/c4f7451e-3131-41f4-a4de-bcbd71f39a70.jpg';

// Extra photos beyond each listing's primary cycle through this pool.
const PHOTO_POOL = [PHOTO_A, PHOTO_B, PHOTO_C, PHOTO_D];

const SEED_AGENTS: SeedAgent[] = [
  {
    email: 'agent.test1@habitat-afrik.test',
    name: 'Test Agent — Cotonou',
    city: 'Cotonou',
    country: 'Bénin',
    phone: '+22991000101',
    bio: 'Agent de test n°1 — villas et appartements sur Cotonou et Abomey-Calavi.',
    avatarUrl: 'https://storage.googleapis.com/banani-avatars/avatar%2Fmale%2F25-35%2FAfrican%2F6',
    listings: [
      {
        title: 'Villa 4 chambres, Fidjrossè',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
        price: 85_000_000,
        surfaceM2: 260,
        bedrooms: 4,
        bathrooms: 3,
        description: 'Villa basse récente avec jardin, à 300 m de la plage de Fidjrossè.',
        photoUrl: PHOTO_B,
        photoCount: 9,
      },
      {
        title: 'Appartement meublé, Haie Vive',
        propertyType: 'APPARTEMENT',
        transactionType: 'LOCATION',
        price: 400_000,
        surfaceM2: 110,
        bedrooms: 3,
        bathrooms: 2,
        description: 'Appartement climatisé au 2ᵉ étage, quartier Haie Vive, sécurisé 24/7.',
        photoUrl: PHOTO_A,
        photoCount: 6,
      },
      {
        title: 'Parcelle titrée, Abomey-Calavi',
        propertyType: 'PARCELLE',
        transactionType: 'VENTE',
        price: 18_000_000,
        surfaceM2: 500,
        description: 'Parcelle de 500 m² entièrement titrée, viabilisée, accès goudron.',
        photoUrl: PHOTO_C,
        photoCount: 5,
      },
    ],
  },
  {
    email: 'agent.test2@habitat-afrik.test',
    name: 'Test Agent — Abidjan',
    city: 'Abidjan',
    country: "Côte d'Ivoire",
    phone: '+22507000202',
    bio: 'Agent de test n°2 — standing et bureaux à Cocody et Marcory.',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F25-35%2FAfrican%2F4',
    listings: [
      {
        title: 'Duplex standing, Cocody Angré',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
        price: 165_000_000,
        surfaceM2: 340,
        bedrooms: 5,
        bathrooms: 4,
        description: 'Duplex récent avec piscine, dépendance et forage, Angré 8ᵉ tranche.',
        photoUrl: PHOTO_B,
        photoCount: 12,
      },
      {
        title: 'Bureau open-space, Plateau',
        propertyType: 'BUREAU',
        transactionType: 'LOCATION',
        price: 1_200_000,
        surfaceM2: 200,
        description: 'Plateau de bureaux au 6ᵉ étage, climatisation centralisée, 2 places parking.',
        photoUrl: PHOTO_C,
        photoCount: 7,
      },
      {
        title: 'Appartement 2 chambres, Marcory',
        propertyType: 'APPARTEMENT',
        transactionType: 'LOCATION',
        price: 280_000,
        surfaceM2: 85,
        bedrooms: 2,
        bathrooms: 2,
        description: 'Appartement rénové, résidence calme à Marcory Résidentiel.',
        photoUrl: PHOTO_A,
        photoCount: 4,
      },
    ],
  },
  {
    email: 'agent.test3@habitat-afrik.test',
    name: 'Test Agent — Dakar',
    city: 'Dakar',
    country: 'Sénégal',
    phone: '+221770000303',
    bio: 'Agent de test n°3 — locations meublées et terrains sur Dakar et Diamniadio.',
    avatarUrl:
      'https://storage.googleapis.com/banani-avatars/avatar%2Ffemale%2F35-50%2FAfrican%2F1',
    listings: [
      {
        title: 'Appartement meublé, Almadies',
        propertyType: 'APPARTEMENT',
        transactionType: 'LOCATION',
        price: 650_000,
        surfaceM2: 130,
        bedrooms: 3,
        bathrooms: 2,
        description: 'Vue mer partielle, résidence avec piscine et salle de sport, Almadies.',
        photoUrl: PHOTO_A,
        photoCount: 8,
      },
      {
        title: 'Villa avec piscine, Ngor',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
        price: 320_000_000,
        surfaceM2: 420,
        bedrooms: 6,
        bathrooms: 5,
        description: 'Villa pieds dans l’eau à Ngor, 6 chambres, studio indépendant, piscine.',
        photoUrl: PHOTO_B,
        photoCount: 10,
      },
      {
        title: 'Terrain 300 m², Diamniadio',
        propertyType: 'PARCELLE',
        transactionType: 'VENTE',
        price: 22_000_000,
        surfaceM2: 300,
        description: 'Terrain dans zone lotie de Diamniadio, proche pôle urbain, bail en cours.',
        photoUrl: PHOTO_C,
        photoCount: 12,
      },
    ],
  },
];

const SEED_PASSWORD = 'AgentPassword123!';

interface SeedDeps {
  prisma?: PrismaClient;
}

export async function main(_args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-test-agents in production.');
    process.exit(1);
  }

  const prisma = deps.prisma ?? new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

    for (const seed of SEED_AGENTS) {
      const user = await prisma.user.upsert({
        where: { email: seed.email },
        update: {
          name: seed.name,
          city: seed.city,
          country: seed.country,
          bio: seed.bio,
          phone: seed.phone,
          avatarUrl: seed.avatarUrl,
          accountType: 'OWNER_AGENT',
        },
        create: {
          email: seed.email,
          passwordHash,
          emailVerifiedAt: new Date(),
          accountType: 'OWNER_AGENT',
          name: seed.name,
          city: seed.city,
          country: seed.country,
          bio: seed.bio,
          phone: seed.phone,
          avatarUrl: seed.avatarUrl,
        },
        select: { id: true, email: true },
      });

      // Wipe and recreate this agent's seeded listings on every run so
      // re-seeding stays deterministic.
      await prisma.listing.deleteMany({
        where: { userId: user.id, title: { in: seed.listings.map((l) => l.title) } },
      });
      for (const listing of seed.listings) {
        const total = Math.max(1, listing.photoCount ?? 1);
        const photos = Array.from({ length: total }, (_, i) => ({
          key: `seed/${user.id}/${i}`,
          url: i === 0 ? listing.photoUrl : PHOTO_POOL[(i - 1) % PHOTO_POOL.length]!,
          isPrimary: i === 0,
          position: i,
        }));
        await prisma.listing.create({
          data: {
            userId: user.id,
            title: listing.title,
            city: seed.city,
            country: seed.country,
            propertyType: listing.propertyType,
            transactionType: listing.transactionType,
            price: listing.price,
            currency: 'XOF',
            status: 'VERIFIED',
            description: listing.description,
            surfaceM2: listing.surfaceM2,
            bedrooms: listing.bedrooms,
            bathrooms: listing.bathrooms,
            photos: { create: photos },
          },
        });
      }

      const photoTotal = seed.listings.reduce((n, l) => n + Math.max(1, l.photoCount ?? 1), 0);
      console.log(
        `✓ ${user.email} — ${seed.listings.length} annonce(s) VERIFIED, ${photoTotal} photos`,
      );
    }
    console.log(`\nMot de passe de test pour les 3 agents : ${SEED_PASSWORD}`);
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
