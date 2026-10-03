import http from "node:http";
import router from "./router.js";
import { configureWebPush } from "./web_push.js";

export interface Env {
	FIREBASE_KEY_B64: string;
	FCM_PROJECT_ID: string;

	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY: string;
	VAPID_SUBJECT: string;

	DATABASE_PATH: string;
	WEB_CLIENT_ORIGINS: string;

	PORT?: string;
}

const env: Env = {
	FIREBASE_KEY_B64: process.env.FIREBASE_KEY_B64 ?? "",
	FCM_PROJECT_ID: process.env.FCM_PROJECT_ID ?? "",

	VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "",
	VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
	VAPID_SUBJECT:
		process.env.VAPID_SUBJECT ?? "mailto:admin@kantengewichte.de",

	DATABASE_PATH:
		process.env.DATABASE_PATH ?? "/data/commet-push.sqlite",

	WEB_CLIENT_ORIGINS:
		process.env.WEB_CLIENT_ORIGINS ??
		"https://client.kantengewichte.de",

	PORT: process.env.PORT ?? "8080",
};

configureWebPush(env);

const server = http.createServer(async (nodeRequest, nodeResponse) => {
	try {
		const chunks: Buffer[] = [];

		for await (const chunk of nodeRequest) {
			chunks.push(Buffer.from(chunk));
		}

		const body = Buffer.concat(chunks);

		const host = nodeRequest.headers.host ?? "127.0.0.1:8080";

		const url = new URL(
			nodeRequest.url ?? "/",
			`http://${host}`,
		);

		const headers = new Headers();

		for (const [key, value] of Object.entries(nodeRequest.headers)) {
			if (Array.isArray(value)) {
				headers.set(key, value.join(", "));
			} else if (value != null) {
				headers.set(key, value);
			}
		}

		const request = new Request(url, {
			method: nodeRequest.method ?? "GET",
			headers,
			body:
				nodeRequest.method === "GET" ||
				nodeRequest.method === "HEAD"
					? undefined
					: body,
		});

		console.log(
			"Incoming request:",
			nodeRequest.method,
			nodeRequest.url,
		);

		console.log("Calling router...");

		const response = await router.fetch(request, env);

		console.log("Router returned:", response.status);

		nodeResponse.statusCode = response.status;

		response.headers.forEach((value, key) => {
			nodeResponse.setHeader(key, value);
		});

		const responseBody = Buffer.from(
			await response.arrayBuffer(),
		);

		nodeResponse.end(responseBody);
	} catch (error) {
		console.error(error);

		nodeResponse.statusCode = 500;
		nodeResponse.setHeader("content-type", "application/json");
		nodeResponse.end(
			JSON.stringify({
				error: "Internal server error",
			}),
		);
	}
});

server.listen(Number(env.PORT), "0.0.0.0", () => {
	console.log(`Voyager listening on port ${env.PORT}`);
});