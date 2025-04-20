use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use crate::{errors::ErrorCode, state::*};

pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    let project = &ctx.accounts.project;
    let contribution = &mut ctx.accounts.contribution;

    require!(project.is_finalized, ErrorCode::ProjectNotFinalized);
    require!(!project.is_success, ErrorCode::ProjectSucceeded);
    require!(!contribution.is_refunded, ErrorCode::AlreadyRefunded);

    let refund_amount = contribution.amount;
    contribution.is_refunded = true;

    // Create seeds for vault PDA signing
    let vault = &ctx.accounts.vault;
    let vault_bump = vault.bump;
    let project_key = project.key();

    let seeds = &[b"vault", project_key.as_ref(), &[vault_bump]];
    let signer = &[&seeds[..]];

    // transfer SOL from vault to contributor
    // Can't use invoke transfer on PDA account holding data
    // invoke_signed(
    //     &system_instruction::transfer(
    //         &vault.to_account_info().key(),
    //         &ctx.accounts.contributor.key(),
    //         refund_amount,
    //     ),
    //     &[
    //         vault.to_account_info(),
    //         ctx.accounts.contributor.to_account_info(),
    //         ctx.accounts.system_program.to_account_info(),
    //     ],
    //     signer,
    // )?;

    **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
    **ctx.accounts.contributor.to_account_info().try_borrow_mut_lamports()? += refund_amount;

    // added because we forgot to update the vault amount data after refunds
    let mut vault_account = &mut ctx.accounts.vault;
    vault_account.total_amount = vault_account.total_amount.saturating_sub(refund_amount);

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,

    #[account(
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
        mut,
        seeds = [
            b"contribution", 
            contributor.key().as_ref(), 
            project.key().as_ref(), 
            &contribution.timestamp.to_le_bytes()
        ],
        bump = contribution.bump,
        constraint = contribution.user == contributor.key() @ ErrorCode::UnauthorizedContributor,
        constraint = contribution.project == project.key() @ ErrorCode::InvalidContribution,
    )]
    pub contribution: Account<'info, Contribution>,

    pub system_program: Program<'info, System>,
}
