import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export class WalletRepository {
  async getWallet(userId: string) {
    const { data } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    return data;
  }

  async createWallet(userId: string) {
    const { data } = await supabase
      .from("wallets")
      .insert({ user_id: userId, balance: 0 })
      .select()
      .single();

    return data;
  }

  async credit(userId: string, amount: number, reference?: string) {
    const wallet = await this.getWallet(userId) || await this.createWallet(userId);

    const newBalance = (wallet.balance || 0) + amount;

    await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);

    await supabase.from("transactions").insert({
      user_id: userId,
      amount,
      type: "credit",
      reference,
      status: "success"
    });

    return newBalance;
  }

  async debit(userId: string, amount: number, reference?: string) {
    const wallet = await this.getWallet(userId);

    if (!wallet || wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    const newBalance = wallet.balance - amount;

    await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);

    await supabase.from("transactions").insert({
      user_id: userId,
      amount,
      type: "debit",
      reference,
      status: "success"
    });

    return newBalance;
  }
}