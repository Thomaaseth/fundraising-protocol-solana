use anchor_lang::prelude::*;

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
    #[msg("Project is closed")]
    ProjectFinalized,
    #[msg("Amount overflow occurred")]
    AmountOverflow,
    #[msg("Project has already been finalized")]
    ProjectAlreadyFinalized,
    #[msg("Project deadline has not yet passed")]
    ProjectNotExpired,
    #[msg("Only the project creator can finalize the project")]
    UnauthorizedCreator,
    #[msg("Project is not finalized yet")]
    ProjectNotFinalized,
    #[msg("Cannot refund contributions to a successful project")]
    ProjectSucceeded,
    #[msg("This contribution has already been refunded")]
    AlreadyRefunded,
    #[msg("Only the original contributor can claim a refund")]
    UnauthorizedContributor,
    #[msg("Invalid contribution for this project")]
    InvalidContribution,
}
