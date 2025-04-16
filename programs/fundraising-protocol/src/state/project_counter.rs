use anchor_lang::prelude::*;

#[account]
pub struct ProjectCounter {
    pub count: u64,
    pub bump: u8,
}

impl ProjectCounter {
    pub const SIZE: usize = 8 + // count (u64)
    1; // bump (u8)
}
