import { Arrow, Mark } from "../marks.tsx";
import { type BusinessKind, examplesFor, homeAgents, logos, placeholderFor, previewKpis } from "./data.ts";
import { Mate } from "./Mate.tsx";

export function HomeHeader() {
	return (
		<header className="nav">
			<div className="nav-row">
				<a className="brand" href="/">
					<span className="mark">
						<Mark />
					</span>
					tensquads
				</a>
				<nav className="site-nav" aria-label="Site">
					<div className="nav-links">
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
					<div className="nav-actions">
						<a className="nav-link" href="/signin">
							Sign in
						</a>
						<a className="btn-dark" href="/signup">
							Start free
						</a>
					</div>
				</nav>
			</div>
		</header>
	);
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
			<section className="hero" aria-label="Hero">
				<div className="wrap">
					<span className="pill">
						<i />
						New: Analytics agent in beta
					</span>
					<h1>Hire a squad of AI agents to run your business</h1>
					<p className="lede">
						Orders, support, marketing, finance and stock, each handled by its own agent. One master keeps them in
						sync and only interrupts you when it matters.
					</p>
					<div className="line">
						<article className="swatch petra">
							<Mate id="master" state="idle" size={148} />
							<div>
								<b>Petra</b>
								<span className="role">Master</span>
							</div>
						</article>
						{homeAgents.map((agent) => (
							<article key={agent.id} className="swatch" style={{ background: agent.tint }}>
								<Mate id={agent.id} state={agent.draw} size={88} />
								<b>{agent.character}</b>
								<span className="role">{agent.name}</span>
								<span className="last">{agent.last}</span>
							</article>
						))}
						<article className="swatch" style={{ background: "#e7efff" }}>
							<Mate id="analytics" state="planning" size={88} />
							<b>Delphi</b>
							<span className="role">Analytics</span>
							<span className="last">New: Analytics agent in beta</span>
						</article>
					</div>
					<form
						className="brief"
						onSubmit={(event) => {
							event.preventDefault();
						}}
					>
						<div className="kinds">
							<button type="button" aria-pressed={kind === "new"} onClick={() => onKind("new")}>
								New business
							</button>
							<button type="button" aria-pressed={kind === "existing"} onClick={() => onKind("existing")}>
								Existing business
							</button>
						</div>
						<label className="sr" htmlFor="hero-prompt">
							Describe your business
						</label>
						<textarea
							id="hero-prompt"
							rows={3}
							placeholder={placeholderFor(kind)}
							value={draft}
							onChange={(event) => onDraft(event.target.value)}
						/>
						<div className="brief-bar">
							<div className="examples">
								{examples.map((label) => (
									<button key={label} type="button" onClick={() => onDraft(label)}>
										{label}
									</button>
								))}
							</div>
							<a className="btn-dark" href="/signup">
								Build my squad <Arrow />
							</a>
						</div>
					</form>
					<p className="trial" data-design-contrast="home-trial-note">
						Free for 14 days · No credit card · Cancel from the dashboard
					</p>
				</div>
			</section>
			<section className="stockists" aria-label="Customers">
				<div className="wrap">
					<p data-design-contrast="home-logo-kicker">Running the day-to-day at</p>
					<div>
						{logos.map((logo) => (
							<span key={logo} data-design-contrast="home-logo-name">
								{logo}
							</span>
						))}
					</div>
				</div>
			</section>
			<section className="section" aria-label="Product preview">
				<div className="wrap">
					<p className="host" data-design-contrast="home-preview-host">
						app.tensquads.co / overview
					</p>
					<div className="overview">
						<div className="side">
							<div className="side-who">
								<Mate id="master" state="idle" size={26} />
								<span>Petra</span>
								<span className="tag">Master</span>
							</div>
							<div className="side-on">Overview</div>
							<div className="item">Chat with the master</div>
							<div className="item">Agents</div>
							<div className="item">Agent traffic</div>
							<div className="item">Rules and limits</div>
						</div>
						<div className="overview-main">
							<div className="greet">
								<div>
									<b>Good morning, Moe</b>
									<span>Last 7 days across the store and your agents</span>
								</div>
								<span className="online" data-design-contrast="home-online-pill">
									4 of 5 agents online
								</span>
							</div>
							<div className="kpis">
								{previewKpis.map((kpi) => (
									<div key={kpi.label} className="kpi">
										<span>{kpi.label}</span>
										<b>{kpi.value}</b>
										<em>{kpi.delta}</em>
									</div>
								))}
							</div>
							<div className="minis">
								{homeAgents.map((agent) => (
									<div key={agent.id} className="mini">
										<Mate id={agent.id} state={agent.draw} size={28} />
										<span className="mini-name">{agent.character}</span>
										<span className="tag">{agent.name}</span>
										<span className="mini-last">{agent.last}</span>
										<span className="dot" style={{ background: agent.dot }} />
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
