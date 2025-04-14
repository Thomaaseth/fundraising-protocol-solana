use anchor_lang::prelude::*;


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
}