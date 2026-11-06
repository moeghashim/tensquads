const MODEL_URL = "https://api.openai.com/v1/chat/completions";
const MODEL_MS = 15_000;

export function modelChatBody(model: string, effort: string, gap: string) {
	return {
		model,
		...(effort ? { reasoning_effort: effort } : {}),
		messages: [{ role: "user" as const, content: `Write a brief under 150 words. Name this gap: ${gap}` }],
	};
}

export async function requestModelBrief(
	load: typeof fetch,
	key: string,
	model: string,
	effort: string,
	gap: string,
): Promise<string> {
	try {
		const response = await load(MODEL_URL, {
			method: "POST",
			headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
			body: JSON.stringify(modelChatBody(model, effort, gap)),
			signal: AbortSignal.timeout(MODEL_MS),
		});
		if (!response.ok) return "";
		const body = (await response.json()) as { choices?: readonly { message?: { content?: string } }[] };
		return body.choices?.[0]?.message?.content?.trim() ?? "";
	} catch {
		return "";
	}
}
