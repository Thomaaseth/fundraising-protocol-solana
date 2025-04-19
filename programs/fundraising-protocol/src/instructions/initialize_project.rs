use anchor_lang::prelude::*;
use crate::{constants::*, errors::ErrorCode, state::*};

pub fn initialize_project(
    ctx: Context<InitializeProject>,
    title: String,
    description: String,
    funding_goal: u64,
) -> Result<()> {
    // Check inputs
    require!(!title.is_empty(), ErrorCode::EmptyTitle);
    require!(!description.is_empty(), ErrorCode::EmptyDescription);
    require!(title.len() <= MAX_TITLE_LENGTH, ErrorCode::TitleTooLong);
    require!(description.len() <= MAX_DESCRIPTION_LENGTH, ErrorCode::DescriptionTooLong);
    require!(funding_goal > 0, ErrorCode::InvalidFundingGoal);

    let current_time: i64 = Clock::get().unwrap().unix_timestamp;
    let counter = &mut ctx.accounts.project_counter;

    require!(counter.count < counter.max, ErrorCode::CounterFull);

    counter.count += 1;

    // Init project account
    let project = &mut ctx.accounts.project;
    project.creator = ctx.accounts.creator.key();
    project.title = title;
    project.description = description;
    project.funding_goal = funding_goal;

    /// Note: when compiled with the "test-mode" feature, this function
    /// will set a very short deadline (20 seconds) to facilitate testing.
    /// In production, the deadline is always 30 days.    
    #[cfg(feature = "test-mode")]
    {
        project.deadline = current_time + 20; // 20 seconds for testing
    }
        
    #[cfg(not(feature = "test-mode"))]
    {
        project.deadline = current_time + 30 * 24 * 60 * 60; // 30 days from init
    }

    project.project_id = counter.count; // using counter as project_id
    project.is_success = false;
    project.is_finalized = false;
    project.bump = ctx.bumps.project;

    // Init vault account
    let vault = &mut ctx.accounts.vault;
    vault.project = project.key();
    vault.total_amount = 0;
    vault.bump = ctx.bumps.vault;

    Ok(())
}

#[derive(Accounts)]
#[instruction(title: String, description: String, funding_goal: u64)]
pub struct InitializeProject<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"project-counter"],
        bump = project_counter.bump
    )]
    pub project_counter: Account<'info, ProjectCounter>,

    #[account(
        init,
        payer = creator,
        space = ANCHOR_DISCRIMINATOR + Project::INIT_SPACE,
        seeds = [
            b"project",
            creator.key().as_ref(),
            &(project_counter.count + 1).to_le_bytes()
        ],
        bump
    )]
    pub project: Account<'info, Project>,

    #[account(
        init,
        payer = creator,
        space = ANCHOR_DISCRIMINATOR + Vault::INIT_SPACE,
        seeds = [
            b"vault",
            project.key().as_ref()
        ],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}
