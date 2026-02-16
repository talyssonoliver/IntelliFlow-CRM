import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Reading migration SQL...');
  const sqlPath = path.join(__dirname, 'base_migration.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');

  // Remove comment lines
  sql = sql.replace(/^--.*$/gm, '');

  // Split by semicolons
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log('Found ' + statements.length + ' statements to execute');

  let count = 0;
  let success = 0;
  for (const stmt of statements) {
    count++;
    const trimmed = stmt.trim();
    if (trimmed.length === 0) continue;

    // Log progress every 20 statements
    if (count % 20 === 0) console.log('Executing statement ' + count + '...');

    try {
      await prisma.$executeRawUnsafe(trimmed);
      success++;
    } catch (err: any) {
      // Ignore "already exists" errors
      if (err.message.includes('already exists')) {
        console.log('Skipping (already exists): ' + trimmed.substring(0, 50) + '...');
        success++;
      } else {
        console.error('Error on statement ' + count + ':', err.message);
        console.error('Statement preview:', trimmed.substring(0, 200));
        throw err;
      }
    }
  }

  console.log('Successfully executed ' + success + '/' + count + ' statements');

  // Verify by counting tables
  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    "SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public'"
  );
  console.log('Tables created:', Number(result[0]?.count || 0));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
