import { createPesapalPayment } from "../services/payment/pesapal";

export function usePayment() {
  const pay = async (amount: number, email: string, phone: string) => {
    const res = await createPesapalPayment(amount, email, phone);

    if (res.redirect_url) {
      window.location.href = res.redirect_url;
    }

    return res;
  };

  return { pay };
}