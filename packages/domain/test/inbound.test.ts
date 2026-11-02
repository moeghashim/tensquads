import assert from "node:assert/strict";
import test from "node:test";

import { chatSource, chatTrigger, evalChatTrigger } from "../src/index.ts";

test("a chat Trigger passes its code gate for the account owner", () => {
	const trigger = chatTrigger("acct-1", "How did ads do this week?");
	assert.equal(trigger.source, chatSource);
	assert.equal(trigger.source.name, "chat");
	const evaluation = evalChatTrigger(trigger, "acct-1");
	assert.equal(evaluation.gate, true);
	assert.equal(evaluation.judgement, null);
	assert.equal(evalChatTrigger(trigger, "acct-2").gate, false);
});
