import { build } from "esbuild";
export const bundle = await build({
	stdin: {
		contents: `import React from "react"; import { createRoot } from "react-dom/client";
		import { HomePage } from "./apps/web/src/screens/home/HomePage.tsx";
		import { SignupPage } from "./apps/web/src/screens/signup/SignupPage.tsx";
		import { SignInPage } from "./apps/web/src/screens/signin/SignInPage.tsx";
		createRoot(document.getElementById("root")).render(React.createElement(({Home: HomePage, SignIn: SignInPage, Onboarding: SignupPage})[window.screenName], {publishableKey: ""}));`,
		resolveDir: process.cwd(),
		loader: "tsx",
	},
	bundle: true,
	loader: { ".css": "empty", ".woff2": "empty" },
	write: false,
	format: "iife",
	jsx: "automatic",
	plugins: [
		{
			name: "signin-boundaries",
			setup(build) {
				build.onResolve(
					{
						filter:
							/^(@clerk\/tanstack-react-start|@tanstack\/react-router|#\/server\/create-account.ts|#\/server\/admin.ts)$/,
					},
					(args) => ({ path: args.path, namespace: "boundary" }),
				);
				build.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
					contents: path.startsWith("@clerk")
						? "export const useSignIn = () => ({signIn: {}}); export const useSignUp = () => ({signUp: {}}); export const useClerk = () => ({ user: null });"
						: path.endsWith("admin.ts")
							? "export const platformOrgId = async () => '';"
							: path.startsWith("#")
								? "export const createAccount = async () => {};"
								: "export const useNavigate = () => () => {};",
				}));
			},
		},
	],
});
