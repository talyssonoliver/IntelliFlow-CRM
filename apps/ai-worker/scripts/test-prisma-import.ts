async function main() {
  try {
    const mod = await import('@intelliflow/db');
    console.log('has prisma:', 'prisma' in mod);
    console.log('has Prisma:', 'Prisma' in mod);
    console.log('has PrismaClient:', 'PrismaClient' in mod);
    console.log('Prisma type:', typeof mod.Prisma);
    console.log('prisma type:', typeof mod.prisma);
    console.log('keys sample:', Object.keys(mod).slice(0, 15));
  } catch (err) {
    console.error('Import failed:', (err as Error).message);
  }
  process.exit(0);
}
main();
