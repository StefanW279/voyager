import { Env } from "./index.js";
import notify from "./routes/notify.js";
import {
	config,
	register,
	unregister,
	options,
} from "./routes/webpush.js";

export default {
	async fetch(
		request: Request,
		env: Env,
	): Promise<Response> {
		const url = new URL(request.url);

		if (
			request.method === "POST" &&
			url.pathname === "/_matrix/push/v1/notify"
		) {
			const result = await notify.notify(
				request,
				env,
			);

			return new Response(
				JSON.stringify(result ?? {}),
				{
					status: 200,
					headers: {
						"content-type":
							"application/json",
					},
				},
			);
		}

		if (
			request.method === "GET" &&
			url.pathname === "/api/webpush/config"
		) {
			return config(request, env);
		}

		if (
			request.method === "OPTIONS" &&
			url.pathname === "/api/webpush/register"
		) {
			return options(request, env);
		}

		if (
			request.method === "POST" &&
			url.pathname === "/api/webpush/register"
		) {
			return register(request, env);
		}

		if (
			request.method === "OPTIONS" &&
			url.pathname.startsWith(
				"/api/webpush/register/",
			)
		) {
			return options(request, env);
		}

		if (
			request.method === "DELETE" &&
			url.pathname.startsWith(
				"/api/webpush/register/",
			)
		) {
			const pushkey = decodeURIComponent(
				url.pathname.substring(
					"/api/webpush/register/".length,
				),
			);

			return unregister(
				request,
				env,
				pushkey,
			);
		}

		if (
			request.method === "GET" &&
			url.pathname === "/health"
		) {
			return new Response("ok", {
				status: 200,
			});
		}

		return new Response("Not found", {
			status: 404,
		});
	},
};