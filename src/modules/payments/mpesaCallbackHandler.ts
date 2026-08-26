import { processMpesaPayment } from "./paymentOrchestrator";

// HTTP handler for M-Pesa callback
// This is the ENTRY POINT from Safaricom

export async function mpesaCallbackHandler(req: any, res: any) {
  try {
    const body = req.body;

    const result = await processMpesaPayment(body);

    return res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    return res.json({
      success: false,
      error: err.message,
    });
  }
}
