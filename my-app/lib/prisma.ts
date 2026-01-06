import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  // For build time or when no DB configured
  if (!connectionString) {
    console.warn('DATABASE_URL not set');
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        if (prop === 'then') return undefined; // Allow promise checks
        throw new Error('Database not configured - please set DATABASE_URL');
      }
    });
  }

  // Create Neon adapter with connection string
  const adapter = new PrismaNeon({ connectionString });

  return new PrismaClient({ adapter });
}

// Create a new PrismaClient instance
const prisma = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;
