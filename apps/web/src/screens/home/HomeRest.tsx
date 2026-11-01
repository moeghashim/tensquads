import type { ReactNode } from "react";
import { css } from "../css.ts";
import { Check } from "../marks.tsx";
import { controls, homeAgents, plans, steps } from "./data.ts";

function planStyle(dark: boolean): string {
	return `border-radius: 20px; padding: 28px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px; min-height: 100%; ${dark ? "background: #181818; color: #fff" : "background: #fff; color: #0d0d0d; box-shadow: 0 0 0 1px rgba(13,13,13,.08)"}`;
}

export function HomeRest() {
	return (
		<>
			<section id="squad" aria-label="The agents" style={css("padding: 0 24px 96px")}>
				<div style={css("max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px")}>
					<SectionHeading kicker="Meet the squad" title="One agent for every part of the business">
						Each agent runs on its own isolated machine with only the connections it needs. Start with one, add
						the rest when you are ready.
					</SectionHeading>
					<div
						data-loop="agents"
						data-loop-as="a"
						style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px")}
					>
						{homeAgents.map((agent, index) => (
							<div
								key={agent.name}
								className="card"
								style={css(
									"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 12px",
								)}
							>
								<span
									style={css(
										`width: 40px; height: 40px; border-radius: 10px; background: ${agent.tint}; display: inline-flex; align-items: center; justify-content: center`,
									)}
								>
									<svg
										width="20"
										height="20"
										viewBox="0 0 16 16"
										fill="none"
										stroke="#0d0d0d"
										strokeWidth="1.5"
										strokeLinecap="round"
										aria-hidden="true"
									>
										<rect x="3" y="5" width="10" height="8" rx="2" />
										<path d="M8 2.5V5M6 9h0M10 9h0" />
									</svg>
								</span>
								<div>
									<div style={css("font-size: 17px; font-weight: 600; color: #0d0d0d")}>{agent.name}</div>
									<div style={css("font-size: 13px; color: #5d5d5d")}>{agent.role}</div>
								</div>
								<p style={css("margin: 0; font-size: 14px; line-height: 21px; color: #414141")}>
									{agent.pitch}
								</p>
								<div
									data-loop={index === 0 ? "a.tools" : undefined}
									data-loop-as={index === 0 ? "t" : undefined}
									style={css("display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto")}
								>
									{agent.tools.map((tool) => (
										<span
											key={tool}
											style={css(
												"height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(13,13,13,.06); font-family: 'JetBrains Mono', monospace; font-size: 11px; display: inline-flex; align-items: center; color: #414141",
											)}
										>
											{tool}
										</span>
									))}
								</div>
							</div>
						))}
						<div
							className="card"
							style={css(
								"border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); border: 1px dashed rgba(13,13,13,.2); padding: 20px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; text-align: center; box-sizing: border-box",
							)}
						>
							<span style={css("font-size: 17px; font-weight: 600; color: #0d0d0d")}>More on the way</span>
							<span style={css("font-size: 13px; color: #5d5d5d")}>
								Analytics is in beta. People and Legal are next.
							</span>
						</div>
					</div>
				</div>
			</section>
			<section id="how" aria-label="How it works" style={css("padding: 0 24px 96px")}>
				<div
					style={css(
						"max-width: 1200px; margin: 0 auto; background: #f3f3f3; border-radius: 28px; padding: 56px 48px; box-sizing: border-box; display: flex; flex-direction: column; gap: 40px",
					)}
				>
					<div style={css("max-width: 640px")}>
						<span style={css("font-size: 13px; font-weight: 600; color: #0169cc")}>How it works</span>
						<h2
							style={css(
								"margin: 8px 0 0; font-size: 40px; line-height: 46px; font-weight: 700; letter-spacing: -0.03em; color: #0d0d0d",
							)}
						>
							Set up in an afternoon, not a quarter
						</h2>
					</div>
					<ol
						data-loop="steps"
						data-loop-as="st"
						style={css(
							"margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px",
						)}
					>
						{steps.map((step) => (
							<li key={step.n} style={css("display: flex; flex-direction: column; gap: 12px")}>
								<span
									style={css(
										"width: 36px; height: 36px; border-radius: 999px; background: #181818; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px",
									)}
								>
									{step.n}
								</span>
								<span style={css("font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d")}>
									{step.title}
								</span>
								<span style={css("font-size: 15px; line-height: 23px; color: #5d5d5d")}>{step.body}</span>
							</li>
						))}
					</ol>
				</div>
			</section>
			<section id="control" aria-label="You stay in control" style={css("padding: 0 24px 96px")}>
				<div
					style={css(
						"max-width: 1200px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 48px; align-items: center",
					)}
				>
					<div style={css("flex: 1 1 360px; display: flex; flex-direction: column; gap: 20px")}>
						<span style={css("font-size: 13px; font-weight: 600; color: #0169cc")}>You stay in control</span>
						<h2
							style={css(
								"margin: 0; font-size: 40px; line-height: 46px; font-weight: 700; letter-spacing: -0.03em; color: #0d0d0d",
							)}
						>
							Agents work inside limits you set. Anything bigger, they ask.
						</h2>
						<ul
							data-loop="controls"
							data-loop-as="c"
							style={css(
								"margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 14px",
							)}
						>
							{controls.map((item) => (
								<li key={item.title} style={css("display: flex; gap: 12px; align-items: flex-start")}>
									<span
										style={css(
											"width: 22px; height: 22px; border-radius: 999px; background: #04b84c14; color: #00692a; display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px",
										)}
									>
										<Check />
									</span>
									<span style={css("font-size: 16px; line-height: 24px; color: #282828")}>
										<strong style={css("color: #0d0d0d")}>{item.title}</strong> {item.body}
									</span>
								</li>
							))}
						</ul>
					</div>
					<div style={css("flex: 1 1 360px; display: flex; flex-direction: column; gap: 12px")}>
						<div
							style={css(
								"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08), 0 16px 48px rgba(13,13,13,.06); padding: 20px; display: flex; flex-direction: column; gap: 12px",
							)}
						>
							<div style={css("display: flex; justify-content: space-between; align-items: center")}>
								<span style={css("font-weight: 600; color: #0d0d0d")}>Needs your approval</span>
								<span
									style={css(
										"min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: #fb6a2212; color: #923b0f; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center",
									)}
								>
									2
								</span>
							</div>
							<div
								style={css(
									"border-radius: 12px; background: #f9f9f9; padding: 12px; display: flex; flex-direction: column; gap: 8px",
								)}
							>
								<div
									style={css("display: flex; gap: 8px; align-items: center; font-size: 12px; color: #5d5d5d")}
								>
									<span style={css("width: 18px; height: 18px; border-radius: 5px; background: #ece3ff")} />
									Marketing agent
									<span style={css("margin-left: auto; font-weight: 600; color: #0d0d0d; font-size: 14px")}>
										$60 / day
									</span>
								</div>
								<div style={css("font-weight: 500; color: #0d0d0d")}>
									Raise the prints ad set from $40 to $60 a day
								</div>
								<div style={css("font-size: 13px; color: #5d5d5d")}>
									Return has been above 3× for 7 days. Over your $50 daily cap.
								</div>
								<div style={css("display: flex; gap: 8px")}>
									<span className="btn-dark" style={css("height: 30px; padding: 0 12px; font-size: 13px")}>
										Approve
									</span>
									<span className="btn-soft" style={css("height: 30px; padding: 0 12px; font-size: 13px")}>
										Decline
									</span>
								</div>
							</div>
							<div
								style={css(
									"border-radius: 12px; background: #f9f9f9; padding: 12px; display: flex; flex-direction: column; gap: 8px",
								)}
							>
								<div
									style={css("display: flex; gap: 8px; align-items: center; font-size: 12px; color: #5d5d5d")}
								>
									<span style={css("width: 18px; height: 18px; border-radius: 5px; background: #def5ee")} />
									Support agent
									<span style={css("margin-left: auto; font-weight: 600; color: #0d0d0d; font-size: 14px")}>
										$42
									</span>
								</div>
								<div style={css("font-weight: 500; color: #0d0d0d")}>Refund #A-1012, print arrived creased</div>
								<div style={css("font-size: 13px; color: #5d5d5d")}>
									Under your limit, but this customer's second refund this month.
								</div>
							</div>
						</div>
						<div style={css("display: flex; gap: 12px; flex-wrap: wrap")}>
							<div
								style={css(
									"flex: 1 1 140px; background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 12px; display: flex; flex-direction: column; gap: 4px",
								)}
							>
								<span style={css("font-size: 12px; color: #5d5d5d")}>Refund without asking, up to</span>
								<span style={css("font-size: 18px; font-weight: 600; color: #0d0d0d")}>$50</span>
							</div>
							<div
								style={css(
									"flex: 1 1 140px; background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 12px; display: flex; flex-direction: column; gap: 4px",
								)}
							>
								<span style={css("font-size: 12px; color: #5d5d5d")}>Ad spend per day</span>
								<span style={css("font-size: 18px; font-weight: 600; color: #0d0d0d")}>$50</span>
							</div>
							<div
								style={css(
									"flex: 1 1 140px; background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 12px; display: flex; flex-direction: column; gap: 4px",
								)}
							>
								<span style={css("font-size: 12px; color: #5d5d5d")}>Reorder without asking, up to</span>
								<span style={css("font-size: 18px; font-weight: 600; color: #0d0d0d")}>$500</span>
							</div>
						</div>
					</div>
				</div>
			</section>
			<section id="pricing" aria-label="Pricing" style={css("padding: 0 24px 96px")}>
				<div
					style={css(
						"max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; align-items: center; text-align: center",
					)}
				>
					<SectionHeading kicker="Pricing" title="Pay for the squad, not per seat">
						Every plan includes the master, the chat and the approval inbox. Plans differ in how many agents you
						can run and how much they can do without asking.
					</SectionHeading>
					<div
						data-loop="plans"
						data-loop-as="p"
						style={css(
							"width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; text-align: left",
						)}
					>
						{plans.map((plan, index) => (
							<div key={plan.name} style={css(planStyle(plan.dark))}>
								<div style={css("display: flex; justify-content: space-between; align-items: center")}>
									<span style={css("font-size: 17px; font-weight: 600")}>{plan.name}</span>
									{plan.popular ? (
										<span
											data-if="p.popular"
											style={css(
												"height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(255,255,255,.14); font-size: 12px; font-weight: 500; display: inline-flex; align-items: center",
											)}
										>
											Most popular
										</span>
									) : null}
								</div>
								<div>
									<span
										style={css(
											"font-size: 40px; line-height: 44px; font-weight: 700; letter-spacing: -0.03em",
										)}
									>
										{plan.price}
									</span>
									<span style={css("font-size: 14px; opacity: .7")}> / month</span>
								</div>
								<p style={css("margin: 0; font-size: 14px; line-height: 21px; opacity: .75")}>{plan.who}</p>
								<PlanFeatures features={plan.features} index={index} />
								<a
									href="/signup"
									className={plan.dark ? "btn-dark" : "btn-soft"}
									style={css("height: 42px; padding: 0 18px; font-size: 14px; margin-top: auto")}
								>
									{plan.cta}
								</a>
							</div>
						))}
					</div>
					<p data-design-contrast="home-pricing-note" style={css("margin: 0; font-size: 13px; color: #8f8f8f")}>
						All plans start with 14 days free. Prices in USD, billed monthly. [VAT NOTE]
					</p>
				</div>
			</section>
			<section aria-label="Get started" style={css("padding: 0 24px 96px")}>
				<div
					style={css(
						"max-width: 1200px; margin: 0 auto; background: #181818; color: #fff; border-radius: 28px; padding: 64px 48px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 20px",
					)}
				>
					<h2
						style={css(
							"margin: 0; max-width: 700px; font-size: 44px; line-height: 50px; font-weight: 700; letter-spacing: -0.03em",
						)}
					>
						Your first agent can be working by tonight
					</h2>
					<p style={css("margin: 0; max-width: 540px; font-size: 17px; line-height: 26px; color: #c9c9c9")}>
						Tell us about your business, pick a squad, set the limits. The master takes it from there.
					</p>
					<div style={css("display: flex; gap: 10px; flex-wrap: wrap; justify-content: center")}>
						<a
							href="/signup"
							style={css(
								"height: 46px; padding: 0 22px; border-radius: 999px; background: #fff; color: #0d0d0d; font-size: 15px; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center",
							)}
						>
							Start free
						</a>
						<a
							href="/chat"
							style={css(
								"height: 46px; padding: 0 22px; border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; font-size: 15px; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center",
							)}
						>
							See a live demo
						</a>
					</div>
				</div>
			</section>
			<footer className="foot" style={css("border-top: 1px solid rgba(13,13,13,.06); padding: 40px 24px 32px")}>
				<div
					style={css(
						"max-width: 1200px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 32px; justify-content: space-between",
					)}
				>
					<div style={css("display: flex; flex-direction: column; gap: 10px; max-width: 260px")}>
						<span style={css("display: flex; align-items: center; gap: 8px; font-weight: 600; color: #0d0d0d")}>
							<span
								style={css(
									"width: 24px; height: 24px; border-radius: 6px; background: #181818; display: inline-block",
								)}
							/>
							tensquads
						</span>
						<span style={css("font-size: 13px; color: #5d5d5d")}>
							A squad of AI agents for small businesses that sell things.
						</span>
					</div>
					<div style={css("display: flex; gap: 48px; flex-wrap: wrap")}>
						<div style={css("display: flex; flex-direction: column; gap: 8px")}>
							<span style={css("font-size: 12px; font-weight: 600; color: #0d0d0d")}>Product</span>
							<a href="#squad">Agents</a>
							<a href="#how">How it works</a>
							<a href="#pricing">Pricing</a>
							<a href="/signup">Start free</a>
						</div>
						<div style={css("display: flex; flex-direction: column; gap: 8px")}>
							<span style={css("font-size: 12px; font-weight: 600; color: #0d0d0d")}>Company</span>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">About</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Blog</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Careers</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Contact</a>
						</div>
						<div style={css("display: flex; flex-direction: column; gap: 8px")}>
							<span style={css("font-size: 12px; font-weight: 600; color: #0d0d0d")}>Legal</span>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Terms</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Privacy</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Security</a>
						</div>
					</div>
				</div>
				<div
					data-design-contrast="home-footer-line"
					style={css("max-width: 1200px; margin: 24px auto 0; font-size: 12px; color: #8f8f8f")}
				>
					© 2026 [COMPANY LEGAL NAME]. All rights reserved.
				</div>
			</footer>
		</>
	);
}

function SectionHeading({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
	return (
		<div style={css("max-width: 640px")}>
			<span style={css("font-size: 13px; font-weight: 600; color: #0169cc")}>{kicker}</span>
			<h2
				style={css(
					"margin: 8px 0 0; font-size: 40px; line-height: 46px; font-weight: 700; letter-spacing: -0.03em; color: #0d0d0d",
				)}
			>
				{title}
			</h2>
			<p style={css("margin: 12px 0 0; font-size: 17px; line-height: 26px; color: #5d5d5d")}>{children}</p>
		</div>
	);
}

function PlanFeatures({ features, index }: { features: readonly string[]; index: number }) {
	return (
		<ul
			data-loop={index === 0 ? "p.features" : undefined}
			data-loop-as={index === 0 ? "f" : undefined}
			style={css(
				"margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 14px",
			)}
		>
			{features.map((feature) => (
				<li key={feature} style={css("display: flex; gap: 8px; align-items: flex-start")}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
						style={css("flex: none; margin-top: 4px")}
					>
						<path d="M3 8.5 6.5 12 13 4.5" />
					</svg>
					<span>{feature}</span>
				</li>
			))}
		</ul>
	);
}
