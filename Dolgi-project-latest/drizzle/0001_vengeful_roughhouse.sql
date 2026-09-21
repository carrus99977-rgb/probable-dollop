CREATE TABLE `cloud_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cloud_user_id` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
