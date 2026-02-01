export interface FlashIdentification {
    id: number;
    source_ipfs_cid: string;
    matched_flash_id: number;
    matched_flash_name: string | null;
    similarity: number;
    confidence: number;
    created_at: Date;
}
