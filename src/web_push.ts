import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import webpush from "web-push";
import type { Env } from "./index.js";

export interface WebPushSubscription {
	pushkey: string;
	endpoint: string;
	p256dh: string;
	auth: string;
}

let database: DatabaseSync | null = null;

function getDatabase(env: Env): DatabaseSync {
	if (database != null) {
		return database;
	}

	mkdirSync(dirname(env.DATABASE_PATH), {
		recursive: true,
	});

	database = new DatabaseSync(env.DATABASE_PATH);

	database.exec(`
		PRAGMA journal_mode = WAL;

		CREATE TABLE IF NOT EXISTS web_push_subscriptions (
			pushkey TEXT PRIMARY KEY,
			endpoint TEXT NOT NULL UNIQUE,
			p256dh TEXT NOT NULL,
			auth TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_web_push_endpoint
		ON web_push_subscriptions(endpoint);
	`);

	return database;
}

export function configureWebPush(env: Env): void {
	webpush.setVapidDetails(
		env.VAPID_SUBJECT,
		env.VAPID_PUBLIC_KEY,
		env.VAPID_PRIVATE_KEY,
	);
}

export function getPublicKey(env: Env): string {
	return env.VAPID_PUBLIC_KEY;
}

export function registerSubscription(
	env: Env,
	endpoint: string,
	p256dh: string,
	auth: string,
): string {
	const db = getDatabase(env);

	const existing = db
		.prepare(
			`
			SELECT pushkey
			FROM web_push_subscriptions
			WHERE endpoint = ?
			`,
		)
		.get(endpoint) as { pushkey?: string } | undefined;

	const now = Math.floor(Date.now() / 1000);

	if (existing?.pushkey != null) {
		db.prepare(
			`
			UPDATE web_push_subscriptions
			SET p256dh = ?, auth = ?, updated_at = ?
			WHERE pushkey = ?
			`,
		).run(
			p256dh,
			auth,
			now,
			existing.pushkey,
		);

		return existing.pushkey;
	}

	const pushkey = `web:${randomUUID()}`;

	db.prepare(
		`
		INSERT INTO web_push_subscriptions
		(pushkey, endpoint, p256dh, auth, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		`,
	).run(
		pushkey,
		endpoint,
		p256dh,
		auth,
		now,
		now,
	);

	return pushkey;
}

export function deleteSubscription(
	env: Env,
	pushkey: string,
): void {
	const db = getDatabase(env);

	db.prepare(
		`
		DELETE FROM web_push_subscriptions
		WHERE pushkey = ?
		`,
	).run(pushkey);
}

export function getSubscription(
	env: Env,
	pushkey: string,
): WebPushSubscription | null {
	const db = getDatabase(env);

	const row = db
		.prepare(
			`
			SELECT pushkey, endpoint, p256dh, auth
			FROM web_push_subscriptions
			WHERE pushkey = ?
			`,
		)
		.get(pushkey) as WebPushSubscription | undefined;

	return row ?? null;
}

export async function sendWebPush(
	env: Env,
	pushkey: string,
	payload: object,
): Promise<boolean> {
	const subscription = getSubscription(env, pushkey);

	if (subscription == null) {
		return false;
	}

	try {
		await webpush.sendNotification(
			{
				endpoint: subscription.endpoint,
				keys: {
					p256dh: subscription.p256dh,
					auth: subscription.auth,
				},
			},
			JSON.stringify(payload),
			{
				TTL: 60,
				urgency: "high",
			},
		);

		return true;
	} catch (error: any) {
		const statusCode = error?.statusCode;

		console.error(
			`Web Push failed for ${pushkey}:`,
			statusCode,
			error?.body ?? error,
		);

		if (statusCode === 404 || statusCode === 410) {
			deleteSubscription(env, pushkey);
		}

		return false;
	}
}