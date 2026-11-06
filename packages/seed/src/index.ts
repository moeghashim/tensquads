export { replaceDemoAccount } from "./demo-account.ts";
export { design } from "./design-file.ts";
export { homepageAgents } from "./homepage.ts";
// proof.ts imports the agent kit. Keep that file off this entry so a Worker import does not load it.
export { defaultAgents, signupAgents } from "./signup.ts";
export { demoData, workspaceFromDesign } from "./workspace.ts";
