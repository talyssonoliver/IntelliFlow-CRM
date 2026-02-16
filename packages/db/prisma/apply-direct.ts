import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Testing direct table creation...');

  // Create a simple test table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS test_table_123 (
      id TEXT PRIMARY KEY,
      name TEXT
    )
  `);
  console.log('Created test table');

  // Check if it exists
  const result = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'test_table_123'
    )
  `);
  console.log('Test table exists:', result[0]?.exists);

  // Insert a row
  await prisma.$executeRawUnsafe(`
    INSERT INTO test_table_123 (id, name) VALUES ('1', 'test') ON CONFLICT (id) DO NOTHING
  `);

  // Query
  const rows = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
    `SELECT * FROM test_table_123`
  );
  console.log('Rows:', rows);

  // Clean up
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS test_table_123`);
  console.log('Cleaned up');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
