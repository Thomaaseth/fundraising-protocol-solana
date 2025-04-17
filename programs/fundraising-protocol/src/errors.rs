use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Counter full")]
    CounterFull,
    #[msg("Title empty")]
    EmptyTitle,
    #[msg("Description empty")]
    EmptyDescription,
    #[msg("Title too long")]
    TitleTooLong,
    #[msg("Description too long")]
    DescriptionTooLong,
    #[msg("Funding goal is zero")]
    InvalidFundingGoal,
    #[msg("Contribution is zero")]
    InvalidContributionAmount,
    #[msg("Project expired")]
    ProjectExpired,
    #[msg("Project closed")]
    ProjectFinalized,
    #[msg("Amount overflow")]
    AmountOverflow,
    #[msg("Project finalized")]
    ProjectAlreadyFinalized,
    #[msg("Project not expired")]
    ProjectNotExpired,
    #[msg("Unauthorized")]
    UnauthorizedCreator,
    #[msg("Project not finalized")]
    ProjectNotFinalized,
    #[msg("Project has succeeded")]
    ProjectSucceeded,
    #[msg("Already refunded")]
    AlreadyRefunded,
    #[msg("Unauthorized")]
    UnauthorizedContributor,
    #[msg("Invalid contribution")]
    InvalidContribution,
}
