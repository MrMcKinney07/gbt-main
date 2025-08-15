export default async function handler(req, res) {
  if (req.method === "POST") {
    const { message } = req.body;

    // Placeholder for OpenAI API later
    res.status(200).json({ reply: `You said: ${message}` });
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}