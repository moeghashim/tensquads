import { useNavigate } from "@tanstack/react-router";
import { type Account, type AccountFilter, accountAdminView } from "@tensquads/domain";
import { useState } from "react";

import { AdminFilterButtons, AdminIntro, AdminKpiSection, RightLabel } from "#/screens/admin/chrome.tsx";
import { css } from "#/screens/css.ts";
import { resetTargetAccount } from "#/screens/rules/write-queue.ts";
import { openSpecialSession } from "#/server/admin.ts";

const column = "display: flex; flex-direction: column; gap: 24px";
const onlinePill =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: #04b84c14; color: #008635; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center";
const split = "display: flex; flex-wrap: wrap; gap: 16px; align-items: stretch";
const card =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 16px";
const tableCard =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); display: flex; flex-direction: column";
const rowGrid =
	"display: grid; grid-template-columns: minmax(260px, 2.4fr) minmax(150px, 1.4fr) 90px 120px 110px 100px 70px 70px 80px 110px 90px; gap: 12px; align-items: center;";
const headRow = `${rowGrid} padding: 10px 20px; font-size: 12px; font-weight: 500; color: #5d5d5d; border-bottom: 1px solid rgba(13,13,13,.06)`;
const accountRow = `${rowGrid} width: 100%; min-height: 56px; padding: 8px 20px; border: 0; border-bottom: 1px solid rgba(13,13,13,.06); background: transparent; text-align: left; color: #282828; font-size: 14px`;

export function AccountsScreen({ accounts }: { readonly accounts: readonly Account[] }) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<AccountFilter>("all");
	const view = accountAdminView(accounts, filter, query);
	const navigate = useNavigate();
	return (
		<div data-if="isAdmin" style={css("display: contents")}>
			<div style={css(column)}>
				<AdminIntro
					title="Companies"
					detail="Every company on the platform, with its mission and the squads it runs. Figures are demo data."
					pill={{
						text: `${view.agentsOnline} squads online now`,
						style: onlinePill,
						contrast: "admin-online-pill",
					}}
				/>
				<AdminKpiSection label="Platform totals" loop="adm.kpis" kpis={view.kpis} />
				<div style={css(split)}>
					<section aria-label="New accounts" style={css(`${card}; flex: 3 1 420px; min-width: 0; gap: 16px`)}>
						<div
							style={css(
								"display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px",
							)}
						>
							<h2 style={css("margin: 0; font-size: 16px; font-weight: 600; color: #0d0d0d")}>
								Companies created, last 8 weeks
							</h2>
							<span style={css("font-size: 12px; color: #5d5d5d")}>Hover a bar for the week's count</span>
						</div>
						<div
							style={css(
								"height: 160px; display: flex; align-items: flex-end; gap: 10px; border-bottom: 1px solid rgba(13,13,13,.08)",
							)}
						>
							<div data-loop="adm.bars" data-loop-as="b" style={css("display: contents")}>
								{view.bars.map((bar) => (
									<div
										key={bar.label}
										title={bar.title}
										style={css(
											`flex: 1; height: ${bar.h}%; background: ${bar.fill}; border-radius: 4px 4px 0 0`,
										)}
									/>
								))}
							</div>
						</div>
						<div style={css("display: flex; gap: 10px")}>
							<div data-loop="adm.bars" data-loop-as="b" style={css("display: contents")}>
								{view.bars.map((bar) => (
									<span
										key={`${bar.label}-label`}
										style={css("flex: 1; text-align: center; font-size: 11px; color: #5d5d5d")}
									>
										{bar.label}
									</span>
								))}
							</div>
						</div>
					</section>
					<section aria-label="Plan mix" style={css(`${card}; flex: 2 1 300px; min-width: 0; gap: 12px`)}>
						<h2 style={css("margin: 0; font-size: 16px; font-weight: 600; color: #0d0d0d")}>Companies by plan</h2>
						<div data-loop="adm.plans" data-loop-as="p" style={css("display: contents")}>
							{view.plans.map((plan) => (
								<div key={plan.label} style={css("display: flex; flex-direction: column; gap: 6px")}>
									<div style={css("display: flex; justify-content: space-between; font-size: 13px")}>
										<span style={css("color: #282828")}>{plan.label}</span>
										<span style={css("color: #5d5d5d")}>
											{plan.count} companies · {plan.agents} squads
										</span>
									</div>
									<div
										style={css(
											"height: 8px; border-radius: 999px; background: rgba(13,13,13,.06); overflow: hidden",
										)}
									>
										<div
											style={css(
												`height: 100%; width: ${plan.pct}%; background: ${plan.fill}; border-radius: 999px`,
											)}
										/>
									</div>
								</div>
							))}
						</div>
						<div
							style={css(
								"margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(13,13,13,.06); font-size: 12px; color: #5d5d5d",
							)}
						>
							Average of {view.avgAgents} squads per company
						</div>
					</section>
				</div>
				<section aria-label="All accounts" style={css(tableCard)}>
					<div
						style={css(
							"display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(13,13,13,.06)",
						)}
					>
						<h2 style={css("margin: 0; font-size: 16px; font-weight: 600; color: #0d0d0d")}>
							All companies <span style={css("font-weight: 400; color: #5d5d5d")}>({view.shown})</span>
						</h2>
						<div style={css("display: flex; gap: 8px; flex-wrap: wrap; align-items: center")}>
							<label
								htmlFor="acct-search"
								style={css(
									"position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)",
								)}
							>
								Search companies
							</label>
							<input
								id="acct-search"
								type="search"
								placeholder="Search companies"
								value={view.query}
								data-handler="adm.onQuery"
								data-event="onChange"
								onChange={(event) => setQuery(event.target.value)}
								style={css(
									"height: 32px; width: 220px; max-width: 100%; box-sizing: border-box; padding: 0 12px; border: 0; border-radius: 999px; background: rgba(13,13,13,.06); font-family: inherit; font-size: 13px; color: #0d0d0d",
								)}
							/>
							<div data-loop="adm.filters" data-loop-as="f" style={css("display: contents")}>
								<AdminFilterButtons filters={view.filters} onPick={setFilter} />
							</div>
						</div>
					</div>
					<div style={css("overflow-x: auto")}>
						<div style={css("min-width: 1360px; display: flex; flex-direction: column")}>
							<div style={css(headRow)}>
								<span>Company and mission</span>
								<span>Owner</span>
								<span>Plan</span>
								<span>Subscription</span>
								<span>Started</span>
								<RightLabel>All-time value</RightLabel>
								<RightLabel>Squads</RightLabel>
								<RightLabel>Online</RightLabel>
								<RightLabel>Tasks, 7d</RightLabel>
								<span>Last active</span>
								<span>Status</span>
							</div>
							<div data-loop="adm.rows" data-loop-as="r" style={css("display: contents")}>
								{view.rows.map((row) => (
									<button
										key={row.id}
										type="button"
										className="acct-row"
										data-handler="r.open"
										data-event="onClick"
										onClick={() => void openAccount(row.id, navigate)}
										style={css(accountRow)}
									>
										<span style={css("display: flex; align-items: center; gap: 10px; min-width: 0")}>
											<span
												style={css(
													`width: 28px; height: 28px; border-radius: 8px; background: ${row.tint}; color: #0d0d0d; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex: none`,
												)}
											>
												{row.initials}
											</span>
											<span style={css("display: flex; flex-direction: column; min-width: 0")}>
												<span
													style={css(
														"font-weight: 600; color: #0d0d0d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis",
													)}
												>
													{row.name}
												</span>
												<span
													style={css(
														"font-size: 12px; color: #5d5d5d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis",
													)}
												>
													{row.mission}
												</span>
											</span>
										</span>
										<span style={css("display: flex; flex-direction: column; min-width: 0")}>
											<span style={css("white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>
												{row.owner}
											</span>
											<span
												style={css(
													"font-size: 12px; color: #5d5d5d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis",
												)}
											>
												{row.email}
											</span>
										</span>
										<span>
											<span style={css(row.planStyle)}>{row.plan}</span>
										</span>
										<span style={css("display: flex; flex-direction: column; min-width: 0")}>
											<span style={css("font-weight: 500; color: #0d0d0d; white-space: nowrap")}>
												{row.subscription}
											</span>
											<span style={css("font-size: 12px; color: #5d5d5d; white-space: nowrap")}>
												{row.subscriptionNote}
											</span>
										</span>
										<span style={css("font-size: 13px; color: #282828; white-space: nowrap")}>
											{row.started}
										</span>
										<span
											style={css(
												"text-align: right; font-weight: 600; color: #0d0d0d; font-variant-numeric: tabular-nums",
											)}
										>
											{row.ltvDisplay}
										</span>
										<span style={css("text-align: right; font-weight: 600; color: #0d0d0d")}>
											{row.agents}
										</span>
										<span
											data-design-contrast={offlineCountContrast(row.onlineColor)}
											style={css(`text-align: right; color: ${row.onlineColor}`)}
										>
											{row.online}
										</span>
										<span style={css("text-align: right")}>{row.tasks}</span>
										<span style={css("font-size: 13px; color: #5d5d5d")}>{row.lastActive}</span>
										<span>
											<span style={css(row.statusStyle)}>{row.status}</span>
										</span>
									</button>
								))}
							</div>
							{view.empty ? (
								<div data-if="adm.empty" style={css("display: contents")}>
									<div style={css("padding: 32px 20px; text-align: center; color: #5d5d5d")}>
										No companies match that search.
									</div>
								</div>
							) : null}
						</div>
					</div>
					<div style={css("padding: 12px 20px; font-size: 12px; color: #5d5d5d")}>
						Click a company to open its workspace. In this demo every company opens the same workspace.
					</div>
				</section>
			</div>
		</div>
	);
}

function offlineCountContrast(color: string) {
	return color === "#8f8f8f" ? "admin-offline-count" : undefined;
}

async function openAccount(accountId: string, navigate: ReturnType<typeof useNavigate>) {
	resetTargetAccount();
	await openSpecialSession({ data: accountId });
	await navigate({ to: "/overview" });
}
