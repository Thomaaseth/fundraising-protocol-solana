use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct Project {
    pub creator: Pubkey, // Creator public key
    pub title: String,
    pub description: String,
    pub funding_goal: u64, // Funding goal in lamports
    pub deadline: i64,     // Deadline timestamp
    pub project_id: u64,   // Project id (from counter)
    pub is_success: bool,
    pub is_finalized: bool,
    pub bump: u8, // PDA Bump seed
}

impl Project {
    pub const SIZE: usize = 32 + // Creator pubkey
    4 + MAX_TITLE_LENGTH +       // title (string)
    4 + MAX_DESCRIPTION_LENGTH + // description (string)
    8 +                          // funding goal (u64)
    8 +                          // deadline (i64)
    8 +                          // project_id (u64)
    1 +                          // is_success (bool)
    1 +                          // is_finalized (bool)
    1; // bump (u8)
}
