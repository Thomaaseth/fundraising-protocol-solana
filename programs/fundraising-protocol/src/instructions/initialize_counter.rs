use anchor_lang::prelude::*;
use crate::state::*;

pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
    let counter = &mut ctx.accounts.project_counter;
    counter.count = 0;
    counter.bump = ctx.bumps.project_counter;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeCounter<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + ProjectCounter::SIZE,
        seeds = [b"project-counter"],
        bump
    )]
    pub project_counter: Account<'info, ProjectCounter>,

    pub system_program: Program<'info, System>,
}
