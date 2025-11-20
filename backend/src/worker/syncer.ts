import { upsertIncident } from '../services/incidentService';
import { RateLimiter } from './rateLimiter';

const limiter = new RateLimiter(5000);

export const syncIncidents = async () => {
    // Phase 1: Fetch List
    if (!limiter.tryConsume(100)) return;

    // Mock API call
    const incidents: any[] = []; // fetch from API

    // Phase 2: Hydrate Details
    for (const inc of incidents) {
        if (!limiter.tryConsume(50)) break;
        // fetch details
        await upsertIncident(inc);
    }
};
