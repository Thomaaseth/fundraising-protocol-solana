use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProjectCounter {
    pub count: u8,
    pub max: u8,
    pub bump: u8,
}
