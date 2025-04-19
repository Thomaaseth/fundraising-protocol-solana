import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FundraisingProtocol } from "../target/types/fundraising_protocol";
import { LAMPORTS_PER_SOL, Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import * as utils from "./utils";
import { BN } from "bn.js";

describe("Fundraising protocol: contributions", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FundraisingProtocol as Program<FundraisingProtocol>;
  const connection = provider.connection;

  let creator: Keypair;
  let contributor1: Keypair;
  let contributor2: Keypair;
  let projectCounterPDA: PublicKey;
  let projectPDA: PublicKey;
  let vaultPDA: PublicKey;
  
  const testTitle = "Test contribution project";
  const testDescription = "test project";
  const testFundingGoal = 10 * LAMPORTS_PER_SOL; // 10 SOL

  before(async () => {
    // create and fund all necessary wallets
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
      testFundingGoal
    );
    console.log("test project created with address:", projectPDA.toString());
    
    vaultPDA = utils.findVaultPDA(program, projectPDA);
  });

  it("makes a successful contribution to a project", async () => {
    const contributionAmount = 1 * LAMPORTS_PER_SOL; // 1 SOL
    
    const initialContributorBalance = await connection.getBalance(contributor1.publicKey);
    const initialVaultData = await program.account.vault.fetch(vaultPDA);
    
    const currentTime = Math.floor(Date.now() / 1000);
    const contributionPDA = utils.findContributionPDA(
      program, 
      contributor1.publicKey, 
      projectPDA, 
      currentTime
    );
    
    await program.methods
      .contribute(new BN(contributionAmount), new BN(currentTime))
      .accounts({
        contributor: contributor1.publicKey,
        project: projectPDA,
        vault: vaultPDA,
        contribution: contributionPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      } as any)
      .signers([contributor1])
      .rpc();
    
    const userContributions = await program.account.contribution.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: contributor1.publicKey.toBase58()
        }
      },
      {
        memcmp: {
          offset: 8 + 32, // after discriminator and user pubkey
          bytes: projectPDA.toBase58()
        }
      }
    ]);
    
    expect(userContributions.length).to.be.at.least(1);
    const actualContributionPDA = userContributions[0].publicKey;
    
    const newContributorBalance = await connection.getBalance(contributor1.publicKey);
    expect(initialContributorBalance - newContributorBalance).to.be.at.least(contributionAmount);
    
    const vaultData = await program.account.vault.fetch(vaultPDA);
    expect(vaultData.totalAmount.toNumber()).to.equal(
      initialVaultData.totalAmount.toNumber() + contributionAmount
    );
    
    const contributionData = await program.account.contribution.fetch(actualContributionPDA);
    expect(contributionData.user.toString()).to.equal(contributor1.publicKey.toString());
    expect(contributionData.project.toString()).to.equal(projectPDA.toString());
    expect(contributionData.amount.toNumber()).to.equal(contributionAmount);
    expect(contributionData.isRefunded).to.be.false;
    
    console.log(`contribution of ${contributionAmount / LAMPORTS_PER_SOL} SOL success`);
  });

  it("allows multiple contributions from the same user", async () => {
    const secondContributionAmount = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL
    
    const initialVaultData = await program.account.vault.fetch(vaultPDA);
    
    const initialContributions = await program.account.contribution.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: contributor1.publicKey.toBase58()
        }
      }
    ]);
    
    const currentTime = Math.floor(Date.now() / 1000);
    const contributionPDA = utils.findContributionPDA(
      program, 
      contributor1.publicKey, 
      projectPDA, 
      currentTime
    );
    
    await program.methods
      .contribute(new BN(secondContributionAmount), new BN(currentTime))
      .accounts({
        contributor: contributor1.publicKey,
        project: projectPDA,
        vault: vaultPDA,
        contribution: contributionPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      } as any)
      .signers([contributor1])
      .rpc();
    
    const updatedContributions = await program.account.contribution.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: contributor1.publicKey.toBase58()
        }
      }
    ]);
    expect(updatedContributions.length).to.equal(initialContributions.length + 1);
    
    const vaultData = await program.account.vault.fetch(vaultPDA);
    expect(vaultData.totalAmount.toNumber()).to.equal(
      initialVaultData.totalAmount.toNumber() + secondContributionAmount
    );
    
    console.log("multiple contributions from same user processed successfully");
  });

  it("allows contributions from multiple users", async () => {
    const thirdContributionAmount = 2 * LAMPORTS_PER_SOL; // 2 SOL
    
    const initialVaultData = await program.account.vault.fetch(vaultPDA);
    
    const currentTime = Math.floor(Date.now() / 1000);
    const contributionPDA = utils.findContributionPDA(
      program, 
      contributor2.publicKey, 
      projectPDA, 
      currentTime
    );
    
    await program.methods
      .contribute(new BN(thirdContributionAmount), new BN(currentTime))
      .accounts({
        contributor: contributor2.publicKey,
        project: projectPDA,
        vault: vaultPDA,
        contribution: contributionPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      } as any)
      .signers([contributor2])
      .rpc();
    
    const vaultData = await program.account.vault.fetch(vaultPDA);
    expect(vaultData.totalAmount.toNumber()).to.equal(
      initialVaultData.totalAmount.toNumber() + thirdContributionAmount
    );
    
    const user2Contributions = await program.account.contribution.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: contributor2.publicKey.toBase58()
        }
      }
    ]);
    
    expect(user2Contributions.length).to.be.at.least(1);
    const actualContributionPDA = user2Contributions[0].publicKey;
    
    const contributionData = await program.account.contribution.fetch(actualContributionPDA);
    expect(contributionData.user.toString()).to.equal(contributor2.publicKey.toString());
    expect(contributionData.project.toString()).to.equal(projectPDA.toString());
    expect(contributionData.amount.toNumber()).to.equal(thirdContributionAmount);
    
    console.log("contributions from multiple users processed successfully");
  });

  it("fails when contributing 0 SOL", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const contributionPDA = utils.findContributionPDA(
      program, 
      contributor1.publicKey, 
      projectPDA, 
      currentTime
    );
    
    try {
      await program.methods
        .contribute(new BN(0), new BN(currentTime))
        .accounts({
          contributor: contributor1.publicKey,
          project: projectPDA,
          vault: vaultPDA,
          contribution: contributionPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        } as any)
        .signers([contributor1])
        .rpc();
        
      expect.fail("expected error when contributing 0 SOL was not thrown");
    } catch (error) {
      expect(error.toString()).to.include("InvalidContributionAmount");
      console.log("correctly rejected contribution of 0 SOL");
    }
  });

  it("verifies the total vault amount matches sum of all contributions", async () => {
    const allContributions = await program.account.contribution.all([
      {
        memcmp: {
          offset: 8 + 32, // after discriminator and user pubkey
          bytes: projectPDA.toBase58()
        }
      }
    ]);
    
    const expectedSum = allContributions.reduce(
      (sum, contrib) => sum + contrib.account.amount.toNumber(), 
      0
    );
    
    const vaultData = await program.account.vault.fetch(vaultPDA);
    
    expect(vaultData.totalAmount.toNumber()).to.equal(expectedSum);
    console.log(`total vault amount (${vaultData.totalAmount.toNumber() / LAMPORTS_PER_SOL} SOL) matches sum of all contributions`);
  });

  it("creates a second project and tests cross-project contribution isolation", async () => {
    const firstVaultDataBefore = await program.account.vault.fetch(vaultPDA);

    const project2Title = "Second test project";
    const project2FundingGoal = 5 * LAMPORTS_PER_SOL;
    
    const project2PDA = await utils.createProject(
      program,
      creator,
      project2Title,
      "another test project",
      project2FundingGoal
    );
    
    const project2VaultPDA = utils.findVaultPDA(program, project2PDA);
    
    const contribution2Amount = 1.5 * LAMPORTS_PER_SOL;
    
    const currentTime = Math.floor(Date.now() / 1000);
    const contributionPDA = utils.findContributionPDA(
      program, 
      contributor2.publicKey, 
      project2PDA, 
      currentTime
    );
    
    await program.methods
      .contribute(new BN(contribution2Amount), new BN(currentTime))
      .accounts({
        contributor: contributor2.publicKey,
        project: project2PDA,
        vault: project2VaultPDA,
        contribution: contributionPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      } as any)
      .signers([contributor2])
      .rpc();
    
    const firstVaultDataAfter = await program.account.vault.fetch(vaultPDA);
    expect(firstVaultDataAfter.totalAmount.toNumber()).to.equal(firstVaultDataBefore.totalAmount.toNumber());

    const secondVaultData = await program.account.vault.fetch(project2VaultPDA);
    expect(secondVaultData.totalAmount.toNumber()).to.equal(contribution2Amount);
    
    console.log("cross-project contribution isolation checked");
  });

  it("handles large contribution amounts correctly", async () => {
    const largeContributor = await utils.createAndFundWallet(connection, 100 * LAMPORTS_PER_SOL);
    
    const largeAmount = 50 * LAMPORTS_PER_SOL;
    
    const initialVaultData = await program.account.vault.fetch(vaultPDA);
    
    const currentTime = Math.floor(Date.now() / 1000);
    const contributionPDA = utils.findContributionPDA(
      program, 
      largeContributor.publicKey, 
      projectPDA, 
      currentTime
    );
    
    await program.methods
      .contribute(new BN(largeAmount), new BN(currentTime))
      .accounts({
        contributor: largeContributor.publicKey,
        project: projectPDA,
        vault: vaultPDA,
        contribution: contributionPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      } as any)
      .signers([largeContributor])
      .rpc();
    
    const vaultData = await program.account.vault.fetch(vaultPDA);
    expect(vaultData.totalAmount.toNumber()).to.equal(
      initialVaultData.totalAmount.toNumber() + largeAmount
    );
    
    console.log(`large contribution of ${largeAmount / LAMPORTS_PER_SOL} SOL success`);
  });

  it("gets all contributions for a specific user across projects", async () => {
    // get all contributions for contributor1
    const userContributions = await program.account.contribution.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: contributor1.publicKey.toBase58()
        }
      }
    ]);
    
    // verify all returned contributions belong to contributor1
    for (const contrib of userContributions) {
      expect(contrib.account.user.toString()).to.equal(contributor1.publicKey.toString());
    }
    
    console.log(`found ${userContributions.length} contributions for user`);
  });

  // test for expired project - to add

});