import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

const client = twilio(accountSid, authToken);

const sendOTP = async (phone, otp) => {
  try {
    const formattedPhone = phone.trim();
    console.log(`Sending OTP: ${otp} to phone: ${formattedPhone}`);

    const message = await client.messages.create({
      body: `Your OTP is ${otp}. It is valid for 5 minutes.`,
      messagingServiceSid,
      to: formattedPhone,
    });

    console.log("✅ OTP sent successfully to", formattedPhone, message.sid);

    return { success: true, sid: message.sid }; // ✅ return result
  } catch (error) {
    console.error("❌ Error sending OTP:", error);
    return { success: false, error }; // ✅ always return an object
  }
};

export { sendOTP };
