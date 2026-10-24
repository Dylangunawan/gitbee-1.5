/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `user` will be added. If there are existing duplicate values, this will fail.
    Find them before deploying (the default collation is case-insensitive, so this groups case variants too):
      SELECT email, COUNT(*) FROM `user` GROUP BY email HAVING COUNT(*) > 1;
    If it already failed (P3018/P3009), merge or delete the duplicates, then:
      prisma migrate resolve --rolled-back 20261025000733_unique_user_email
      prisma migrate deploy

*/
-- CreateIndex
CREATE UNIQUE INDEX `user_email_key` ON `user`(`email`);
