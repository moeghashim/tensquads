import { css } from "../css.ts";
import { Arrow, Mark } from "../marks.tsx";
import { type BusinessKind, examplesFor, homeAgents, logos, placeholderFor, previewKpis } from "./data.ts";

function chip(on: boolean): string {
	return `height: 32px; padding: 0 14px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 500; background: ${on ? "#181818" : "rgba(13,13,13,.06)"}; color: ${on ? "#fff" : "#282828"}`;
}

export function HomeTop({
	kind,
	draft,
	onKind,
	onDraft,
}: {
	kind: BusinessKind;
	draft: string;
	onKind: (kind: BusinessKind) => void;
	onDraft: (draft: string) => void;
}) {
	const examples = examplesFor(kind);
	return (
		<>
			<nav
				aria-label="Site"
				style={css(
					"position: sticky; top: 0; z-index: 2; background: rgba(252,252,252,.9); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(13,13,13,.06)",
				)}
			>
				<div
					style={css(
						"max-width: 1200px; margin: 0 auto; padding: 12px 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap",
					)}
				>
					<a
						href="/"
						style={css(
							"display: flex; align-items: center; gap: 10px; text-decoration: none; color: #0d0d0d; margin-right: 8px",
						)}
					>
						<span
							style={css(
								"width: 30px; height: 30px; border-radius: 8px; background: #181818; color: #fff; display: inline-flex; align-items: center; justify-content: center",
							)}
						>
							<Mark />
						</span>
						<span style={css("font-weight: 600; font-size: 15px")}>tensquads</span>
					</a>
					<div style={css("display: flex; gap: 2px; flex-wrap: wrap")}>
						<a className="nav-link" href="#squad">
							Agents
						</a>
						<a className="nav-link" href="#how">
							How it works
						</a>
						<a className="nav-link" href="#control">
							Control
						</a>
						<a className="nav-link" href="#pricing">
							Pricing
						</a>
					</div>
					<div style={css("margin-left: auto; display: flex; gap: 8px; align-items: center")}>
						<a className="nav-link" href="/signin">
							Sign in
						</a>
						<a className="btn-dark" href="/signup" style={css("height: 38px; padding: 0 16px; font-size: 14px")}>
							Start free
						</a>
					</div>
				</div>
			</nav>
			<section
				aria-label="Hero"
				style={css(
					"padding: 88px 24px 56px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 28px",
				)}
			>
				<span
					style={css(
						"height: 28px; padding: 0 12px; border-radius: 999px; background: #04b84c14; color: #00692a; font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; gap: 8px",
					)}
				>
					<span style={css("width: 8px; height: 8px; border-radius: 999px; background: #00a240")} />
					New: Analytics agent in beta
				</span>
				<h1
					style={css(
						"margin: 0; max-width: 860px; font-size: 64px; line-height: 68px; font-weight: 700; letter-spacing: -0.035em; color: #0d0d0d",
					)}
				>
					Hire a squad of AI agents to run your business
				</h1>
				<p style={css("margin: 0; max-width: 620px; font-size: 19px; line-height: 28px; color: #5d5d5d")}>
					Orders, support, marketing, finance and stock, each handled by its own agent. One master keeps them in
					sync and only interrupts you when it matters.
				</p>
				<div
					style={css(
						"width: 100%; max-width: 760px; background: #fff; border-radius: 20px; box-shadow: 0 0 0 1px rgba(13,13,13,.1), 0 16px 48px rgba(13,13,13,.08); padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; text-align: left",
					)}
				>
					<div style={css("display: flex; gap: 8px; flex-wrap: wrap")}>
						{(
							[
								["new", "New business"],
								["existing", "Existing business"],
							] as const
						).map(([id, label]) => (
							<button
								key={id}
								type="button"
								data-handler="k.pick"
								aria-pressed={kind === id}
								onClick={() => onKind(id)}
								style={css(chip(kind === id))}
							>
								{label}
							</button>
						))}
					</div>
					<label
						htmlFor="hero-prompt"
						style={css("position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)")}
					>
						Describe your business
					</label>
					<textarea
						id="hero-prompt"
						rows={3}
						placeholder={placeholderFor(kind)}
						value={draft}
						data-handler="onDraft"
						onChange={(event) => onDraft(event.target.value)}
						style={css(
							"width: 100%; box-sizing: border-box; border: 0; padding: 4px 4px 0; background: transparent; font-family: inherit; font-size: 17px; line-height: 26px; color: #0d0d0d; resize: none",
						)}
					/>
					<div
						style={css(
							"display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px solid rgba(13,13,13,.06); padding-top: 12px",
						)}
					>
						<div style={css("display: flex; gap: 6px; flex-wrap: wrap")}>
							{examples.map((label) => (
								<button
									key={label}
									type="button"
									data-handler="ex.pick"
									onClick={() => onDraft(label)}
									style={css(
										"height: 30px; padding: 0 12px; border: 0; border-radius: 999px; background: rgba(13,13,13,.06); color: #414141; font-size: 12px; font-weight: 500",
									)}
								>
									{label}
								</button>
							))}
						</div>
						<a className="btn-dark" href="/signup" style={css("height: 42px; padding: 0 18px; font-size: 15px")}>
							Build my squad
							<Arrow />
						</a>
					</div>
				</div>
				<p data-design-contrast="home-trial-note" style={css("margin: 0; font-size: 13px; color: #8f8f8f")}>
					Free for 14 days · No credit card · Cancel from the dashboard
				</p>
			</section>
			<section
				aria-label="Customers"
				style={css("padding: 8px 24px 64px; display: flex; flex-direction: column; align-items: center; gap: 18px")}
			>
				<span
					data-design-contrast="home-logo-kicker"
					style={css(
						"font-size: 12px; font-weight: 500; color: #8f8f8f; text-transform: uppercase; letter-spacing: .08em",
					)}
				>
					Running the day-to-day at
				</span>
				<div style={css("display: flex; gap: 32px; flex-wrap: wrap; justify-content: center; align-items: center")}>
					{logos.map((name) => (
						<span
							key={name}
							data-design-contrast="home-logo-name"
							style={css("font-size: 16px; font-weight: 600; color: #8f8f8f; letter-spacing: -0.02em")}
						>
							{name}
						</span>
					))}
				</div>
			</section>
			<section aria-label="Product preview" style={css("padding: 0 24px 96px")}>
				<div
					style={css(
						"max-width: 1200px; margin: 0 auto; background: #181818; border-radius: 28px; padding: 24px 24px 0; box-sizing: border-box; overflow: hidden",
					)}
				>
					<div style={css("display: flex; align-items: center; gap: 6px; padding: 0 4px 16px")}>
						<span style={css("width: 10px; height: 10px; border-radius: 999px; background: #3a3a3a")} />
						<span style={css("width: 10px; height: 10px; border-radius: 999px; background: #3a3a3a")} />
						<span style={css("width: 10px; height: 10px; border-radius: 999px; background: #3a3a3a")} />
						<span
							style={css(
								"margin-left: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #8f8f8f",
							)}
						>
							app.tensquads.co / overview
						</span>
					</div>
					<div
						style={css(
							"background: #f3f3f3; border-radius: 16px 16px 0 0; padding: 8px; display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap",
						)}
					>
						<div
							style={css(
								"flex: 1 1 180px; max-width: 220px; display: flex; flex-direction: column; gap: 4px; padding: 10px 6px; font-size: 13px",
							)}
						>
							<div style={css("display: flex; align-items: center; gap: 8px; padding: 2px 8px 12px")}>
								<span
									style={css(
										"width: 26px; height: 26px; border-radius: 999px; background: #181818; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600",
									)}
								>
									M
								</span>
								<span style={css("font-weight: 600; color: #0d0d0d")}>Master</span>
							</div>
							<div
								style={css(
									"padding: 8px 10px; border-radius: 8px; background: rgba(13,13,13,.08); font-weight: 600; color: #0d0d0d",
								)}
							>
								Overview
							</div>
							<div style={css("padding: 8px 10px; color: #414141")}>Chat with the master</div>
							<div style={css("padding: 8px 10px; color: #414141")}>Agents</div>
							<div style={css("padding: 8px 10px; color: #414141")}>Agent traffic</div>
							<div style={css("padding: 8px 10px; color: #414141")}>Rules and limits</div>
						</div>
						<div
							style={css(
								"flex: 999 1 420px; min-width: 0; background: #fcfcfc; border-radius: 12px 12px 0 0; padding: 20px 22px 0; display: flex; flex-direction: column; gap: 16px",
							)}
						>
							<div
								style={css(
									"display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 8px",
								)}
							>
								<div>
									<div
										style={css("font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d")}
									>
										Good morning, Moe
									</div>
									<div style={css("font-size: 12px; color: #5d5d5d")}>
										Last 7 days across the store and your agents
									</div>
								</div>
								<span
									data-design-contrast="home-online-pill"
									style={css(
										"height: 22px; padding: 0 8px; border-radius: 999px; background: #04b84c14; color: #008635; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center",
									)}
								>
									4 of 5 agents online
								</span>
							</div>
							<div
								style={css(
									"display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px",
								)}
							>
								{previewKpis.map((item) => (
									<div
										key={item.label}
										style={css(
											"background: #fff; border-radius: 10px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 12px; display: flex; flex-direction: column; gap: 4px",
										)}
									>
										<span style={css("font-size: 11px; color: #5d5d5d")}>{item.label}</span>
										<span
											style={css(
												"font-size: 20px; line-height: 26px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
											)}
										>
											{item.value}
										</span>
										<span style={css("font-size: 11px; color: #00692a")}>{item.delta}</span>
									</div>
								))}
							</div>
							<div
								style={css(
									"display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px",
								)}
							>
								{homeAgents.map((agent) => (
									<div
										key={agent.name}
										style={css(
											"background: #fff; border-radius: 12px 12px 0 0; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 12px; display: flex; flex-direction: column; gap: 6px",
										)}
									>
										<div style={css("display: flex; gap: 8px; align-items: center")}>
											<span
												style={css(
													`width: 22px; height: 22px; border-radius: 6px; background: ${agent.tint}`,
												)}
											/>
											<span style={css("font-weight: 600; font-size: 13px; color: #0d0d0d")}>
												{agent.name}
											</span>
											<span
												style={css(
													`margin-left: auto; width: 8px; height: 8px; border-radius: 999px; background: ${agent.dot}`,
												)}
											/>
										</div>
										<span
											style={css(
												"font-size: 12px; color: #5d5d5d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis",
											)}
										>
											{agent.last}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
