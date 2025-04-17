use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub project: Pubkey,   // Ref to project PDA
    pub total_amount: u64, // Total amount contributed in lamports
    pub bump: u8,          // PDA bump seed
}