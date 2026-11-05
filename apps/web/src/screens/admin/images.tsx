import { type AgentImage, type ImageFilter, INITIAL_IMAGE, imageCatalogView } from "@tensquads/domain";
import { useState } from "react";

import { AdminFilterButtons, AdminIntro, AdminKpiSection, adminPillRow, RightLabel } from "#/screens/admin/chrome.tsx";
import { css } from "#/screens/css.ts";
import { RoleTag, Squadmate } from "#/workspace/Squadmate.tsx";

const column = "display: flex; flex-direction: column; gap: 24px";
const attentionPill =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: #fa423e14; color: #911e1b; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center";
const split = "display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start";
const listCard =
	"flex: 3 1 420px; min-width: 0; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); display: flex; flex-direction: column";
const headRow =
	"display: grid; grid-template-columns: minmax(200px, 2fr) 90px 120px 90px 70px 80px 110px; gap: 12px; align-items: center; padding: 10px 20px; font-size: 12px; font-weight: 500; color: #5d5d5d; border-bottom: 1px solid rgba(13,13,13,.06)";
const detailCard =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 14px";
const panelCard =
	"background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 20px; display: flex; flex-direction: column; gap: 10px";
const mono = "font-family: 'JetBrains Mono', monospace";

export function ImagesScreen({ images }: { readonly images: readonly AgentImage[] }) {
	const [filter, setFilter] = useState<ImageFilter>("all");
	const [selectedId, setSelectedId] = useState(INITIAL_IMAGE);
	const view = imageCatalogView(images, filter, selectedId);
	const detail = view.detail;
	return (
		<div data-if="isCatalog" style={css("display: contents")}>
			<div style={css(column)}>
				<AdminIntro
					title="Squad images"
					detail="The squad templates companies can deploy. One image is one agent with its tools. Each image carries its version, open bugs and requested features. Figures are demo data."
					pill={{ text: `${view.attention} images need attention`, style: attentionPill }}
				/>
				<AdminKpiSection label="Image totals" loop="cat.kpis" kpis={view.kpis} />
				<div style={css(split)}>
					<section aria-label="Images" style={css(listCard)}>
						<div
							style={css(
								"display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(13,13,13,.06)",
							)}
						>
							<h2 style={css("margin: 0; font-size: 16px; font-weight: 600; color: #0d0d0d")}>
								All images <span style={css("font-weight: 400; color: #5d5d5d")}>({view.count})</span>
							</h2>
							<div style={css(adminPillRow)}>
								<div data-loop="cat.filters" data-loop-as="f" style={css("display: contents")}>
									<AdminFilterButtons filters={view.filters} onPick={setFilter} />
								</div>
							</div>
						</div>
						<div style={css("overflow-x: auto")}>
							<div style={css("min-width: 720px; display: flex; flex-direction: column")}>
								<div style={css(headRow)}>
									<span>Image</span>
									<span>Version</span>
									<span>Last updated</span>
									<RightLabel>Deployed</RightLabel>
									<RightLabel>Bugs</RightLabel>
									<RightLabel>Features</RightLabel>
									<span>Status</span>
								</div>
								<div data-loop="cat.rows" data-loop-as="r" style={css("display: contents")}>
									{view.rows.map((row) => (
										<button
											key={row.id}
											type="button"
											className="acct-row"
											data-handler="r.pick"
											data-event="onClick"
											aria-pressed={row.on ? "true" : "false"}
											onClick={() => setSelectedId(row.id)}
											style={css(row.rowStyle)}
										>
											<span style={css("display: flex; align-items: center; gap: 10px; min-width: 0")}>
												<span
													style={css(
														`width: 28px; height: 28px; border-radius: 8px; background: ${row.tint}; display: inline-flex; align-items: center; justify-content: center; flex: none`,
													)}
												>
													<Squadmate id={row.id} on size={16} decorative />
												</span>
												<span style={css("display: flex; flex-direction: column; min-width: 0")}>
													<span
														style={css(
															"font-weight: 600; color: #0d0d0d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis",
														)}
													>
														{row.name}
														<RoleTag id={row.id} />
													</span>
													<span
														style={css(
															`${mono}; font-size: 11px; color: #5d5d5d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`,
														)}
													>
														{row.tag}
													</span>
												</span>
											</span>
											<span style={css(`${mono}; font-size: 12px; color: #0d0d0d`)}>{row.version}</span>
											<span style={css("font-size: 13px; color: #5d5d5d")}>{row.updated}</span>
											<span style={css("text-align: right")}>{row.deployed}</span>
											<span style={css(`text-align: right; font-weight: 600; color: ${row.bugColor}`)}>
												{row.bugCount}
											</span>
											<span style={css("text-align: right; color: #282828")}>{row.featureCount}</span>
											<span>
												<span style={css(row.statusStyle)}>{row.status}</span>
											</span>
										</button>
									))}
								</div>
							</div>
						</div>
					</section>
					<aside
						aria-label="Image details"
						style={css("flex: 2 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 16px")}
					>
						<section style={css(detailCard)}>
							<div style={css("display: flex; gap: 12px; align-items: center")}>
								<span
									style={css(
										`width: 40px; height: 40px; border-radius: 10px; background: ${detail.tint}; display: inline-flex; align-items: center; justify-content: center; flex: none`,
									)}
								>
									<Squadmate id={detail.id} on size={20} />
								</span>
								<div style={css("display: flex; flex-direction: column; min-width: 0; flex: 1")}>
									<h2 style={css("margin: 0; font-size: 18px; font-weight: 600; color: #0d0d0d")}>
										{detail.name}
										<RoleTag id={detail.id} />
									</h2>
									<span style={css("font-size: 13px; color: #5d5d5d")}>{detail.role}</span>
								</div>
								<span style={css(detail.statusStyle)}>{detail.status}</span>
							</div>
							<dl
								style={css(
									"margin: 0; display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; font-size: 13px",
								)}
							>
								<dt style={css("color: #5d5d5d")}>Image</dt>
								<dd style={css(`margin: 0; ${mono}; font-size: 12px; color: #0d0d0d; word-break: break-all`)}>
									{detail.tag}
								</dd>
								<dt style={css("color: #5d5d5d")}>Version</dt>
								<dd style={css(`margin: 0; ${mono}; font-size: 12px; color: #0d0d0d`)}>{detail.version}</dd>
								<dt style={css("color: #5d5d5d")}>Last updated</dt>
								<dd style={css("margin: 0; color: #0d0d0d")}>{detail.updatedFull}</dd>
								<dt style={css("color: #5d5d5d")}>Deployed to</dt>
								<dd style={css("margin: 0; color: #0d0d0d")}>{detail.deployedFull}</dd>
								<dt style={css("color: #5d5d5d")}>On latest</dt>
								<dd style={css("margin: 0; color: #0d0d0d")}>{detail.onLatest}</dd>
							</dl>
							<div style={css("display: flex; gap: 8px; flex-wrap: wrap")}>
								<button
									type="button"
									style={css(
										"height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: #181818; color: #fff; font-size: 13px; font-weight: 500",
									)}
								>
									Roll out {detail.nextVersion}
								</button>
								<button
									type="button"
									className="soft-btn"
									style={css(
										"height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(13,13,13,.08); color: #282828; font-size: 13px; font-weight: 500",
									)}
								>
									View changelog
								</button>
							</div>
						</section>
						<section style={css(panelCard)}>
							<div style={css("display: flex; justify-content: space-between; align-items: center")}>
								<h3 style={css("margin: 0; font-size: 15px; font-weight: 600; color: #0d0d0d")}>Open bugs</h3>
								<span
									style={css(
										`min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: ${detail.bugBadgeBg}; color: ${detail.bugBadgeFg}; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center`,
									)}
								>
									{detail.bugCount}
								</span>
							</div>
							<div data-loop="img.bugs" data-loop-as="b" style={css("display: contents")}>
								{detail.bugs.map((bug) => (
									<div
										key={bug.id}
										style={css(
											"display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: #f9f9f9",
										)}
									>
										<span style={css(bug.sevStyle)}>{bug.sev}</span>
										<div
											style={css("display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1")}
										>
											<span style={css("font-weight: 500; color: #0d0d0d")}>{bug.title}</span>
											<span style={css("font-size: 12px; color: #5d5d5d")}>{bug.meta}</span>
										</div>
									</div>
								))}
							</div>
							{detail.noBugs ? (
								<div data-if="img.noBugs" style={css("display: contents")}>
									<div style={css("padding: 16px 8px; text-align: center; color: #5d5d5d; font-size: 13px")}>
										No open bugs on this version.
									</div>
								</div>
							) : null}
						</section>
						<section style={css(panelCard)}>
							<div style={css("display: flex; justify-content: space-between; align-items: center")}>
								<h3 style={css("margin: 0; font-size: 15px; font-weight: 600; color: #0d0d0d")}>
									Features to add
								</h3>
								<span
									style={css(
										"min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: #0285ff14; color: #004f99; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center",
									)}
								>
									{detail.featureCount}
								</span>
							</div>
							<div data-loop="img.features" data-loop-as="f" style={css("display: contents")}>
								{detail.features.map((feature) => (
									<div
										key={feature.id}
										style={css(
											"display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: #f9f9f9",
										)}
									>
										<div
											style={css("display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1")}
										>
											<span style={css("font-weight: 500; color: #0d0d0d")}>{feature.title}</span>
											<span style={css("font-size: 12px; color: #5d5d5d")}>{feature.meta}</span>
										</div>
										<span style={css(feature.stageStyle)}>{feature.stage}</span>
									</div>
								))}
							</div>
							{detail.noFeatures ? (
								<div data-if="img.noFeatures" style={css("display: contents")}>
									<div style={css("padding: 16px 8px; text-align: center; color: #5d5d5d; font-size: 13px")}>
										Nothing requested yet.
									</div>
								</div>
							) : null}
						</section>
					</aside>
				</div>
			</div>
		</div>
	);
}
