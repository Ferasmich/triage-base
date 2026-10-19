
import { llm, llmModel } from "../../../lib/llm";

export async function POST(request: Request) {
  try {
    const { message, history = [] } = await request.json();

    const dataToSend = {
      model: llmModel!,
      messages: [
        {
          role: "system" as const,
          content: "You are a friendly support assistant.",
        },
        ...history,
        { role: "user" as const, content: message },
      ],
      stream: false as const,
    };

    console.log("1. Sending to NVIDIA:");
    console.log(JSON.stringify(dataToSend, null, 2));

    const response = await llm.chat.completions.create(dataToSend);

    console.log("2. Received from NVIDIA:");
    console.log(JSON.stringify(response, null, 2));

    const answer = response.choices[0].message.content;

    console.log("3. Sending to browser:", { answer });

    return Response.json({ answer });
  } catch {
    console.log("There is an error.");

    return Response.json(
      { error: "There is an error." },
      { status: 500 },
    );
  }
}

