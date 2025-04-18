import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FundraisingProtocol } from "../target/types/fundraising_protocol";
import { LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import * as utils from "./utils";
import { BN } from "bn.js";

describe("Fundraising Protocol: Project Creation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FundraisingProtocol as Program<FundraisingProtocol>;
  const connection = provider.connection;

  let creator: Keypair;
  let projectCounterPDA: anchor.web3.PublicKey;
  
  const testTitle = "Test Project";
  const testDescription = "This is a test project";
  const testFundingGoal = 5 * LAMPORTS_PER_SOL; // 5 SOL

  before(async () => {
    creator = await utils.createAndFundWallet(connection);
    console.log("creator wallet created with address:", creator.publicKey.toString());
    
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
  });

  it("creates a new project with valid parameters", async () => {
    const counterBefore = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId = counterBefore.count + 1; // Next project ID
    
    const expectedProjectPDA = utils.findProjectPDA(program, creator.publicKey, projectId);
    const expectedVaultPDA = utils.findVaultPDA(program, expectedProjectPDA);
    
    await program.methods
      .initializeProject(testTitle, testDescription, new BN(testFundingGoal))
      .accounts({
        creator: creator.publicKey,
        project_counter: projectCounterPDA,
        project: expectedProjectPDA,
        vault: expectedVaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([creator])
      .rpc();
    
    const projectAccount = await program.account.project.fetch(expectedProjectPDA);
    expect(projectAccount.creator.toString()).to.equal(creator.publicKey.toString());
    expect(projectAccount.title).to.equal(testTitle);
    expect(projectAccount.description).to.equal(testDescription);
    expect(projectAccount.fundingGoal.toNumber()).to.equal(testFundingGoal);
    expect(projectAccount.projectId).to.equal(projectId);
    expect(projectAccount.isSuccess).to.be.false;
    expect(projectAccount.isFinalized).to.be.false;
    
    const vaultAccount = await program.account.vault.fetch(expectedVaultPDA);
    expect(vaultAccount.project.toString()).to.equal(expectedProjectPDA.toString());
    expect(vaultAccount.totalAmount.toNumber()).to.equal(0);
    
    const counterAfter = await program.account.projectCounter.fetch(projectCounterPDA);
    expect(counterAfter.count).to.equal(projectId);
    
    console.log("project created successfully with ID:", projectId);
  });

  it("fails to create a project with empty title", async () => {
    const counterBefore = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId = counterBefore.count + 1;; // next project ID
    
    const expectedProjectPDA = utils.findProjectPDA(program, creator.publicKey, projectId);
    const expectedVaultPDA = utils.findVaultPDA(program, expectedProjectPDA);
    
    try {
      await program.methods
        .initializeProject("", testDescription, new BN(testFundingGoal))
        .accounts({
          creator: creator.publicKey,
          project_counter: projectCounterPDA,
          project: expectedProjectPDA,
          vault: expectedVaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();
      
      expect.fail("expected error for empty title was not thrown");
    } catch (error) {
      expect(error.toString()).to.include("EmptyTitle");
      console.log("correctly rejected project with empty title");
    }
  });

  it("fails to create a project with zero funding goal", async () => {
    const counterBefore = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId = counterBefore.count + 1; // next project ID
    
    const expectedProjectPDA = utils.findProjectPDA(program, creator.publicKey, projectId);
    const expectedVaultPDA = utils.findVaultPDA(program, expectedProjectPDA);
    
    try {
      await program.methods
        .initializeProject(testTitle, testDescription, new BN(0))
        .accounts({
          creator: creator.publicKey,
          project_counter: projectCounterPDA,
          project: expectedProjectPDA,
          vault: expectedVaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();
      
      expect.fail("expected error for zero funding goal was not thrown");
    } catch (error) {
      // Verify the error message contains the expected text
      expect(error.toString()).to.include("InvalidFundingGoal");
      console.log("correctly rejected project with zero funding goal");
    }
  });

  it("Creates multiple projects from the same creator", async () => {
    // create first project
    const counterBefore1 = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId1 = counterBefore1.count + 1;
    const expectedProjectPDA1 = utils.findProjectPDA(program, creator.publicKey, projectId1);
    const expectedVaultPDA1 = utils.findVaultPDA(program, expectedProjectPDA1);
    
    await program.methods
      .initializeProject("Project 1", "first project description", new BN(testFundingGoal))
      .accounts({
        creator: creator.publicKey,
        project_counter: projectCounterPDA,
        project: expectedProjectPDA1,
        vault: expectedVaultPDA1,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([creator])
      .rpc();
      
    // create second project from same creator
    const counterBefore2 = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId2 = counterBefore2.count + 1;
    const expectedProjectPDA2 = utils.findProjectPDA(program, creator.publicKey, projectId2);
    const expectedVaultPDA2 = utils.findVaultPDA(program, expectedProjectPDA2);
    
    await program.methods
      .initializeProject("Project 2", "second project description", new BN(testFundingGoal * 2))
      .accounts({
        creator: creator.publicKey,
        project_counter: projectCounterPDA,
        project: expectedProjectPDA2,
        vault: expectedVaultPDA2,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([creator])
      .rpc();
      
    // verify both projects exist and correct data
    const projectAccount1 = await program.account.project.fetch(expectedProjectPDA1);
    const projectAccount2 = await program.account.project.fetch(expectedProjectPDA2);
    
    expect(projectAccount1.title).to.equal("Project 1");
    expect(projectAccount2.title).to.equal("Project 2");
    expect(projectAccount1.projectId).to.equal(projectId1);
    expect(projectAccount2.projectId).to.equal(projectId2);
    
    // verify counter was incremented twice
    const counterAfter = await program.account.projectCounter.fetch(projectCounterPDA);
    expect(counterAfter.count).to.equal(projectId2);
    
    console.log("multiple projects created successfully with IDs:", projectId1, projectId2);
  });
  
  it("creates a project from a different creator", async () => {
    const newCreator = await utils.createAndFundWallet(connection);
    console.log("new creator wallet created with address:", newCreator.publicKey.toString());
    
    const counterBefore = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId = counterBefore.count + 1;
    
    const expectedProjectPDA = utils.findProjectPDA(program, newCreator.publicKey, projectId);
    const expectedVaultPDA = utils.findVaultPDA(program, expectedProjectPDA);
    
    await program.methods
      .initializeProject("new creator project", "project by new creator", new BN(testFundingGoal))
      .accounts({
        creator: newCreator.publicKey,
        project_counter: projectCounterPDA,
        project: expectedProjectPDA,
        vault: expectedVaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([newCreator])
      .rpc();
    
    const projectAccount = await program.account.project.fetch(expectedProjectPDA);
    expect(projectAccount.creator.toString()).to.equal(newCreator.publicKey.toString());
    expect(projectAccount.title).to.equal("new creator project");
    
    const counterAfter = await program.account.projectCounter.fetch(projectCounterPDA);
    expect(counterAfter.count).to.equal(projectId);
    
    console.log("project created by new creator with ID:", projectId);
  });
  
  it("fails to create a project with title exceeding maximum length", async () => {
    const longTitle = "A".repeat(101);
    
    const counterBefore = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId = counterBefore.count + 1;
    
    const expectedProjectPDA = utils.findProjectPDA(program, creator.publicKey, projectId);
    const expectedVaultPDA = utils.findVaultPDA(program, expectedProjectPDA);
    
    try {
      await program.methods
        .initializeProject(longTitle, testDescription, new BN(testFundingGoal))
        .accounts({
          creator: creator.publicKey,
          project_counter: projectCounterPDA,
          project: expectedProjectPDA,
          vault: expectedVaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();
      
      expect.fail("expected error for title exceeding maximum length was not thrown");
    } catch (error) {
      expect(error.toString()).to.include("TitleTooLong");
      console.log("correctly rejected project with title exceeding maximum length");
    }
  });

  it("fails to create a project with description exceeding maximum length", async () => {
    const normalTitle = "Test project";
    const longDescription = "A".repeat(501);
    
    const counterBefore = await program.account.projectCounter.fetch(projectCounterPDA);
    const projectId = counterBefore.count + 1;
    
    const expectedProjectPDA = utils.findProjectPDA(program, creator.publicKey, projectId);
    const expectedVaultPDA = utils.findVaultPDA(program, expectedProjectPDA);
    
    try {
      await program.methods
        .initializeProject(normalTitle, longDescription, new BN(testFundingGoal))
        .accounts({
          creator: creator.publicKey,
          project_counter: projectCounterPDA,
          project: expectedProjectPDA,
          vault: expectedVaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([creator])
        .rpc();
      
      expect.fail("expected error for description exceeding maximum length was not thrown");
    } catch (error) {
      expect(error.toString()).to.include("DescriptionTooLong");
      console.log("correctly rejected project with description exceeding maximum length");
    }
  });

  it("creates 10 projects from a third creator and verifies counter increment", async () => {
    const thirdCreator = await utils.createAndFundWallet(connection, 20 * LAMPORTS_PER_SOL);
    console.log("third creator wallet created with address:", thirdCreator.publicKey.toString());
    
    const initialCounter = await program.account.projectCounter.fetch(projectCounterPDA);
    const startingCount = initialCounter.count;
    console.log("initial counter value:", startingCount);
    
    // create 10 projects
    const numProjects = 10;
    const projectPDAs = [];
    
    for (let i = 0; i < numProjects; i++) {
      const counterBefore = await program.account.projectCounter.fetch(projectCounterPDA);
      const projectId = counterBefore.count + 1;
      
      const expectedProjectPDA = utils.findProjectPDA(program, thirdCreator.publicKey, projectId);
      const expectedVaultPDA = utils.findVaultPDA(program, expectedProjectPDA);
      
      await program.methods
        .initializeProject(
          `project ${i+1} by third creator`, 
          `description for project ${i+1}`, 
          new BN(testFundingGoal)
        )
        .accounts({
          creator: thirdCreator.publicKey,
          project_counter: projectCounterPDA,
          project: expectedProjectPDA,
          vault: expectedVaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([thirdCreator])
        .rpc();
      
      projectPDAs.push(expectedProjectPDA);
      
      const counterAfter = await program.account.projectCounter.fetch(projectCounterPDA);
      expect(counterAfter.count).to.equal(projectId);
      
      console.log(`created project ${i+1} with ID:`, projectId);
    }
    
    // verify final counter value
    const finalCounter = await program.account.projectCounter.fetch(projectCounterPDA);
    expect(finalCounter.count).to.equal(startingCount + numProjects);
    console.log(`counter correctly incremented ${numProjects} times`);
    
    // verify all projects exist and belong to the third creator
    for (let i = 0; i < projectPDAs.length; i++) {
      const projectAccount = await program.account.project.fetch(projectPDAs[i]);
      expect(projectAccount.creator.toString()).to.equal(thirdCreator.publicKey.toString());
      expect(projectAccount.title).to.equal(`project ${i+1} by third creator`);
      expect(projectAccount.projectId).to.equal(startingCount + i + 1);
    }
    
    console.log("successfully verified all 10 projects");
  });
});