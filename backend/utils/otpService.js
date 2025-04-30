import twilio from "twilio";

const accountSid = 'AC1fc612fc64686e2288093d6c0df74ff2';
const authToken = '22628bdeb32b11f84ea4bd0002ef99cd';
const messagingServiceSid = 'MGcb77ccadf5b4df8c8dc11d25b06f4e4d';

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
  

export {sendOTP};