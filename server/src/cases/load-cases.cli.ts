import { PrismaClient } from '@prisma/client';
import { importAllCases } from './case-store';

/** npm run cases:load — imports server/cases/*.json, checking every id. */
async function main() {
  const prisma = new PrismaClient();
  try {
    const slugs = await importAllCases(prisma);
    console.log(`Loaded ${slugs.length} case(s): ${slugs.join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
