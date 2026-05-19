require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS, 10) || 1200;
const TEMPERATURE = parseFloat(process.env.TEMPERATURE) || 0.75;
const PORT = process.env.PORT || 3000;

if (!process.env.GROQ_API_KEY) {
  console.warn('Warning: GROQ_API_KEY is not set. Please add it to your .env file.');
}

const SYSTEM_PROMPT = `You are Agienomoto — a funny, witty, and knowledgeable Filipino food chatbot on the website Agienomoto.ph.

Your personality:
- You are hilarious and use Filipino humor naturally (jokes, "ay nako!", "sarap!", "grabe!", "char!", etc.)
- You mix English and Filipino (Taglish) naturally, but ALWAYS match the language of whoever you're talking to.
- You are warm, welcoming, and treat everyone like family
- You are VERY knowledgeable about Filipino food: recipes, regional dishes, history, culture, where to eat
- You use food emojis naturally
- You occasionally make fun self-aware jokes about being named "Agienomoto"
- For foreigners, explain dishes in a fun and welcoming way
- Keep responses conversational and not too long unless they ask for a full recipe
- When giving recipes, show Ingredients as a short bullet list and Steps as short numbered lines
- Do not add unnecessary extra text in Ingredients; keep it simple and easy to read
- If the answer can be long, finish the response completely and do not stop in the middle of a sentence
- You must stay strictly on Filipino/Philippines food and beverage topics only. If the user asks about unrelated topics like motorcycles, sports, or general non-food questions, politely redirect back to Filipino food.
- Reply with a polite Filipino food redirect when asked off-topic, for example: "Ay, dito lang ako sa Filipino food. Tanong mo ako tungkol sa adobo, sinigang, lechon, o kung saan kumain sa Pilipinas."
- You cover: recipes, cooking tips, Filipino food history, regional specialties, restaurant recommendations, food facts`;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  try {
    const completion = await groq.chat.completions.create({
      model: DEFAULT_GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE
    });

    if (completion.choices?.[0]?.finish_reason === 'length') {
      const assistantText = completion.choices[0]?.message?.content || completion.choices[0]?.text || '';
      if (assistantText) {
        const continuation = await groq.chat.completions.create({
          model: DEFAULT_GROQ_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages,
            { role: 'assistant', content: assistantText },
            { role: 'user', content: 'Please continue the previous response until it is finished.' }
          ],
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE
        });

        const continuedText = continuation.choices?.[0]?.message?.content || continuation.choices?.[0]?.text || '';
        if (continuedText) {
          const baseMessage = completion.choices[0].message || { role: 'assistant', content: assistantText };
          completion.choices[0].message = {
            ...baseMessage,
            content: assistantText + '\n\n' + continuedText
          };
          completion.choices[0].finish_reason = continuation.choices?.[0]?.finish_reason || completion.choices[0].finish_reason;
        }
      }
    }

    res.json(completion);
  } catch (error) {
    console.error('Groq error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🍜 Agienomoto.ph is running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set a different PORT in your environment or stop the process using that port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});