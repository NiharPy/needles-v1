import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SID;

const client = twilio(accountSid, authToken);

const sendOTP = async (phone, otp) => {
  try {
    const formattedPhone = phone.trim();
    console.log(`Sending OTP: ${otp} to phone: ${formattedPhone}`);

    const message = await client.messages.create({
      body: `Your OTP is ${otp}. It is valid for 5 minutes.`,
      messagingServiceSid: messagingServiceSid,
      to: formattedPhone,
    });

    console.log("OTP sent successfully to", formattedPhone, message.sid);
  } catch (error) {
    console.error("Error sending OTP:", error);
    throw new Error("Failed to send OTP.");
  }
};

export { sendOTP };
