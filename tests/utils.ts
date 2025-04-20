import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FundraisingProtocol } from "../target/types/fundraising_protocol";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js"
import { BN } from "bn.js"

export const SECONDS_IN_DAY = 24 * 60 * 60;
export const DEFAULT_DEADLINE_DAYS = 30;

export async function createAndFundWallet(connection: Connection, amount: number = 10 * LAMPORTS_PER_SOL): Promise<Keypair> {
    const wallet = Keypair.generate();
    const airdropSignature = await connection.requestAirdrop(wallet.publicKey, amount);
    await connection.confirmTransaction(airdropSignature);
    return wallet;
}

export function findProjectCounterPDA(program: Program<FundraisingProtocol>) {
    const [pda, _] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("project-counter")
        ], 
        program.programId
    );
    return pda;
}

export function findProjectPDA(
    program: Program<FundraisingProtocol>, 
    creator: PublicKey, projectId: number
) {
    const [pda, _] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("project"),
            creator.toBuffer(),
            Buffer.from([projectId]) // expect single byte
        ],
        program.programId
    );
    return pda;
}

export function findVaultPDA(
    program: Program<FundraisingProtocol>, 
    projectPDA: PublicKey
) {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"), 
        projectPDA.toBuffer()
      ],
      program.programId
    );
    return pda;
  }

export function findContributionPDA(
    program: Program<FundraisingProtocol>,
    contributor: PublicKey,
    projectPDA: PublicKey,
    timestamp: number
  ) {
    const [pda, _] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("contribution"),
        contributor.toBuffer(),
        projectPDA.toBuffer(),
        new BN(timestamp).toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    return pda;
  }
  
  export async function createProject(
    program: Program<FundraisingProtocol>,
    creator: Keypair,
    title: string,
    description: string,
    fundingGoal: number,
    counterPDA?: PublicKey
  ): Promise<PublicKey> {
    if (!counterPDA) {
      counterPDA = findProjectCounterPDA(program);
    }
  
    const counterAccount = await program.account.projectCounter.fetch(counterPDA);
    const projectId = counterAccount.count + 1;

    const projectPDA = findProjectPDA(program, creator.publicKey, projectId);
    const vaultPDA = findVaultPDA(program, projectPDA);
  
    const accounts: any = {
      creator: creator.publicKey,
      project_counter: counterPDA,
      project: projectPDA,
      vault: vaultPDA,
      systemProgram: anchor.web3.SystemProgram.programId,
    };
  
    await program.methods
      .initializeProject(title, description, new BN(fundingGoal))
      .accounts(accounts)
      .signers([creator])
      .rpc();
  
    return projectPDA;
  }

  export async function contributeToProject(
    program: Program<FundraisingProtocol>,
    contributor: Keypair,
    projectPDA: PublicKey,
    amount: number // in lamports
  ): Promise<PublicKey> {
    const vaultPDA = findVaultPDA(program, projectPDA);
    
    // Get the current time for the PDA seed
    const timestamp = Math.floor(Date.now() / 1000);
  
    const contributionPDA = findContributionPDA(
      program,
      contributor.publicKey,
      projectPDA,
      timestamp
    );
   
    try {
      await program.methods
        .contribute(new BN(amount), new BN(timestamp)) // Pass timestamp as second argument
        .accounts({
          contributor: contributor.publicKey,
          project: projectPDA,
          vault: vaultPDA,
          contribution: contributionPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        } as any)
        .signers([contributor])
        .rpc();
  
      return contributionPDA;
    } catch (error) {
      // console.error("Error contributing to project:", error);
      throw error;
    }
  }

  export async function finalizeProject(
    program: Program<FundraisingProtocol>,
    creator: Keypair,
    projectPDA: PublicKey
  ): Promise<void> {
    const vaultPDA = findVaultPDA(program, projectPDA);

  
    await program.methods
      .finalizeProject()
      .accounts({
        creator: creator.publicKey,
        project: projectPDA,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      } as any)
      .signers([creator])
      .rpc();
  }
  
  export async function claimRefund(
    program: Program<FundraisingProtocol>,
    contributor: Keypair,
    projectPDA: PublicKey,
    contributionPDA: PublicKey
  ): Promise<void> {
    const vaultPDA = findVaultPDA(program, projectPDA);
  
    await program.methods
      .claimRefund()
      .accounts({
        contributor: contributor.publicKey,
        project: projectPDA,
        vault: vaultPDA,
        contribution: contributionPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([contributor])
      .rpc();
  }
  
  export async function getBalance(
    connection: Connection,
    publicKey: PublicKey
  ): Promise<number> {
    return connection.getBalance(publicKey);
  }
  