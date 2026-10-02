import { Router } from "itty-router";
import { Env } from "./index.js";
import notify from "./routes/notify.js";
import {
	config,
	register,
	unregister,
	options,
} from "./routes/webpush.js";

const router = Router();

router.post(
	"/_matrix/push/v1/notify",
	async (request: Request, env: Env) => {
		let result = await notify.notify(request, env);

		if (result == null) {
			result = {};
		}

		return new Response(
			JSON.stringify(result),
			{
				status: 200,
				headers: {
					"content-type":
						"application/json",
				},
			},
		);
	},
);

router.get(
	"/api/webpush/config",
	async (request: Request, env: Env) => {
		return config(request, env);
	},
);

router.options(
	"/api/webpush/register",
	async (request: Request, env: Env) => {
		return options(request, env);
	},
);

router.post(
	"/api/webpush/register",
	async (request: Request, env: Env) => {
		return register(request, env);
	},
);

router.options(
	"/api/webpush/register/:pushkey",
	async (request: Request, env: Env) => {
		return options(request, env);
	},
);

router.delete(
	"/api/webpush/register/:pushkey",
	async (request: Request, env: Env) => {
		const pushkey =
			(request as any).params?.pushkey;

		return unregister(
			request,
			env,
			pushkey,
		);
	},
);

router.get(
	"/health",
	async () => {
		return new Response("ok", {
			status: 200,
		});
	},
);

router.all(
	"*",
	() =>
		new Response("Not found", {
			status: 404,
		}),
);

export default router;