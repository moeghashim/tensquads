interface ClerkName {
	readonly firstName: string;
	readonly lastName: string;
}

export async function createClerkUser(
	secret: string,
	email: string,
	password: string,
	name?: ClerkName,
): Promise<string> {
	return clerkPostId(
		secret,
		"/users",
		clerkUserBody(email, password, name),
		"Clerk create user failed with status",
		"Clerk create user returned no id.",
	);
}

export async function clerkPostId(
	secret: string,
	path: string,
	body: unknown,
	failure: string,
	missing: string,
): Promise<string> {
	const response = await fetch(`https://api.clerk.com/v1${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${secret}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(`${failure} ${response.status}.`);
	}
	const parsed = (await response.json()) as { id?: string };
	if (!parsed.id) {
		throw new Error(missing);
	}
	return parsed.id;
}

function clerkUserBody(email: string, password: string, name: ClerkName | undefined) {
	const body: {
		email_address: string[];
		password: string;
		skip_password_checks: boolean;
		first_name?: string;
		last_name?: string;
	} = {
		email_address: [email],
		password,
		skip_password_checks: true,
	};
	if (!name) return body;
	return { ...body, first_name: name.firstName, last_name: name.lastName };
}
