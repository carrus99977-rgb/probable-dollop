CREATE TABLE `categories` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `debt_tags` (
	`user_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `debt_id`, `tag_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`person_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`due` text NOT NULL,
	`purpose` text NOT NULL,
	`comment` text NOT NULL,
	`category_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_debts_user_person_currency` ON `debts` (`user_id`,`person_id`,`currency`);--> statement-breakpoint
CREATE TABLE `saved_filters` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`days` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`comment` text NOT NULL,
	`group_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_user_debt` ON `transactions` (`user_id`,`debt_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`nonce` text DEFAULT '' NOT NULL,
	`pin_hash` text,
	`pin_salt` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL
);
