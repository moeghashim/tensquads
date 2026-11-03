import { useUser } from "@clerk/tanstack-react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { companyInitials } from "@tensquads/domain";
import type { ReactNode } from "react";

import { css } from "#/screens/css.ts";
import { navStyle } from "#/workspace/styles.ts";
import "#/workspace/workspace.css";

import { BuildingIcon, CatalogIcon, CompaniesIcon } from "./icons.tsx";

const page =
	"min-height: 100vh; box-sizing: border-box; background: #f3f3f3; color: #282828; font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 20px; letter-spacing: -0.01em; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; padding: 8px";
const main =
	"flex: 999 1 560px; min-width: 0; background: #fcfcfc; border: 0.5px solid #ededed; border-radius: 16px; box-sizing: border-box; padding: 28px 32px 40px; display: flex; flex-direction: column; gap: 24px; min-height: calc(100vh - 16px)";
const nav =
	"flex: 1 1 220px; max-width: 260px; min-width: 200px; display: flex; flex-direction: column; gap: 4px; padding: 12px 8px";

export function AdminShell({ attention, children }: { readonly attention: number; readonly children: ReactNode }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const catalog = pathname.startsWith("/admin/images");
	const navigate = useNavigate();
	return (
		<div className="workspace-frame" style={css(page)}>
			<div data-if="isAdminArea" style={css("display: contents")}>
				<nav aria-label="Platform admin" style={css(nav)}>
					<div style={css("display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px")}>
						<div
							style={css(
								"width: 32px; height: 32px; border-radius: 8px; background: #181818; color: #fff; display: flex; align-items: center; justify-content: center",
							)}
						>
							<BuildingIcon />
						</div>
						<div style={css("display: flex; flex-direction: column")}>
							<span style={css("font-weight: 600; color: #0d0d0d")}>Platform admin</span>
							<span style={css("font-size: 12px; color: #5d5d5d")}>Your company account</span>
						</div>
					</div>
					<button
						type="button"
						className="nav-btn"
						data-handler="goAdmin"
						data-event="onClick"
						onClick={() => void navigate({ to: "/admin" })}
						style={css(navStyle(!catalog))}
					>
						<CompaniesIcon />
						Companies
					</button>
					<button
						type="button"
						className="nav-btn"
						data-handler="goCatalog"
						data-event="onClick"
						onClick={() => void navigate({ to: "/admin/images" })}
						style={css(navStyle(catalog))}
					>
						<CatalogIcon />
						<span style={css("flex: 1")}>Squad images</span>
						{attention > 0 ? (
							<div data-if="cat.hasAttention" style={css("display: contents")}>
								<span
									style={css(
										"min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #fa423e14; color: #911e1b; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center",
									)}
								>
									{attention}
								</span>
							</div>
						) : null}
					</button>
					<div style={css("margin-top: 20px; padding: 0 10px; font-size: 12px; font-weight: 500; color: #5d5d5d")}>
						Coming next
					</div>
					<div
						style={css(
							"padding: 6px 10px; font-size: 13px; color: #8f8f8f; display: flex; flex-direction: column; gap: 8px",
						)}
					>
						<span data-design-contrast="admin-coming-next">Usage and billing</span>
						<span data-design-contrast="admin-coming-next">Platform health</span>
						<span data-design-contrast="admin-coming-next">Admin users</span>
					</div>
					<AdminFooter />
				</nav>
			</div>
			<main style={css(main)}>{children}</main>
		</div>
	);
}

function AdminFooter() {
	const { isLoaded, user } = useUser();
	const name = isLoaded ? (user?.fullName ?? "") : "";
	return (
		<div style={css("margin-top: 20px; display: flex; align-items: center; gap: 10px; padding: 8px 10px")}>
			<div
				style={css(
					"width: 28px; height: 28px; border-radius: 999px; background: #dfdfdf; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600",
				)}
			>
				{companyInitials(name)}
			</div>
			<div style={css("display: flex; flex-direction: column")}>
				<span style={css("font-size: 14px")}>{name}</span>
				<span style={css("font-size: 12px; color: #5d5d5d")}>Super admin</span>
			</div>
		</div>
	);
}
