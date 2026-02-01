import { Postgres } from "../postgres";
import pool from "../postgresClient";
import { FlashIdentification } from "./types";

const CONFIDENCE_THRESHOLD = 0.8;

export class FlashIdentificationsDb extends Postgres<FlashIdentification> {
    constructor() {
        super(pool);
    }

    /**
     * Get identification for a flash by its IPFS CID
     * Returns null if no identification exists or confidence is below threshold
     */
    async getByIpfsCid(ipfsCid: string): Promise<FlashIdentification | null> {
        const sql = `
            SELECT * FROM flash_identifications
            WHERE source_ipfs_cid = $1
            ORDER BY confidence DESC
            LIMIT 1
        `;

        const results = await this.query(sql, [ipfsCid]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Get identifications for multiple IPFS CIDs
     * Returns a map of ipfs_cid -> identification (only high confidence)
     */
    async getByIpfsCids(ipfsCids: string[]): Promise<Map<string, FlashIdentification>> {
        if (ipfsCids.length === 0) return new Map();

        const placeholders = ipfsCids.map((_, i) => `$${i + 1}`).join(',');
        const sql = `
            SELECT DISTINCT ON (source_ipfs_cid) *
            FROM flash_identifications
            WHERE source_ipfs_cid IN (${placeholders})
            ORDER BY source_ipfs_cid, confidence DESC
        `;

        const results = await this.query(sql, ipfsCids);
        
        const map = new Map<string, FlashIdentification>();
        for (const result of results) {
            map.set(result.source_ipfs_cid, result);
        }
        return map;
    }

    /**
     * Check if an identification has high confidence (>= 80%)
     */
    static isHighConfidence(identification: FlashIdentification | null): boolean {
        return identification !== null && identification.confidence >= CONFIDENCE_THRESHOLD;
    }
}
