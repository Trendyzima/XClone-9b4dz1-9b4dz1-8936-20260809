export async function createPesapalPayment(amount: number, email: string, phone: string) {
  const res = await fetch(
    "https://YOUR_PROJECT.supabase.co/functions/v1/pesapal-create-order",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, email, phone }),
    }
  );

  return res.json();
}