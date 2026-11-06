import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { isHomeV2Request } from "./home-v2-host.ts";

export const getHomeV2 = createServerFn({ method: "GET" }).handler(() => {
	return isHomeV2Request(getRequest());
});
