use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    pub project: Pubkey,   // Ref to project PDA
    pub total_amount: u64, // Total amount contributed in lamports
    pub bump: u8,          // PDA bump seed
}

impl Vault {
    pub const SIZE: usize = 32 + // project pubkey
        8 +                      // total_amount (u64)
        1; // bump (u8)
}