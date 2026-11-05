import { Check } from "../marks.tsx";
import { castMates, controls, homeAgents, plans, steps } from "./data.ts";
import { Mate } from "./Mate.tsx";

export function HomeRest() {
	return (
		<>
			<section className="section" id="squad" aria-label="The agents">
				<div className="wrap">
					<span className="caption">Meet the squad</span>
					<h2>One agent for every part of the business</h2>
					<p className="lede">
						Each agent runs on its own isolated machine with only the connections it needs. Start with one, add
						the rest when you are ready.
					</p>
					<ul className="roster">
						{homeAgents.map((agent) => (
							<li key={agent.id} className="roster-row">
								<Mate id={agent.id} state={agent.draw} size={72} />
								<div className="roster-copy">
									<div className="who">
										<b>{agent.character}</b>
										<span className="tag">{agent.name}</span>
									</div>
									<div className="sub">{agent.role}</div>
									<p>{agent.pitch}</p>
									<div className="tools">
										{agent.tools.map((tool) => (
											<span key={tool}>{tool}</span>
										))}
									</div>
								</div>
							</li>
						))}
						<li className="more">
							<Mate id="analytics" state="planning" size={72} />
							<div>
								<b>More on the way</b>
								<span>Analytics is in beta. People and Legal are next.</span>
							</div>
						</li>
					</ul>
				</div>
			</section>
			<section className="how" id="how" aria-label="How it works">
				<div className="wrap">
					<div>
						<span className="caption">How it works</span>
						<h2>Set up in an afternoon, not a quarter</h2>
					</div>
					<ol className="steps">
						{steps.map((step) => (
							<li key={step.n}>
								<span className="num">{step.n}</span>
								<h3>{step.title}</h3>
								<p>{step.body}</p>
							</li>
						))}
					</ol>
				</div>
			</section>
			<section className="section" id="control" aria-label="You stay in control">
				<div className="wrap control">
					<div>
						<span className="caption">You stay in control</span>
						<h2>Agents work inside limits you set. Anything bigger, they ask.</h2>
						<ul className="rules">
							{controls.map((rule) => (
								<li key={rule.title}>
									<span className="tick" aria-hidden="true">
										<Check />
									</span>
									<span>
										<strong>{rule.title}</strong> {rule.body}
									</span>
								</li>
							))}
						</ul>
					</div>
					<div>
						<div className="sheet">
							<div className="sheet-top">
								<span>Needs your approval</span>
								<span className="count">2</span>
							</div>
							<div className="ask">
								<div className="ask-who">
									<Mate id="marketing" state="escalated" size={22} />
									<span>Marketing agent</span>
									<b>$60 / day</b>
								</div>
								<h3>Raise the prints ad set from $40 to $60 a day</h3>
								<p>Return has been above 3× for 7 days. Over your $50 daily cap.</p>
								<div className="ask-actions">
									<button type="button" className="btn-dark">
										Approve
									</button>
									<button type="button" className="btn-soft">
										Decline
									</button>
								</div>
							</div>
							<div className="ask">
								<div className="ask-who">
									<Mate id="support" state="done" size={22} />
									<span>Support agent</span>
									<b>$42</b>
								</div>
								<h3>Refund #A-1012, print arrived creased</h3>
								<p>Under your limit, but this customer's second refund this month.</p>
							</div>
						</div>
						<div className="limits">
							<div>
								<span>Refund without asking, up to</span>
								<b>$50</b>
							</div>
							<div>
								<span>Ad spend per day</span>
								<b>$50</b>
							</div>
							<div>
								<span>Reorder without asking, up to</span>
								<b>$500</b>
							</div>
						</div>
					</div>
				</div>
			</section>
			<section className="section" id="pricing" aria-label="Pricing">
				<div className="wrap pricing">
					<div>
						<span className="caption">Pricing</span>
						<h2>Pay for the squad, not per seat</h2>
						<p className="lede">
							Every plan includes the master, the chat and the approval inbox. Plans differ in how many agents
							you can run and how much they can do without asking.
						</p>
					</div>
					<div className="plans">
						{plans.map((plan) => (
							<article key={plan.name} className={plan.dark ? "plan plan-dark" : "plan"}>
								<div className="plan-top">
									<b>{plan.name}</b>
									{plan.popular ? <span className="pop">Most popular</span> : null}
								</div>
								<div className="price">
									<span>{plan.price}</span>
									<small> / month</small>
								</div>
								<p>{plan.who}</p>
								<ul>
									{plan.features.map((feature) => (
										<li key={feature}>
											<Check size={14} />
											<span>{feature}</span>
										</li>
									))}
								</ul>
								<a className={plan.dark ? "btn-light" : "btn-soft"} href="/signup">
									{plan.cta}
								</a>
							</article>
						))}
					</div>
					<p className="fine" data-design-contrast="home-pricing-note">
						All plans start with 14 days free. Prices in USD, billed monthly. [VAT NOTE]
					</p>
				</div>
			</section>
			<section className="close" aria-label="Get started">
				<div className="wrap">
					<h2>Your first agent can be working by tonight</h2>
					<p>Tell us about your business, pick a squad, set the limits. The master takes it from there.</p>
					<div className="close-actions">
						<a className="btn-light" href="/signup">
							Start free
						</a>
						<a className="btn-ghost" href="/chat">
							See a live demo
						</a>
					</div>
					<div className="cast" aria-hidden="true">
						{castMates.map((id) => (
							<Mate key={id} id={id} size={40} />
						))}
					</div>
				</div>
			</section>
		</>
	);
}

export function HomeFooter() {
	return (
		<footer className="foot">
			<div className="wrap">
				<div className="foot-row">
					<div className="foot-brand">
						<b>
							<i />
							tensquads
						</b>
						<span>A squad of AI agents for small businesses that sell things.</span>
					</div>
					<div className="cols">
						<div>
							<strong>Product</strong>
							<a href="#squad">Agents</a>
							<a href="#how">How it works</a>
							<a href="#pricing">Pricing</a>
							<a href="/signup">Start free</a>
						</div>
						<div>
							<strong>Company</strong>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">About</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Blog</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Careers</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Contact</a>
						</div>
						<div>
							<strong>Legal</strong>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Terms</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Privacy</a>
							{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
							<a href="#">Security</a>
						</div>
					</div>
				</div>
				<p className="legal" data-design-contrast="home-footer-line">
					© 2026 [COMPANY LEGAL NAME]. All rights reserved.
				</p>
			</div>
		</footer>
	);
}
