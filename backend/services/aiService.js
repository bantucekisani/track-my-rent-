const OpenAI = require("openai");

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing from environment variables");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function askAI(context, question) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a property management AI assistant.
You help landlords understand rent, arrears, tenants,
maintenance, damages, and cashflow.
Only use the provided data. Do not invent numbers.
Answer clearly and professionally.
`
      },
      {
        role: "user",
        content: `
PROPERTY DATA:
${context}

USER QUESTION:
${question}
`
      }
    ],
    temperature: 0.3
  });

  return completion.choices[0].message.content;
}

module.exports = { askAI };