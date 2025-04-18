import "./globals.css";
import { SolanaWalletProvider } from "../components/WalletProvider";

export const metadata = {
  title: "Crowdfunding",
  description: "Solana frontend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SolanaWalletProvider>
          {children}
        </SolanaWalletProvider>
      </body>
    </html>
  );
}

