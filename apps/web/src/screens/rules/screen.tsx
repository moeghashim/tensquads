import { type Dispatch, type SetStateAction, useState } from "react";

import { css } from "#/screens/css.ts";
import { addWorkspaceRule, type RulesPageData, type RulesRule } from "#/server/rules.ts";
import { useWorkspace } from "#/workspace/context.ts";
import type { RuleForm } from "#/workspace/types.ts";

import { type RulesSnapshotPage, useRulesSnapshot } from "./snapshot.ts";
import {
	bounded,
	isRulesRule,
	markReadFailed,
	noteUncertainWrite,
	onRulesAccountReset,
	placeRule,
	queueLimit,
	queueRule,
	readIfNeeded,
	rulesAccountEpoch,
	shownLimit,
	shownOn,
	useRuleWrites,
} from "./write-queue.ts";

const triggerOptions = [
	"A new order arrives",
	"A refund request comes in",
	"Printify ships an item",
	"A product drops under 10 in stock",
	"A customer leaves a bad review",
	"It is Monday at 8:00",
] as const;

const approvalOptions = ["Auto", "Auto under limit", "Ask first"] as const;

const pageColumn = "display: flex; flex-direction: column; gap: 20px";
const titleStyle =
	"margin: 0; font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d";
const subtitleStyle = "margin: 4px 0 0; color: #5d5d5d";
const rulesCard = "background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 8px 16px";
const ruleRow =
	"display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(13,13,13,.06)";
const ruleText = "flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 4px";
const whenLine = "font-size: 14px; color: #0d0d0d";
const thenLine = "font-size: 13px; color: #414141";
const muted = "color: #5d5d5d";
const agentChip = "display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #414141";
const cardRow = "display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start";
const newRuleCard =
	"flex: 3 1 400px; min-width: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 12px";
const limitsCard =
	"flex: 2 1 280px; min-width: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 12px";
const heading = "margin: 0; font-size: 16px; font-weight: 600; color: #0d0d0d";
const formGrid = "display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px";
const fieldLabel = "display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 500; color: #5d5d5d";
const selectStyle =
	"height: 32px; border: 0; border-radius: 8px; background: rgba(13,13,13,.08); padding: 0 8px; font: inherit; font-size: 13px; color: #0d0d0d";
const actionStyle =
	"height: 32px; border: 0; border-radius: 8px; background: rgba(13,13,13,.08); padding: 0 10px; font: inherit; font-size: 13px; color: #0d0d0d";
const addButton =
	"height: 32px; padding: 0 16px; border: 0; border-radius: 999px; background: #181818; color: #fff; font-size: 13px; font-weight: 500";
const limitBlock = "display: flex; flex-direction: column; gap: 6px";
const limitLabel = "display: flex; justify-content: space-between; font-size: 13px";
const limitValue = "color: #0d0d0d";
const sliderStyle = "width: 100%; accent-color: #181818";
const limitNote = "margin: 0; font-size: 12px; color: #5d5d5d";
const knob = "width: 16px; height: 16px; border-radius: 999px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2)";

type SetRuleForm = Dispatch<SetStateAction<RuleForm>>;
type SetPending = Dispatch<SetStateAction<readonly PendingRule[]>>;

interface Submission {
	readonly id: symbol;
	readonly setForm: SetRuleForm;
	readonly typed: string;
	readonly rowId: string;
	actionEdited: boolean;
}

interface PendingRule {
	readonly id: symbol;
	readonly rowId: string;
	readonly row: RulesRule;
}

const submissions = new Map<symbol, Submission>();
const wantedOn = new Map<symbol, boolean>();
const pendingShown = new Map<symbol, boolean>();
const rowOwners = new Map<string, symbol>();
let pendingSerial = 0;

function clearPendingAccount(): void {
	submissions.clear();
	wantedOn.clear();
	pendingShown.clear();
	rowOwners.clear();
	pendingSerial = 0;
}

onRulesAccountReset(clearPendingAccount);

export function RulesScreen({ page }: { readonly page: RulesSnapshotPage }) {
	useRuleWrites();
	const epoch = rulesAccountEpoch();
	const [seenEpoch, setSeenEpoch] = useState(epoch);
	const [pending, setPending] = useState<readonly PendingRule[]>([]);
	if (seenEpoch !== epoch) {
		setSeenEpoch(epoch);
		setPending([]);
	}
	const workspace = useWorkspace();
	const { snapshot, refresh } = useRulesSnapshot(page, workspace.refresh);
	const rules = [...snapshot.rules, ...pending.map((item) => item.row)];
	return (
		<div data-if="isRules" style={css("display: contents")}>
			<div style={css(pageColumn)}>
				<header>
					<h1 style={css(titleStyle)}>Rules and limits</h1>
					<p style={css(subtitleStyle)}>
						Tell {workspace.frame.masterName} what to do when something happens, which squad does it, and when it
						must ask you first.
					</p>
				</header>
				<RuleList
					rules={rules}
					agents={workspace.frame.agents}
					gateStyle={workspace.helpers.gateStyle}
					switchParts={workspace.helpers.switchParts}
					loaded={snapshot.rules}
					refresh={refresh}
					setPending={setPending}
				/>
				<div style={css(cardRow)}>
					<NewRule
						form={workspace.ruleForm}
						agents={workspace.frame.agents}
						setForm={workspace.setRuleForm}
						setPending={setPending}
						refresh={refresh}
					/>
					<Limits limits={snapshot.limits} refresh={refresh} />
				</div>
			</div>
		</div>
	);
}

function RuleList({
	rules,
	agents,
	gateStyle,
	switchParts,
	loaded,
	refresh,
	setPending,
}: {
	readonly rules: readonly RulesRule[];
	readonly agents: readonly { readonly id: string; readonly name: string; readonly tint: string }[];
	readonly gateStyle: (gate: string) => string;
	readonly switchParts: (on: boolean) => {
		readonly switchBg: string;
		readonly switchJustify: string;
		readonly onStr: string;
	};
	readonly loaded: readonly RulesRule[];
	readonly refresh: () => Promise<void>;
	readonly setPending: SetPending;
}) {
	return (
		<section aria-label="Rules" style={css(rulesCard)}>
			<div data-loop="rules" data-loop-as="r" style={css("display: contents")}>
				{rules.map((rule) => (
					<RuleRow
						key={rule.id}
						rule={rule}
						agent={agents.find((item) => item.id === rule.agent)}
						gateStyle={gateStyle}
						switchParts={switchParts}
						loaded={loaded.find((item) => item.id === rule.id)?.on ?? rule.on}
						refresh={refresh}
						setPending={setPending}
					/>
				))}
			</div>
		</section>
	);
}

function RuleRow({
	rule,
	agent,
	gateStyle,
	switchParts,
	loaded,
	refresh,
	setPending,
}: {
	readonly rule: RulesRule;
	readonly agent: { readonly id: string; readonly name: string; readonly tint: string } | undefined;
	readonly gateStyle: (gate: string) => string;
	readonly switchParts: (on: boolean) => {
		readonly switchBg: string;
		readonly switchJustify: string;
		readonly onStr: string;
	};
	readonly loaded: boolean;
	readonly refresh: () => Promise<void>;
	readonly setPending: SetPending;
}) {
	const on = shownRuleOn(rule, loaded);
	const parts = switchParts(on);
	const toggle = () => {
		toggleRow(rule, loaded, refresh, setPending);
	};
	return (
		<div style={css(ruleRow)}>
			<div style={css(ruleText)}>
				<span style={css(whenLine)}>
					<span style={css(muted)}>When</span> {rule.when}
				</span>
				<span style={css(thenLine)}>
					<span style={css(muted)}>then</span> {rule.action}
				</span>
			</div>
			<span style={css(agentChip)}>
				{agent ? (
					<span style={css(`width: 12px; height: 12px; border-radius: 3px; background: ${agent.tint}`)} />
				) : null}
				{agent?.name ?? rule.agent}
			</span>
			<span style={css(gateStyle(rule.approval))}>{rule.approval}</span>
			<button
				type="button"
				data-handler="r.toggle"
				data-event="onClick"
				aria-pressed={on}
				aria-label="Rule enabled"
				onClick={toggle}
				style={css(
					`width: 34px; height: 20px; border: 0; border-radius: 999px; background: ${parts.switchBg}; padding: 2px; display: flex; justify-content: ${parts.switchJustify}; flex: none`,
				)}
			>
				<span style={css(knob)} />
			</button>
		</div>
	);
}

function NewRule({
	form,
	agents,
	setForm,
	setPending,
	refresh,
}: {
	readonly form: RuleForm;
	readonly agents: readonly { readonly id: string; readonly name: string }[];
	readonly setForm: SetRuleForm;
	readonly setPending: SetPending;
	readonly refresh: () => Promise<void>;
}) {
	return (
		<section aria-label="New rule" style={css(newRuleCard)}>
			<h2 style={css(heading)}>New rule</h2>
			<div style={css(formGrid)}>
				<label style={css(fieldLabel)}>
					When
					<select
						value={form.when}
						data-handler="onWhen"
						data-event="onChange"
						onChange={(event) => setForm({ ...form, when: event.target.value })}
						style={css(selectStyle)}
					>
						<OptionLoop list="triggerOpts" options={triggerOptions} />
					</select>
				</label>
				<label style={css(fieldLabel)}>
					Agent
					<select
						value={form.agent}
						data-handler="onAgent"
						data-event="onChange"
						onChange={(event) => setForm({ ...form, agent: event.target.value })}
						style={css(selectStyle)}
					>
						<OptionLoop
							list="agentOpts"
							options={agents.map((agent) => agent.name)}
							values={agents.map((agent) => agent.id)}
						/>
					</select>
				</label>
				<label style={css(fieldLabel)}>
					Then
					<input
						value={form.action}
						data-handler="onAction"
						data-event="onChange"
						placeholder="What the agent should do"
						onChange={(event) => {
							const action = event.target.value;
							for (const owner of submissions.values()) {
								if (owner.setForm === setForm) {
									owner.actionEdited = true;
								}
							}
							setForm((current) => ({ ...current, action }));
						}}
						style={css(actionStyle)}
					/>
				</label>
				<label style={css(fieldLabel)}>
					Approval
					<select
						value={form.approval}
						data-handler="onApproval"
						data-event="onChange"
						onChange={(event) => setForm({ ...form, approval: event.target.value })}
						style={css(selectStyle)}
					>
						<OptionLoop list="approvalOpts" options={approvalOptions} />
					</select>
				</label>
			</div>
			<div>
				<button
					type="button"
					data-handler="addRule"
					data-event="onClick"
					onClick={() => addRule(form, setForm, setPending, refresh)}
					style={css(addButton)}
				>
					Add rule
				</button>
			</div>
		</section>
	);
}

function OptionLoop({
	list,
	options,
	values,
}: {
	readonly list: string;
	readonly options: readonly string[];
	readonly values?: readonly string[];
}) {
	return (
		<div data-loop={list} data-loop-as="o" style={css("display: contents")}>
			{options.map((option, index) => (
				<option key={values?.[index] ?? option} value={values?.[index] ?? option}>
					{option}
				</option>
			))}
		</div>
	);
}

function shownRuleOn(rule: RulesRule, loaded: boolean): boolean {
	const owner = rowOwners.get(rule.id);
	if (owner !== undefined && submissions.has(owner)) {
		return pendingShown.get(owner) ?? true;
	}
	return shownOn(rule.id, loaded);
}

function toggleRow(rule: RulesRule, loaded: boolean, refresh: () => Promise<void>, setPending: SetPending) {
	const id = rowOwners.get(rule.id);
	if (id !== undefined && submissions.has(id)) {
		const next = !(pendingShown.get(id) ?? true);
		pendingShown.set(id, next);
		wantedOn.set(id, next);
		setPending((items) => items.map((item) => (item.id === id ? { ...item, row: { ...item.row, on: next } } : item)));
		return;
	}
	queueRule(rule.id, !shownOn(rule.id, loaded), refresh);
}

function addRule(form: RuleForm, setForm: SetRuleForm, setPending: SetPending, refresh: () => Promise<void>) {
	const typed = form.action;
	const action = typed.trim();
	if (action.length === 0) {
		return;
	}
	const id = Symbol();
	const rowId = `pending-${pendingSerial}`;
	pendingSerial += 1;
	const submission: Submission = { id, setForm, typed, rowId, actionEdited: false };
	submissions.set(id, submission);
	pendingShown.set(id, true);
	rowOwners.set(rowId, id);
	setPending((items) => [
		...items,
		{
			id,
			rowId,
			row: {
				id: rowId,
				when: form.when.charAt(0).toLowerCase() + form.when.slice(1),
				agent: form.agent,
				action,
				approval: form.approval,
				on: true,
			},
		},
	]);
	setForm((current) => ({ ...current, action: "" }));
	void saveRule(form, submission, setForm, setPending, refresh);
}

function leftAccount(epoch: number): boolean {
	return epoch !== rulesAccountEpoch();
}

async function saveRule(
	form: RuleForm,
	submission: Submission,
	setForm: SetRuleForm,
	setPending: SetPending,
	refresh: () => Promise<void>,
) {
	const epoch = rulesAccountEpoch();
	const { id, typed, rowId } = submission;
	let result: RulesRule | null = null;
	try {
		result = await bounded((signal) =>
			addWorkspaceRule({
				data: { when: form.when, agent: form.agent, action: typed, approval: form.approval },
				signal,
			}),
		);
	} catch {
		if (leftAccount(epoch)) return;
		noteUncertainWrite(epoch);
		markReadFailed(epoch);
		dropPending(id, rowId, setPending);
		const owner = submissions.get(id);
		submissions.delete(id);
		setForm((current) => {
			if (!owner || owner.setForm !== setForm || owner.actionEdited || current.action.length > 0) {
				return current;
			}
			return { ...current, action: owner.typed };
		});
		await bounded(() => refresh()).catch(() => undefined);
		return;
	}
	if (leftAccount(epoch) || !isRulesRule(result)) {
		return;
	}
	const wanted = wantedOn.get(id);
	submissions.delete(id);
	placeRule(result);
	dropPending(id, rowId, setPending);
	if (wanted !== undefined && wanted !== result.on) {
		queueRule(result.id, wanted, refresh);
		return;
	}
	await readIfNeeded(refresh);
}

function dropPending(id: symbol, rowId: string, setPending: SetPending) {
	wantedOn.delete(id);
	pendingShown.delete(id);
	rowOwners.delete(rowId);
	setPending((items) => items.filter((item) => item.id !== id));
}

function Limits({
	limits,
	refresh,
}: {
	readonly limits: RulesPageData["limits"];
	readonly refresh: () => Promise<void>;
}) {
	return (
		<section aria-label="Limits" style={css(limitsCard)}>
			<h2 style={css(heading)}>Limits for every agent</h2>
			<div data-loop="limits" data-loop-as="l" style={css("display: contents")}>
				{limits.map((limit) => {
					const value = shownLimit(limit.key, limit.value);
					return (
						<div key={limit.id} style={css(limitBlock)}>
							<div style={css(limitLabel)}>
								<label htmlFor={limit.id}>{limit.label}</label>
								<strong style={css(limitValue)}>${value}</strong>
							</div>
							<input
								id={limit.id}
								type="range"
								min={limit.min}
								max={limit.max}
								step={limit.step}
								value={value}
								data-handler="l.change"
								data-event="onChange"
								onChange={(event) => queueLimit(limit.key, Number(event.target.value), refresh)}
								style={css(sliderStyle)}
							/>
						</div>
					);
				})}
			</div>
			<p style={css(limitNote)}>
				Changing a limit updates the shared state, so every agent gets the new value with its next task.
			</p>
		</section>
	);
}
