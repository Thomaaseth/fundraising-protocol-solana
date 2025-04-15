use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::{invoke, invoke_signed}, system_instruction};



declare_id!("FimYszAo6d4WboiABnVFC4is6vebkEzbqmNVL7gkwg3H");

pub const MAX_TITLE_LENGTH: usize = 100;
pub const MAX_DESCRIPTION_LENGTH: usize = 1000;


#[program]
pub mod fundraising_protocol {

    use super::*;

    // Initialize a global project counter
    pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.project_counter;
        counter.count = 0;
        counter.bump = ctx.bumps.project_counter;
        Ok(())
    }

    // Initialize a new crowdfunded project
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
        counter.count += 1;

        // Init project account
        let project = &mut ctx.accounts.project;
        project.creator = ctx.accounts.creator.key();
        project.title = title;
        project.description = description;
        project.funding_goal = funding_goal;
        project.deadline = current_time + 30 * 24 * 60 * 60; // 30 days from init
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

pub fn contribute(ctx: Context<Contribute>, amount: u64, timestamp: i64) -> Result<()> {
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
            amount
        ),
        &[
            ctx.accounts.contributor.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ]
    )?;

    // Update vault total amount
    let vault = &mut ctx.accounts.vault;
    vault.total_amount = vault.total_amount.checked_add(amount).ok_or(ErrorCode::AmountOverflow)?;

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

pub fn finalize_project(ctx: Context<FinalizeProject>) -> Result<()> {
    let project = &mut ctx.accounts.project;

    // required checks
    require!(!project.is_finalized, ErrorCode::ProjectAlreadyFinalized);

    let current_time = Clock::get()?.unix_timestamp;
    require!(current_time >= project.deadline, ErrorCode::ProjectNotExpired);
    
    // Only modify vault if successful
    let vault = &mut ctx.accounts.vault;
    let total_amount = vault.total_amount;

    // Check if funding goal is met
    let is_success = vault.total_amount >= project.funding_goal;
    project.is_success = is_success;
    project.is_finalized = true;

    if is_success {
        
        // Create seeds for signing
        let vault_bump = vault.bump;
        let project_key = project.key();
        
        let seeds = &[
            b"vault",
            project_key.as_ref(),
            &[vault_bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer SOL from vault to creator
        invoke_signed(
            &system_instruction::transfer(
                &vault.to_account_info().key(),
                &ctx.accounts.creator.key(),
                total_amount
            ), 
            &[
                vault.to_account_info(),
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer
        )?;

        // Reset vault amount
        vault.total_amount = 0;

    }
    Ok(())
}

}


// Accounts struct for the project PDA
#[account]
pub struct ProjectCounter {
    pub count: u64,
    pub bump: u8,
}

impl ProjectCounter {
    pub const SIZE: usize = 8 + // count (u64)
    1;                          // bump (u8)
}

#[account]
pub struct Project {
    pub creator: Pubkey,        // Creator public key
    pub title: String,          
    pub description: String,
    pub funding_goal: u64,      // Funding goal in lamports
    pub deadline: i64,          // Deadline timestamp
    pub project_id: u64,        // Project id (from counter)
    pub is_success: bool,
    pub is_finalized: bool,
    pub bump: u8,               // PDA Bump seed
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
    1;                           // bump (u8)
}


#[account]
pub struct Vault {
    pub project: Pubkey,        // Ref to project PDA
    pub total_amount: u64,      // Total amount contributed in lamports
    pub bump: u8,               // PDA bump seed
}

impl Vault {
    pub const SIZE: usize = 32 + // project pubkey
        8 +                      // total_amount (u64)
        1;                       // bump (u8)
}


#[account]
pub struct Contribution {
    pub user: Pubkey,           // Contributor public key
    pub project: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub is_refunded: bool,      // If contribution has been refunded (project failed) or not 
    pub bump: u8,
}
impl Contribution {
    pub const SIZE: usize = 32 + // user pubkey
        32 +                     // project pubkey
        8 +                      // amount (u64)
        8 +                      // timestamp (i64)
        1 +                      // is_refunded (bool)
        1;                       // bump (u8)
}

// Context for the counter
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

// Context for init project
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
        space = 8 + Project::SIZE,
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
        space = 8 + Vault::SIZE,
        seeds = [
            b"vault",
            project.key().as_ref()
        ],
        bump
    )]

    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

// Context for contributing to a project
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
        space = 8 + Contribution::SIZE,
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

// Context for finalizing a project
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



#[error_code]
pub enum ErrorCode {
    #[msg("Title cannot be empty")]
    EmptyTitle,
    #[msg("Description cannot be empty")]
    EmptyDescription,
    #[msg("Title is too long")]
    TitleTooLong,
    #[msg("Description is too long")]
    DescriptionTooLong,
    #[msg("Funding goal must be greater than zero")]
    InvalidFundingGoal,
    #[msg("Contribution amount must be greater than zero")]
    InvalidContributionAmount,
    #[msg("Project has expired")]
    ProjectExpired,
    #[msg("Project has already been finalized")]
    ProjectFinalized,
    #[msg("Amount overflow occurred")]
    AmountOverflow,
    #[msg("Project has already been finalized")]
    ProjectAlreadyFinalized,
    #[msg("Project deadline has not yet passed")]
    ProjectNotExpired,
    #[msg("Only the project creator can finalize the project")]
    UnauthorizedCreator,
}