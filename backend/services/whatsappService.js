const twilio = require("twilio");

const hasTwilioConfig =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_WHATSAPP_NUMBER;

const client = hasTwilioConfig
  ? twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
  : null;

function normalizeWhatsAppPhone(phone = "") {
  const trimmed = String(phone).trim();

  if (!trimmed) return "";
  if (trimmed.startsWith("whatsapp:")) return trimmed;

  return `whatsapp:${trimmed}`;
}

async function sendWhatsApp(phone, message) {
  try {
    if (!client) {
      return {
        success: false,
        error: "Twilio WhatsApp is not configured"
      };
    }

    const result = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: normalizeWhatsAppPhone(phone),
      body: message
    });

    console.log("WhatsApp sent to:", phone);

    return {
      success: true,
      providerMessageId: result.sid,
      sentAt: new Date()
    };
  } catch (error) {
    console.error("WhatsApp error:", error.message);

    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = sendWhatsApp;
