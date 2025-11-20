import { describe, it, expect, vi } from 'vitest';
import { upsertIncident } from '../src/services/incidentService';
import { PrismaClient } from '@prisma/client';

const mocks = vi.hoisted(() => {
    return {
        upsert: vi.fn(),
    };
});

vi.mock('@prisma/client', () => {
    return {
        PrismaClient: class {
            incident = {
                upsert: mocks.upsert,
            };
        },
    };
});

describe('IncidentService', () => {
    it('should upsert an incident', async () => {
        const mockIncident = {
            id: '123',
            ticket_number: 'RQ-123',
            title: 'Test Incident',
            severity: 'High',
            state: 'NEW',
            created_at: new Date(),
            raw_data: {},
        };
        mocks.upsert.mockResolvedValue(mockIncident);

        const result = await upsertIncident(mockIncident);
        expect(mocks.upsert).toHaveBeenCalled();
        expect(result).toEqual(mockIncident);
    });
});
