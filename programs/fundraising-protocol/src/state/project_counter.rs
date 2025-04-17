use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProjectCounter {
    pub count: u64,
    pub bump: u8,
}
