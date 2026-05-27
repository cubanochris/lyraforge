// lib/prisma.js — PrismaClient singleton (prevents connection exhaustion in dev)
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;
const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma };
