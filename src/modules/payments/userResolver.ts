// Resolves a user identity from M-Pesa payment data
// Maps phone number -> user wallet/profile

export async function resolveUserByPhone(phone: string) {
  // NOTE: This assumes your repo has a Supabase client or DB layer
  // Replace `db` with your actual database client import

  const normalized = phone.replace(/\s|\+/g, "");

  const { data, error } = await (global as any).db
    ?.from("wallets")
    .select("user_id, balance, phone")
    .eq("phone", normalized)
    .single();

  if (error || !data) {
    throw new Error("User wallet not found for phone: " + phone);
  }

  return data;
}
