import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding Iroko AI database...')

  const defaultPassword = await bcrypt.hash('Password123!', 12)

  // 1. Primary Operator
  const admin = await prisma.user.upsert({
    where: { email: 'admin@iroko.ng' },
    update: {
      operatorStatus: 'active',
      operatorRole: 'primary',
    },
    create: {
      email: 'admin@iroko.ng',
      name: 'Iroko Admin Operator',
      passwordHash: defaultPassword,
      operatorStatus: 'active',
      operatorRole: 'primary',
      operatorGrantedAt: new Date(),
    },
  })
  console.log('Created Primary Operator:', admin.email)

  // 2. CAC Accredited Agent
  const cacAgent = await prisma.user.upsert({
    where: { email: 'cac.agent@iroko.ng' },
    update: {
      operatorStatus: 'active',
      operatorRole: 'cac_agent',
    },
    create: {
      email: 'cac.agent@iroko.ng',
      name: 'Chidi Okafor (CAC Accredited)',
      passwordHash: defaultPassword,
      operatorStatus: 'active',
      operatorRole: 'cac_agent',
      operatorGrantedAt: new Date(),
    },
  })
  console.log('Created CAC Agent:', cacAgent.email)

  // 3. NIN Concierge Station Agent
  const ninAgent = await prisma.user.upsert({
    where: { email: 'nin.agent@iroko.ng' },
    update: {
      operatorStatus: 'active',
      operatorRole: 'nin_agent',
    },
    create: {
      email: 'nin.agent@iroko.ng',
      name: 'Amina Bello (NIMC Concierge)',
      passwordHash: defaultPassword,
      operatorStatus: 'active',
      operatorRole: 'nin_agent',
      operatorGrantedAt: new Date(),
    },
  })
  console.log('Created NIN Agent:', ninAgent.email)

  // 4. Test Customer User
  const customer = await prisma.user.upsert({
    where: { email: 'customer@iroko.ng' },
    update: {},
    create: {
      email: 'customer@iroko.ng',
      name: 'Tunde Bakare',
      passwordHash: defaultPassword,
    },
  })
  console.log('Created Test Customer:', customer.email)

  console.log('Database seeding finished successfully!')
}

main()
  .catch((e) => {
    console.error('Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
