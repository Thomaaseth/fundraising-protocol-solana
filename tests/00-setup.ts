import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FundraisingProtocol } from "../target/types/fundraising_protocol";
import { expect } from "chai";
import * as utils from "./utils";

describe("fundraising Protocol: Setup", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FundraisingProtocol as Program<FundraisingProtocol>;
  const connection = provider.connection;

  it("initialize the project counter", async () => {
    const projectCounterPDA = utils.findProjectCounterPDA(program);

    await program.methods
      .initializeCounter()
      .accounts({
        payer: provider.wallet.publicKey,
        project_counter: projectCounterPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .rpc();

    const counterAccount = await program.account.projectCounter.fetch(projectCounterPDA);
    expect(counterAccount.count).to.equal(0);
    
    console.log("project counter initialized successfully with count:", counterAccount.count);
  });
});