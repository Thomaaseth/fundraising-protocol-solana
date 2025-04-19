use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use crate::{errors::ErrorCode, state::*};

// pub fn finalize_project(ctx: Context<FinalizeProject>) -> Result<()> {
//     let project = &mut ctx.accounts.project;

//     // required checks
//     require!(!project.is_finalized, ErrorCode::ProjectAlreadyFinalized);


//     // only check deadline in non-test mode
//     #[cfg(not(feature = "test-mode"))]
//     {
//         let current_time = Clock::get()?.unix_timestamp;
//         require!(
//             current_time >= project.deadline,
//             ErrorCode::ProjectNotExpired
//         );
//     }

//     // Only modify vault if successful
//     let vault = &mut ctx.accounts.vault;
    
//     let total_amount = vault.total_amount;

//     // Check if funding goal is met
//     let is_success = vault.total_amount >= project.funding_goal;
//     project.is_success = is_success;
//     project.is_finalized = true;

//     if is_success {
//         // Create seeds for signing
//         let vault_bump = vault.bump;
//         let project_key = project.key();

//         let seeds = &[b"vault", project_key.as_ref(), &[vault_bump]];
//         let signer = &[&seeds[..]];

//         // Transfer SOL from vault to creator
//         invoke_signed(
//             &system_instruction::transfer(
//                 &vault.to_account_info().key(),
//                 &ctx.accounts.creator.key(),
//                 total_amount,
//             ),
//             &[
//                 vault.to_account_info(),
//                 ctx.accounts.creator.to_account_info(),
//                 ctx.accounts.system_program.to_account_info(),
//             ],
//             signer,
//         )?;

//         // Reset vault amount
//         vault.total_amount = 0;
//     }
//     Ok(())
// }

// Test fix: Anchor accounts hold data: can't transfer 'from' vault because it holds data => can't use transfer instruction
pub fn finalize_project(ctx: Context<FinalizeProject>) -> Result<()> {
    let project = &mut ctx.accounts.project;

    // required checks
    require!(!project.is_finalized, ErrorCode::ProjectAlreadyFinalized);

    // only check deadline in non-test mode
    #[cfg(not(feature = "test-mode"))]
    {
        let current_time = Clock::get()?.unix_timestamp;
        msg!("Current time: {}, Deadline: {}", current_time, project.deadline);
        require!(
            current_time >= project.deadline,
            ErrorCode::ProjectNotExpired
        );
    }

    let vault = &ctx.accounts.vault;
    
    let total_amount = vault.total_amount;

    let is_success = total_amount >= project.funding_goal;
    
    project.is_success = is_success;
    project.is_finalized = true;

    if is_success {
        let vault_bump = vault.bump;
        let project_key = project.key();

        let seeds = &[b"vault", project_key.as_ref(), &[vault_bump]];
        let signer = &[&seeds[..]];
        
        // use direct lamport addition/subtraction instead of system_instruction::transfer
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= total_amount;
        **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += total_amount;
        
        let mut vault_account = &mut ctx.accounts.vault;
        vault_account.total_amount = 0;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeProject<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project", project.creator.as_ref(), &project.project_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.creator == creator.key() @ ErrorCode::UnauthorizedCreator,
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        seeds = [b"vault", project.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}
