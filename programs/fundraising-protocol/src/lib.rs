use anchor_lang::prelude::*;
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
use instructions::*;

// This is your program's public key and it will update
// automatically when you build the project.
declare_id!("FimYszAo6d4WboiABnVFC4is6vebkEzbqmNVL7gkwg3H");

#[program]
mod fundraising_protocol {
    use super::*;

    pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
        instructions::initialize_counter(ctx)
    }

    pub fn initialize_project(
        ctx: Context<InitializeProject>,
        title: String,
        description: String,
        funding_goal: u64,
    ) -> Result<()> {
        instructions::initialize_project(ctx, title, description, funding_goal)
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64, timestamp: i64) -> Result<()> {
        instructions::contribute(ctx, amount, timestamp)
    }

    pub fn finalize_project(ctx: Context<FinalizeProject>) -> Result<()> {
        instructions::finalize_project(ctx)
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        instructions::claim_refund(ctx)
    }
}
