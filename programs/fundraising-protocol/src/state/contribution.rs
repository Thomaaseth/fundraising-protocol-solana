use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Contribution {
    pub user: Pubkey, // Contributor public key
    pub project: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub is_refunded: bool, // If contribution has been refunded (project failed) or not
    pub bump: u8,
}
