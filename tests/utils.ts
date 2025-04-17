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
            new BN(projectId).toArrayLike(Buffer, "le", 8)
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
      [Buffer.from("vault"), projectPDA.toBuffer()],
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
  
    await program.methods
      .initializeProject(title, description, new BN(fundingGoal))
      .accounts({
        creator: creator.publicKey,
        project_counter: counterPDA, 
        project: projectPDA,
        vault: vaultPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
  
    return projectPDA;
  }