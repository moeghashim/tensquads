import { controls, finalLineup, limits, nameOf, plans, squadAgents, steps } from "./data.ts";
import { CheckV2, MateV2 } from "./MateV2.tsx";

export function HomeV2Rest() {
	return (
		<>
			<section id="agents">
				<h2>One agent for every part of the business</h2>
				<p className="lede">
					Each agent runs on its own isolated machine with only the connections it needs. Start with one, add the
					rest when you are ready.
				</p>
				<div className="shot">
					<div className="bar3">
						<i />
						<i />
						<i />
						<span>app.10squads.com / overview</span>
					</div>
					<img
						src="home-dashboard.jpg"
						alt="The tensquads Overview: revenue, orders, tasks done by the squad, and the approvals waiting for you"
						width="1440"
						height="900"
					/>
				</div>
				{/* biome-ignore lint/a11y/useSemanticElements: The design uses div role="list" for the squadmates grid. */}
				<div className="mates" role="list">
					{squadAgents.map((agent) => {
						const tipId = `tip-${agent.id}`;
						const charName = nameOf(agent.id);
						return (
							// biome-ignore lint/a11y/useSemanticElements: The design uses div role="listitem" with tabindex="0".
							// biome-ignore lint/a11y/noNoninteractiveTabindex: Each squadmate is keyboard-focusable to reveal its tooltip.
							<div key={agent.id} className="m" role="listitem" tabIndex={0} aria-describedby={tipId}>
								<MateV2 id={agent.id} state={agent.draw} size={56} />
								<b>{charName}</b>
								<span className="tag">{agent.tag}</span>
								<div className="tip" role="tooltip" id={tipId}>
									<div className="top">
										<MateV2 id={agent.id} state="running" size={40} />
										<span>
											<b>
												{charName} <span className="tag">{agent.tag}</span>
											</b>
											<small>{agent.role}</small>
										</span>
										<span className="dot" style={{ background: agent.dot }} />
									</div>
									<div className="last">{agent.last}</div>
									<p>{agent.pitch}</p>
									<div className="tools">
										{agent.tools.map((tool) => (
											<span key={tool} className="chip">
												{tool}
											</span>
										))}
									</div>
								</div>
							</div>
						);
					})}
					{/* biome-ignore lint/a11y/useSemanticElements: The design uses div role="listitem". */}
					<div className="m more" role="listitem">
						<MateV2 id="analytics" state="planning" size={56} />
						<b>More on the way</b>
						<span className="tag">Analytics is in beta. People and Legal are next.</span>
					</div>
				</div>
				<p className="hint">Hover or tap a squadmate to see what it does.</p>
			</section>

			<section id="how">
				<h2>Set up in an afternoon, not a quarter</h2>
				<div className="how">
					{steps.map((step) => (
						<div key={step.n} className="s">
							<span className="n">{step.n}</span>
							<span className="who">
								<MateV2 id={step.who} state="running" size={44} />
							</span>
							<h3>{step.title}</h3>
							<p>{step.body}</p>
						</div>
					))}
				</div>
			</section>

			<section id="control">
				<div className="ctl">
					<div>
						<h2>You stay in control</h2>
						<p className="lede">Agents work inside limits you set. Anything bigger, they ask.</p>
						<div className="list" style={{ marginTop: 32 }}>
							{controls.map((rule) => (
								<div key={rule.title}>
									<i>
										<CheckV2 />
									</i>
									<p>
										<b>{rule.title}</b> {rule.body}
									</p>
								</div>
							))}
						</div>
					</div>
					<div
						className="panel"
						ref={(panel) => {
							if (!panel) return;
							const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
							if (calm || !("IntersectionObserver" in window)) return;
							panel.classList.add("pre");
							const observer = new IntersectionObserver(
								(entries, obs) => {
									if (entries[0]?.isIntersecting) {
										requestAnimationFrame(() => {
											panel.classList.remove("pre");
											panel.classList.add("fill");
										});
										obs.disconnect();
									}
								},
								{ threshold: 0.4 },
							);
							observer.observe(panel);
							return () => {
								observer.disconnect();
							};
						}}
					>
						<div className="ph">
							<MateV2 id="master" state="idle" size={32} />
							<b>{nameOf("master")}</b>
							<span className="tag">Your limits</span>
						</div>
						{limits.map((lim) => (
							<div key={lim.label} className="lim">
								<div className="lt">
									<span>{lim.label}</span>
									<b>{lim.amount}</b>
								</div>
								<div className="bar">
									<span style={{ width: lim.width }} />
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<section id="pricing">
				<h2>Pay for the squad, not per seat</h2>
				<p className="lede">
					Every plan includes {nameOf("master")}, the chat and the approval inbox. Plans differ in how many agents
					you can run and how much they can do without asking.
				</p>
				<div className="plans">
					{plans.map((plan) => (
						<div key={plan.name} className={plan.dark ? "p dark" : "p"}>
							<div className="nm">
								{plan.name}
								{plan.popular ? <span className="pop">Most popular</span> : null}
							</div>
							<div className="pr">
								{plan.price} <small>/ month</small>
							</div>
							<p className="who">{plan.who}</p>
							<ul>
								{plan.features.map((feature) => (
									<li key={feature}>{feature}</li>
								))}
							</ul>
							<a className={plan.dark ? "btn" : "btn soft"} href="/signup">
								{plan.cta}
							</a>
						</div>
					))}
				</div>
				<p className="note">All plans start with 14 days free. Prices in USD, billed monthly. [VAT NOTE]</p>
			</section>

			<div className="final">
				<h2>Your first agent can be working by tonight</h2>
				<p className="lede">
					Tell us about your business, pick a squad, set the limits. {nameOf("master")} takes it from there.
				</p>
				<div className="row">
					<a className="btn lg" href="/signup">
						Start free
					</a>
					{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
					<a className="btn lg soft" href="#">
						See a live demo
					</a>
				</div>
				<div className="line">
					{finalLineup.map((item) => (
						<div key={item.id}>
							<MateV2 id={item.id} state={item.state} size={item.size} />
							{nameOf(item.id)}
						</div>
					))}
				</div>
			</div>

			<footer>
				<div className="ft">
					<div>
						{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
						<a className="brand" href="#">
							<MateV2 id="master" state="idle" size={28} /> tensquads
						</a>
						<p>A squad of AI agents for small businesses that sell things.</p>
					</div>
					<div>
						<h4>Product</h4>
						<a href="#agents">Agents</a>
						<a href="#how">How it works</a>
						<a href="#pricing">Pricing</a>
						<a href="/signup">Start free</a>
					</div>
					<div>
						<h4>Company</h4>
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
						<h4>Legal</h4>
						{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
						<a href="#">Terms</a>
						{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
						<a href="#">Privacy</a>
						{/* biome-ignore lint/a11y/useValidAnchor: The design keeps this link as #. */}
						<a href="#">Security</a>
					</div>
				</div>
				<div className="cr">© 2026 [COMPANY LEGAL NAME]. All rights reserved.</div>
			</footer>
		</>
	);
}
