use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use crate::{constants::*, errors::ErrorCode, state::*};

pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
    // Check inputs
    require!(amount > 0, ErrorCode::InvalidContributionAmount);

    // Check project still within deadline time
    let now = Clock::get()?.unix_timestamp;
    let project = &ctx.accounts.project;
    require!(now < project.deadline, ErrorCode::ProjectExpired);
    require!(!project.is_finalized, ErrorCode::ProjectFinalized);

    // SOL transfer to vault
    invoke(
        &system_instruction::transfer(
            &ctx.accounts.contributor.key(),
            &ctx.accounts.vault.to_account_info().key(),
            amount,
        ),
        &[
            ctx.accounts.contributor.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // Update vault total amount
    let vault = &mut ctx.accounts.vault;
    vault.total_amount = vault
        .total_amount
        .checked_add(amount)
        .ok_or(ErrorCode::AmountOverflow)?;

    // Record contribution
    let contribution = &mut ctx.accounts.contribution;
    contribution.user = ctx.accounts.contributor.key();
    contribution.project = ctx.accounts.project.key();
    contribution.amount = amount;
    contribution.timestamp = now;
    contribution.is_refunded = false;
    contribution.bump = ctx.bumps.contribution;

    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, timestamp: i64)]

pub struct Contribute<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), &project.project_id.to_le_bytes()],
        bump = project.bump,
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = contributor,
        space = ANCHOR_DISCRIMINATOR + Contribution::SIZE,
        seeds = [
            b"contribution", 
            contributor.key().as_ref(), 
            project.key().as_ref(), 
            &timestamp.to_le_bytes()
        ],
        bump
    )]
    pub contribution: Account<'info, Contribution>,

    pub system_program: Program<'info, System>,

    pub clock: Sysvar<'info, Clock>,
}
