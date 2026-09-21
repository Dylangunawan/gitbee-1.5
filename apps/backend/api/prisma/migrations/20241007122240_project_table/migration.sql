-- CreateTable
CREATE TABLE `project` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lecturer_id` VARCHAR(50) NOT NULL,
    `student_leader_id` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_detail` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `semester_id` VARCHAR(100) NOT NULL,
    `course_id` VARCHAR(50) NOT NULL,
    `class` VARCHAR(20) NOT NULL,
    `link_submission` VARCHAR(255) NOT NULL,
    `documentation` VARCHAR(255) NOT NULL,
    `status_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,

    UNIQUE INDEX `project_detail_project_id_key`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_detail` ADD CONSTRAINT `project_detail_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
