import type { Env } from "../index.js";
import {
	deleteSubscription,
	getPublicKey,
	registerSubscription,
} from "../web_push.js";

function allowedOrigin(
	request: Request,
	env: Env,
): string | null {
	const origin = request.headers.get("origin");

	if (origin == null) {
		return null;
	}

	const allowed = env.WEB_CLIENT_ORIGINS
		.split(",")
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	if (!allowed.includes(origin)) {
		return null;
	}

	return origin;
}

function json(
	value: unknown,
	status: number,
	origin?: string,
): Response {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"cache-control": "no-store",
	};

	if (origin != null) {
		headers["access-control-allow-origin"] = origin;
		headers["access-control-allow-methods"] =
			"GET, POST, DELETE, OPTIONS";
		headers["access-control-allow-headers"] =
			"Content-Type";
		headers["vary"] = "Origin";
	}

	return new Response(JSON.stringify(value), {
		status,
		headers,
	});
}

export async function config(
	request: Request,
	env: Env,
): Promise<Response> {
	const origin = allowedOrigin(request, env);

	if (origin == null) {
		return json({ error: "Origin not allowed" }, 403);
	}

	return json(
		{
			publicKey: getPublicKey(env),
		},
		200,
		origin,
	);
}

export async function register(
	request: Request,
	env: Env,
): Promise<Response> {
	const origin = allowedOrigin(request, env);

	if (origin == null) {
		return json({ error: "Origin not allowed" }, 403);
	}

	let body: any;

	try {
		body = await request.json();
	} catch {
		return json(
			{ error: "Invalid JSON" },
			400,
			origin,
		);
	}

	const endpoint = body?.endpoint;
	const p256dh = body?.keys?.p256dh;
	const auth = body?.keys?.auth;

	if (
		typeof endpoint !== "string" ||
		typeof p256dh !== "string" ||
		typeof auth !== "string"
	) {
		return json(
			{ error: "Invalid PushSubscription" },
			400,
			origin,
		);
	}

	if (!endpoint.startsWith("https://")) {
		return json(
			{ error: "Push endpoint must use HTTPS" },
			400,
			origin,
		);
	}

	if (
		endpoint.length > 4096 ||
		p256dh.length > 512 ||
		auth.length > 512
	) {
		return json(
			{ error: "PushSubscription too large" },
			400,
			origin,
		);
	}

	const pushkey = registerSubscription(
		env,
		endpoint,
		p256dh,
		auth,
	);

	return json(
		{ pushkey },
		200,
		origin,
	);
}

export async function unregister(
	request: Request,
	env: Env,
	pushkey: string,
): Promise<Response> {
	const origin = allowedOrigin(request, env);

	if (origin == null) {
		return json({ error: "Origin not allowed" }, 403);
	}

	deleteSubscription(env, pushkey);

	return json(
		{ success: true },
		200,
		origin,
	);
}

export function options(
	request: Request,
	env: Env,
): Response {
	const origin = allowedOrigin(request, env);

	if (origin == null) {
		return new Response(null, { status: 403 });
	}

	return new Response(null, {
		status: 204,
		headers: {
			"access-control-allow-origin": origin,
			"access-control-allow-methods":
				"GET, POST, DELETE, OPTIONS",
			"access-control-allow-headers":
				"Content-Type",
			"access-control-max-age": "86400",
			"vary": "Origin",
		},
	});
}