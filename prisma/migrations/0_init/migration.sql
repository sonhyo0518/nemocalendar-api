-- CreateTable
CREATE TABLE `anniversaries` (
    `idx` BIGINT NOT NULL AUTO_INCREMENT,
    `user_idx` BIGINT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `target_date` DATE NOT NULL,
    `is_dday` BOOLEAN NOT NULL DEFAULT true,
    `color` VARCHAR(32) NULL,

    INDEX `FK_anniversaries_users`(`user_idx`),
    PRIMARY KEY (`idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pins` (
    `idx` BIGINT NOT NULL AUTO_INCREMENT,
    `user_idx` BIGINT NOT NULL,
    `content` TEXT NOT NULL,
    `is_pinned` BOOLEAN NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `FK_pins_users`(`user_idx`),
    PRIMARY KEY (`idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `todos` (
    `idx` BIGINT NOT NULL AUTO_INCREMENT,
    `user_idx` BIGINT NOT NULL,
    `category_idx` BIGINT NULL,
    `content` TEXT NOT NULL,
    `target_date` DATE NOT NULL DEFAULT (curdate()),
    `is_completed` BOOLEAN NOT NULL DEFAULT false,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'todo',
    `priority` VARCHAR(10) NOT NULL DEFAULT 'medium',

    INDEX `FK_todos_users`(`user_idx`),
    INDEX `FK_todos_todo_categories`(`category_idx`),
    PRIMARY KEY (`idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `idx` BIGINT NOT NULL AUTO_INCREMENT,
    `google_id` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `location` VARCHAR(255) NULL,
    `profile_img_url` TEXT NULL,
    `banner_img_url` TEXT NULL,
    `google_refresh_token` TEXT NULL,
    `refresh_token_hash` VARCHAR(64) NULL,
    `refresh_prev_hash` VARCHAR(64) NULL,
    `refresh_family` VARCHAR(36) NULL,
    `refresh_rotated_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `theme_color` VARCHAR(7) NULL,

    UNIQUE INDEX `google_id`(`google_id`),
    UNIQUE INDEX `email`(`email`),
    PRIMARY KEY (`idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `todo_categories` (
    `idx` BIGINT NOT NULL AUTO_INCREMENT,
    `user_idx` BIGINT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(32) NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,

    INDEX `FK_todo_categories_users`(`user_idx`),
    PRIMARY KEY (`idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookmarks` (
    `idx` BIGINT NOT NULL AUTO_INCREMENT,
    `user_idx` BIGINT NOT NULL,
    `folder_idx` BIGINT NULL,
    `url` VARCHAR(2048) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `favicon_url` VARCHAR(2048) NULL,
    `preview_image_url` VARCHAR(2048) NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `FK_bookmarks_users`(`user_idx`),
    INDEX `IX_bookmarks_user_sequence`(`user_idx`, `sequence`),
    INDEX `FK_bookmarks_folders`(`folder_idx`),
    PRIMARY KEY (`idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookmark_folders` (
    `idx` BIGINT NOT NULL AUTO_INCREMENT,
    `user_idx` BIGINT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `FK_bookmark_folders_users`(`user_idx`),
    PRIMARY KEY (`idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `anniversaries` ADD CONSTRAINT `FK_anniversaries_users` FOREIGN KEY (`user_idx`) REFERENCES `users`(`idx`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pins` ADD CONSTRAINT `FK_pins_users` FOREIGN KEY (`user_idx`) REFERENCES `users`(`idx`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `todos` ADD CONSTRAINT `FK_todos_todo_categories` FOREIGN KEY (`category_idx`) REFERENCES `todo_categories`(`idx`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `todos` ADD CONSTRAINT `FK_todos_users` FOREIGN KEY (`user_idx`) REFERENCES `users`(`idx`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `todo_categories` ADD CONSTRAINT `FK_todo_categories_users` FOREIGN KEY (`user_idx`) REFERENCES `users`(`idx`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `bookmarks` ADD CONSTRAINT `FK_bookmarks_folders` FOREIGN KEY (`folder_idx`) REFERENCES `bookmark_folders`(`idx`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookmarks` ADD CONSTRAINT `FK_bookmarks_users` FOREIGN KEY (`user_idx`) REFERENCES `users`(`idx`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookmark_folders` ADD CONSTRAINT `FK_bookmark_folders_users` FOREIGN KEY (`user_idx`) REFERENCES `users`(`idx`) ON DELETE CASCADE ON UPDATE CASCADE;
