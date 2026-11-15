-- Preserve source values without inventing a major-code lookup or relationship.
ALTER TABLE `user`
  ADD COLUMN `major_code` VARCHAR(50) NULL,
  ADD COLUMN `major_codes` VARCHAR(255) NULL;
