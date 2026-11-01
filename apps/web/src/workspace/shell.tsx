import type { ReactNode } from "react";

import { css } from "#/screens/css.ts";

import { Dock } from "./dock.tsx";
import { Sidebar } from "./sidebar.tsx";
import "./workspace.css";

const page =
	"min-height: 100vh; box-sizing: border-box; background: #f3f3f3; color: #282828; font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 20px; letter-spacing: -0.01em; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; padding: 8px";
const main =
	"flex: 999 1 560px; min-width: 0; background: #fcfcfc; border: 0.5px solid #ededed; border-radius: 16px; box-sizing: border-box; padding: 28px 32px 40px; display: flex; flex-direction: column; gap: 24px; min-height: calc(100vh - 16px)";

export function WorkspaceShell({ children }: { readonly children: ReactNode }) {
	return (
		<div className="workspace-frame" style={css(page)}>
			<Sidebar />
			<main style={css(main)}>{children}</main>
			<Dock />
		</div>
	);
}
