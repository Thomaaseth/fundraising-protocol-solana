use anchor_lang::prelude::*;

#[account]
pub struct Contribution {
    pub user: Pubkey, // Contributor public key
    pub project: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub is_refunded: bool, // If contribution has been refunded (project failed) or not
    pub bump: u8,
}
impl Contribution {
    pub const SIZE: usize = 32 + // user pubkey
        32 +                     // project pubkey
        8 +                      // amount (u64)
        8 +                      // timestamp (i64)
        1 +                      // is_refunded (bool)
        1; // bump (u8)
}
