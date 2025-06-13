import axios from "axios";

const openai = axios.create({
  baseURL: "https://api.openai.com",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

export default openai;