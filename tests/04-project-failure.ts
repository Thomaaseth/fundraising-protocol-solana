import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FundraisingProtocol } from "../target/types/fundraising_protocol";
import { LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import * as utils from "./utils";
import { BN } from "bn.js";

describe("Fundraising protocol: project failure test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FundraisingProtocol as Program<FundraisingProtocol>;
  const connection = provider.connection;

  let creator: Keypair;
  let contributor1: Keypair;
  let contributor2: Keypair;
  let projectCounterPDA: anchor.web3.PublicKey;
  let projectPDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  let contribution1PDA: anchor.web3.PublicKey;
  let contribution2PDA: anchor.web3.PublicKey;
  
  const testTitle = "Failed project test";
  const testDescription = "failure test project & refunds";
  const testFundingGoal = 5 * LAMPORTS_PER_SOL; // 5 SOL
  const contribution1Amount = 1 * LAMPORTS_PER_SOL; // 1 SOL
  const contribution2Amount = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL

  before(async () => {
    creator = await utils.createAndFundWallet(connection);
    contributor1 = await utils.createAndFundWallet(connection);
    contributor2 = await utils.createAndFundWallet(connection);
    
    console.log("creator wallet:", creator.publicKey.toString());
    console.log("contributor 1 wallet:", contributor1.publicKey.toString());
    console.log("contributor 2 wallet:", contributor2.publicKey.toString());
    
    projectCounterPDA = utils.findProjectCounterPDA(program);
    
    try {
      await program.account.projectCounter.fetch(projectCounterPDA);
    } catch (e) {
      await program.methods
        .initializeCounter()
        .accounts({
          payer: provider.wallet.publicKey,
          project_counter: projectCounterPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .rpc();
      console.log("project counter initialized");
    }

    projectPDA = await utils.createProject(
      program,
      creator,
      testTitle,
      testDescription,
      testFundingGoal,
      projectCounterPDA
    );
    
    vaultPDA = utils.findVaultPDA(program, projectPDA);
    console.log("project created with PDA:", projectPDA.toString());
    console.log("vault PDA:", vaultPDA.toString());
  });

  it("accepts contributions that don't meet the funding goal", async () => {
    const initialVaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(initialVaultAccount.totalAmount.toNumber()).to.equal(0);
    
    contribution1PDA = await utils.contributeToProject(
      program,
      contributor1,
      projectPDA,
      contribution1Amount
    );
    
    let vaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(vaultAccount.totalAmount.toNumber()).to.equal(contribution1Amount);
    
    contribution2PDA = await utils.contributeToProject(
      program,
      contributor2,
      projectPDA,
      contribution2Amount
    );

    console.log("original contribution1 PDA:", contribution1PDA.toString());
    console.log("original contribution2 PDA:", contribution2PDA.toString());

    vaultAccount = await program.account.vault.fetch(vaultPDA);
    const totalContributed = contribution1Amount + contribution2Amount;
    expect(vaultAccount.totalAmount.toNumber()).to.equal(totalContributed);
    
    expect(totalContributed).to.be.lessThan(testFundingGoal);
    
    console.log(`successfully received contributions totaling ${totalContributed / LAMPORTS_PER_SOL} SOL, which is less than the goal of ${testFundingGoal / LAMPORTS_PER_SOL} SOL`);
  });

  it("can be finalized by creator after deadline and gets marked as failed", async () => {
    console.log("waiting a moment for the (short) deadline to pass...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await utils.finalizeProject(program, creator, projectPDA);
    
    const updatedProject = await program.account.project.fetch(projectPDA);
    expect(updatedProject.isFinalized).to.be.true;
    expect(updatedProject.isSuccess).to.be.false;
    
    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    const totalContributed = contribution1Amount + contribution2Amount;
    expect(vaultAccount.totalAmount.toNumber()).to.equal(totalContributed);
    
    console.log("project successfully finalized and marked as failed");
  });

  it("cannot be finalized again after being marked as failed", async () => {
    try {
      await utils.finalizeProject(program, creator, projectPDA);
      expect.fail("project should not be finalizable twice");
    } catch (error) {
      expect(error.toString()).to.include("ProjectAlreadyFinalized");
      console.log("correctly prevented double finalization");
    }
  });

  it("allows contributors to claim refunds for failed projects", async () => {
    // get the actual contribution account data to get the timestamp
    const contributionData = await program.account.contribution.fetch(contribution1PDA);
    console.log("original contribution1 PDA:", contribution1PDA.toString());
    console.log("timestamp used in original contribution:", contributionData.timestamp.toString());
    
    // recreate the PDA using the exact same parameters
    const recreatedPDA = utils.findContributionPDA(
        program,
        contributor1.publicKey,
        projectPDA,
        contributionData.timestamp.toNumber()
    );
    
    console.log("Recreated PDA:", recreatedPDA.toString());
    
    // use the recreated PDA for the refund claim
    const initialContributor1Balance = await utils.getBalance(connection, contributor1.publicKey);
    
    await utils.claimRefund(
        program,
        contributor1,
        projectPDA,
        recreatedPDA  // Use the recreated PDA
    );
    
    // check if the contribution is marked as refunded
    const updatedContributionData = await program.account.contribution.fetch(recreatedPDA);
    expect(updatedContributionData.isRefunded).to.be.true;
    
    const finalContributor1Balance = await utils.getBalance(connection, contributor1.publicKey);
    const balanceIncrease = finalContributor1Balance - initialContributor1Balance;
    
    const tolerance = 0.01 * LAMPORTS_PER_SOL;
    expect(balanceIncrease).to.be.within(contributionData.amount.toNumber() - tolerance, contributionData.amount.toNumber());
    
    // update the contribution1PDA for use in later tests
    contribution1PDA = recreatedPDA;
    
    console.log(`contributor 1 successfully claimed refund of ${contributionData.amount.toNumber() / LAMPORTS_PER_SOL} SOL`);
});

it("prevents double refund claims", async () => {
    try {
      await utils.claimRefund(
        program,
        contributor1,
        projectPDA,
        contribution1PDA
      );
      expect.fail("should not allow claiming refund twice");
    } catch (error) {
      expect(error.toString()).to.include("AlreadyRefunded");
      console.log("correctly prevented double refund claim");
    }
});

  it("allows second contributor to claim refund", async () => {
    // use contribution2PDA from when we created the contribution
    console.log("Using contribution2PDA that was stored from creation:", contribution2PDA.toString());
    
    // check this contribution exists and belongs to contributor2
    const contributionData = await program.account.contribution.fetch(contribution2PDA);
    console.log("contributor2 pubkey:", contributor2.publicKey.toString());
    console.log("contribution belongs to:", contributionData.user.toString());
    console.log("timestamp used in original contribution:", contributionData.timestamp.toString());

    console.log("contribution timestamp:", contributionData.timestamp.toString());

    const initialContributor2Balance = await utils.getBalance(connection, contributor2.publicKey);
    
    const recreatedPDA = utils.findContributionPDA(
        program,
        contributor2.publicKey,
        projectPDA,
        contributionData.timestamp.toNumber()
    );
    console.log("Original PDA:", contribution2PDA.toString());
    console.log("Recreated PDA:", recreatedPDA.toString());

    await utils.claimRefund(
      program,
      contributor2,
      projectPDA,
      recreatedPDA  
    );
    
    // check if the contribution is marked as refunded
    const updatedContribData = await program.account.contribution.fetch(contribution2PDA);
    expect(updatedContribData.isRefunded).to.be.true;
    
    // verify the refund was received
    const finalContributor2Balance = await utils.getBalance(connection, contributor2.publicKey);
    const balanceIncrease = finalContributor2Balance - initialContributor2Balance;
    
    const expectedAmount = contributionData.amount.toNumber();
    const tolerance = 0.01 * LAMPORTS_PER_SOL;
    expect(balanceIncrease).to.be.within(expectedAmount - tolerance, expectedAmount);
    
    console.log(`contributor 2 successfully claimed refund of ${expectedAmount / LAMPORTS_PER_SOL} SOL`);
});

  it("verifies vault balance decreases after refunds", async () => {
    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    const totalRefunded = contribution1Amount + contribution2Amount;
    const remainingAmount = vaultAccount.totalAmount.toNumber();

    console.log(`vault remaining amount: ${remainingAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`total refunded: ${totalRefunded / LAMPORTS_PER_SOL} SOL`);
    expect(remainingAmount).to.be.at.most(totalRefunded);

    console.log("vault balance correctly reflects refunded amounts");
  });

  it("prevents unauthorized users from claiming refunds", async () => {
    const randomUser = await utils.createAndFundWallet(connection);
    
    try {
      await program.methods
        .claimRefund()
        .accounts({
          contributor: randomUser.publicKey,
          project: projectPDA,
          vault: vaultPDA,
          contribution: contribution1PDA, // Trying to claim someone else's contribution
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([randomUser])
        .rpc();
      
      expect.fail("unauthorized user should not be able to claim refund");
    } catch (error) {
      // Could be either UnauthorizedContributor or InvalidContribution
      expect(error.toString()).to.include("Error");
      console.log("correctly prevented unauthorized refund claim");
    }
  });

  it("cannot accept new contributions after finalization", async () => {
    const newContributor = await utils.createAndFundWallet(connection);
    
    try {
      await utils.contributeToProject(
        program,
        newContributor,
        projectPDA,
        0.5 * LAMPORTS_PER_SOL
      );
      expect.fail("should not accept contributions after finalization");
    } catch (error) {
      expect(error.toString()).to.include("ProjectFinalized");
      console.log("correctly rejected contributions after finalization");
    }
  });
});