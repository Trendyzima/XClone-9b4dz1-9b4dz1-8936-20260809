export interface Wallet {
  userId: string;
  balance: number;
  currency: string;
}

// In-memory fallback store (replace with DB later)
const wallets: Record<string, Wallet> = {};

export class WalletService {
  getWallet(userId: string): Wallet {
    if (!wallets[userId]) {
      wallets[userId] = {
        userId,
        balance: 0,
        currency: "KES"
      };
    }
    return wallets[userId];
  }

  credit(userId: string, amount: number) {
    const wallet = this.getWallet(userId);
    wallet.balance += amount;
    wallets[userId] = wallet;
    return wallet;
  }

  debit(userId: string, amount: number) {
    const wallet = this.getWallet(userId);

    if (wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    wallet.balance -= amount;
    wallets[userId] = wallet;
    return wallet;
  }

  getBalance(userId: string) {
    return this.getWallet(userId).balance;
  }
}