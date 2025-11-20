import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const upsertIncident = async (data: any) => {
    return await prisma.incident.upsert({
        where: { id: data.id },
        update: data,
        create: data,
    });
};

export const getAllIncidents = async () => {
    return await prisma.incident.findMany();
};
