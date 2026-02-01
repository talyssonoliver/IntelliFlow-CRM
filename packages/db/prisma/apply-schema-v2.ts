import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('Reading migration SQL...')
  const sqlPath = path.join(__dirname, 'base_migration.sql')
  let sql = fs.readFileSync(sqlPath, 'utf8')

  // Remove comment lines
  sql = sql.replace(/^--.*$/gm, '')

  // Split by semicolons
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0)

  console.log('Found ' + statements.length + ' statements to execute')

  let count = 0
  let success = 0
  let skipped = 0
  let errors: string[] = []
  
  for (const stmt of statements) {
    count++
    const trimmed = stmt.trim()
    if (trimmed.length === 0) continue

    // Log progress every 50 statements
    if (count % 50 === 0) console.log('Progress: ' + count + '/' + statements.length)

    try {
      await prisma.$executeRawUnsafe(trimmed)
      success++
    } catch (err: any) {
      // Ignore "already exists" errors
      if (err.message.includes('already exists') || err.message.includes('does not exist')) {
        skipped++
      } else {
        errors.push('Statement ' + count + ': ' + err.message.substring(0, 100))
      }
    }
  }

  console.log('')
  console.log('=== Results ===')
  console.log('Total statements: ' + statements.length)
  console.log('Success: ' + success)
  console.log('Skipped: ' + skipped)
  console.log('Errors: ' + errors.length)
  
  if (errors.length > 0 && errors.length < 20) {
    console.log('')
    console.log('Errors:')
    errors.forEach(e => console.log('  ' + e))
  }

  // Verify by counting tables
  const result = await prisma.$queryRawUnsafe<{count: bigint}[]>(
    "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  )
  console.log('')
  console.log('Tables created:', Number(result[0]?.count || 0))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
