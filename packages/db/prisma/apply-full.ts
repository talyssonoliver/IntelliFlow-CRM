import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('Checking initial state...')
  
  // Check tenants
  try {
    const tenants = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) FROM tenants')
    console.log('Tenants table exists, count:', tenants)
  } catch (e: any) {
    console.log('Tenants table does not exist:', e.message.substring(0, 50))
  }
  
  // Read and apply migration
  console.log('Reading migration SQL...')
  const sqlPath = path.join(__dirname, 'base_migration.sql')
  let sql = fs.readFileSync(sqlPath, 'utf8')
  sql = sql.replace(/^--.*$/gm, '')
  
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0)
  console.log('Found', statements.length, 'statements')
  
  let count = 0
  for (const stmt of statements) {
    count++
    try {
      await prisma.$executeRawUnsafe(stmt)
    } catch (e: any) {
      // Ignore certain errors
      if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
        console.log('Error at', count + ':', e.message.substring(0, 80))
      }
    }
  }
  console.log('Applied', count, 'statements')
  
  // Now check tenants again
  console.log('Checking final state...')
  try {
    const result = await prisma.$queryRawUnsafe<{count:bigint}[]>('SELECT COUNT(*) as count FROM tenants')
    console.log('Tenants table exists! Count:', Number(result[0]?.count))
  } catch (e: any) {
    console.log('Tenants table still does not exist:', e.message.substring(0, 80))
  }
  
  // Try direct insert
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO tenants (id, name, status) 
      VALUES ('test-tenant', 'Test', 'ACTIVE') 
      ON CONFLICT (id) DO NOTHING
    `)
    const rows = await prisma.$queryRawUnsafe<any[]>('SELECT * FROM tenants WHERE id = \'test-tenant\'')
    console.log('Test tenant:', rows)
  } catch (e: any) {
    console.log('Insert failed:', e.message.substring(0, 80))
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
