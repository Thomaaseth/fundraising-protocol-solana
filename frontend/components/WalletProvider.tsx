"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider
} from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

require('@solana/wallet-adapter-react-ui/styles.css');

export const SolanaWalletProvider = ({ children }: any) => {
  const network = "devnet";
  const endpoint = useMemo(() => clusterApiUrl(network), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

