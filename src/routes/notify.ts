import { Env } from "../index.js";
import { Buffer } from "buffer";
// @ts-ignore
import { getTokenFromGCPServiceAccount } from "@sagi.io/workers-jwt";
import {
	sendWebPush,
} from "../web_push.js";

interface PushGatewayResponse {
	rejected: string[]
};

export default {
	async notify(request: Request, env: Env): Promise<any> {
		console.log("=== PUSH NOTIFY ===");

		const rawBody = await request.text();
		console.log("Push request received");

		const content: any = JSON.parse(rawBody);
		var notification = content['notification']

		var eventId = notification['event_id']
		var roomId = notification['room_id']
		var devices = notification['devices']

		console.log(
			"Push devices:",
			JSON.stringify(
				devices.map((device: any) => ({
					pushkey: device?.pushkey,
					data: device?.data,
				}))
			)
		);

		var response: PushGatewayResponse = {
			rejected: []
		}

		for (var index in devices) {
			let device = devices[index]

			var type = "unified_push";
			var localUserId: string | null = null;

			if ("data" in device) {
				if ("type" in device["data"]) {
					type = device["data"]["type"]
				}

				if ("local_client_id" in device["data"]) {
					localUserId = device["data"]["local_client_id"];
				}
			}

			let key = device['pushkey']
			var result: PushGatewayResponse

			switch (type) {
				case "webpush":
					result = await this.notifyWebPush(
						eventId,
						roomId,
						key,
						localUserId,
						env,
					);
					break;
				case "fcm":
					result = await this.notifyFcm(eventId, roomId, key, localUserId, env)
					break;
				case "unified_push":
					result = await this.notifyUnifiedPush(eventId, roomId, key, localUserId)
					break;
				default:
					result = {
						rejected: []
					}
			}

			result.rejected.forEach(element => {
				response.rejected.push(element);
			});
		}

		console.log(
			"Push gateway response:",
			JSON.stringify(response)
		);

		return response
	},

	async notifyUnifiedPush(eventId: string, roomId: string, pushKey: string, localClientId: string | null): Promise<PushGatewayResponse> {

		var returnValue: PushGatewayResponse = {
			rejected: []
		}

		var url: URL;
		try {
			url = new URL(pushKey);
		} catch {
			console.log("Invalid url for unified push")
			returnValue.rejected.push(pushKey)
			return returnValue;
		}

		if (url.protocol != "https:") {
			console.log("Unified push key protocol was not https")
			returnValue.rejected.push(pushKey)
			return returnValue
		}

		var content: any = {
			"notification": {
				"event_id": eventId,
				"room_id": roomId,
			}
		}

		if (localClientId != null) {
			content = {
				"notification": {
					"event_id": eventId,
					"room_id": roomId,
					"local_client_id": localClientId
				}
			}
		}

		let result = await fetch(pushKey, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(content)
		})

		if (result.status != 200) {
			returnValue.rejected.push(pushKey)
		}

		return returnValue
	},

	async notifyWebPush(eventId: string, roomId: string, pushKey: string, localClientId: string | null, env: Env): Promise<PushGatewayResponse> {
		const result: PushGatewayResponse = {
			rejected: [],
		};

		const payload: any = {
			type: "matrix",
			event_id: eventId,
			room_id: roomId,
		};

		if (localClientId != null) {
			payload.local_client_id = localClientId;
		}

		const sent = await sendWebPush(
			env,
			pushKey,
			payload,
		);

		if (!sent) {
			result.rejected.push(pushKey);
		}

		return result;
	},

	async notifyFcm(eventId: string, roomId: string, userKey: string, localClientId: string | null, env: Env): Promise<PushGatewayResponse> {
		const decode = (str: string): string => Buffer.from(str, 'base64').toString('binary')
		var keyData = JSON.parse(decode(env.FIREBASE_KEY_B64));

		const jwtToken = await getTokenFromGCPServiceAccount({
			serviceAccountJSON: keyData,
			aud: "https://oauth2.googleapis.com/token",
			payloadAdditions: {
				scope: [
					"https://www.googleapis.com/auth/firebase.messaging",
				].join(" "),
			},
		});

		var response: any = await (
			await fetch("https://oauth2.googleapis.com/token", {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					assertion: jwtToken,
				}),
			})
		).json()

		let token = response['access_token']

		var data: any = {
			"event_id": eventId,
			"prio": "high",
			"room_id": roomId
		};

		if (localClientId != null) {
			data = {
				"event_id": eventId,
				"prio": "high",
				"room_id": roomId,
				"local_client_id": localClientId,
			};
		}

		response = await (
			await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
				method: 'POST',
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${token}`
				},
				body: JSON.stringify({
					"message": {
						"data": data,
						"token": userKey
					}
				})
			})).json()

		const fcmBody = await response.text();

		console.log(
			"FCM response:",
			JSON.stringify({
				status: response.status,
				ok: response.ok,
				body: fcmBody,
			})
		);

		let result: PushGatewayResponse = {
			rejected: [],
		};

		if (!response.ok) {
			result.rejected.push(userKey);
		}

		return result;
	}
};
