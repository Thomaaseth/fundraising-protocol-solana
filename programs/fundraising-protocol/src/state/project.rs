use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
#[derive(InitSpace)]
pub struct Project {
    pub creator: Pubkey, // Creator public key
    #[max_len(MAX_TITLE_LENGTH)]
    pub title: String,
    #[max_len(MAX_DESCRIPTION_LENGTH)]
    pub description: String,
    pub funding_goal: u64, // Funding goal in lamports
    pub deadline: i64,     // Deadline timestamp
    pub project_id: u64,   // Project id (from counter)
    pub is_success: bool,
    pub is_finalized: bool,
    pub bump: u8, // PDA Bump seed
}
