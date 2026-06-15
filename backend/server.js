import "dotenv/config";
import express from "express";
import cors from "cors";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const app = express();
app.use(cors());
app.use(express.json());

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Claude AI Sidebar backend is running ✅" });
});

app.post("/chat", async (req, res) => {
  const { messages, pageContent } = req.body;
  const MODEL_ID = "us.anthropic.claude-opus-4-6-v1";

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2000,
        system: `You are a helpful AI assistant embedded in a browser sidebar. The user is viewing this page:\n\n${pageContent}\n\nBe concise and helpful. Use the page content to answer questions.`,
        messages
      })
    });

    const response = await bedrock.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    const text = result.content.map(b => b.text || "").join("");
    res.json({ reply: text });

  } catch (err) {
    console.error("Bedrock error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => console.log(`✅ Claude backend running → http://localhost:${PORT}`));
