import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FundraisingProtocol } from "../target/types/fundraising_protocol";
import { LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import * as utils from "./utils";
import { BN } from "bn.js";

describe("Fundraising Protocol: Project Success Path", () => {
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
  
  const testTitle = "test successful roject";
  const testDescription = "success test project";
  const testFundingGoal = 2 * LAMPORTS_PER_SOL; // 2 SOL
  const contribution1Amount = 1.5 * LAMPORTS_PER_SOL; // 1.5 SOL
  const contribution2Amount = 1 * LAMPORTS_PER_SOL; // 1 SOL

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

  it("accepts contributions from multiple users", async () => {
    const initialCreatorBalance = await utils.getBalance(connection, creator.publicKey);
    const initialContributor1Balance = await utils.getBalance(connection, contributor1.publicKey);
    const initialContributor2Balance = await utils.getBalance(connection, contributor2.publicKey);
    
    contribution1PDA = await utils.contributeToProject(
      program,
      contributor1,
      projectPDA,
      contribution1Amount
    );
    
    let vaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(vaultAccount.totalAmount.toNumber()).to.equal(contribution1Amount);
    
    let contributionAccount1 = await program.account.contribution.fetch(contribution1PDA);
    expect(contributionAccount1.user.toString()).to.equal(contributor1.publicKey.toString());
    expect(contributionAccount1.project.toString()).to.equal(projectPDA.toString());
    expect(contributionAccount1.amount.toNumber()).to.equal(contribution1Amount);
    expect(contributionAccount1.isRefunded).to.be.false;
    
    contribution2PDA = await utils.contributeToProject(
      program,
      contributor2,
      projectPDA,
      contribution2Amount
    );
    
    vaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(vaultAccount.totalAmount.toNumber()).to.equal(contribution1Amount + contribution2Amount);
    
    let contributionAccount2 = await program.account.contribution.fetch(contribution2PDA);
    expect(contributionAccount2.user.toString()).to.equal(contributor2.publicKey.toString());
    expect(contributionAccount2.project.toString()).to.equal(projectPDA.toString());
    expect(contributionAccount2.amount.toNumber()).to.equal(contribution2Amount);
    expect(contributionAccount2.isRefunded).to.be.false;
    
    console.log("successfully received contributions totaling", 
      (contribution1Amount + contribution2Amount) / LAMPORTS_PER_SOL, "SOL");
  });

  it("can be finalized by creator after short deadline and transfers funds to creator", async () => {

    console.log("waiting a moment for the (short) deadline to pass...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // get creator's balance before finalization
    const initialCreatorBalance = await utils.getBalance(connection, creator.publicKey);
    
    // finalize the project
    await utils.finalizeProject(program, creator, projectPDA);
    
    // check project is finalized and successful
    const updatedProject = await program.account.project.fetch(projectPDA);
    expect(updatedProject.isFinalized).to.be.true;
    expect(updatedProject.isSuccess).to.be.true;
    
    // check vault is empty
    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    expect(vaultAccount.totalAmount.toNumber()).to.equal(0);
    
    // check creator received funds (minus transaction fees)
    const finalCreatorBalance = await utils.getBalance(connection, creator.publicKey);
    
    // account for transaction fees, so check if the balance increased by approximately
    // the expected amount (total contributions)
    const expectedIncrease = contribution1Amount + contribution2Amount;
    const actualIncrease = finalCreatorBalance - initialCreatorBalance;
    
    const tolerance = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL tolerance
    
    console.log("expected increase:", expectedIncrease / LAMPORTS_PER_SOL, "SOL");
    console.log("actual increase:", actualIncrease / LAMPORTS_PER_SOL, "SOL");
    
    // actual increase should be a bit less than expected due to transaction fees
    expect(actualIncrease).to.be.within(expectedIncrease - tolerance, expectedIncrease + tolerance);

    
    console.log("project successfully finalized and funds transferred to creator");
  });

  it("cannot be finalized again after successful finalization", async () => {
    try {
      await utils.finalizeProject(program, creator, projectPDA);
      expect.fail("project should not be finalizable twice");
    } catch (error) {
      expect(error.toString()).to.include("ProjectAlreadyFinalized");
      console.log("correctly prevented double finalization");
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

  it("prevents contributors from claiming refunds on successful projects", async () => {
    try {
      await program.methods
        .claimRefund()
        .accounts({
          contributor: contributor1.publicKey,
          project: projectPDA,
          vault: vaultPDA,
          contribution: contribution1PDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([contributor1])
        .rpc();
      
      expect.fail("should not allow refund on successful project");
    } catch (error) {
      expect(error.toString()).to.include("ProjectSucceeded");
      console.log("correctly prevented refund on successful project");
    }
  });
});