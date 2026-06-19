-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "UrlStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'ERROR', 'CANCELLED');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlCheckItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "UrlStatus" NOT NULL DEFAULT 'PENDING',
    "httpStatus" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UrlCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "UrlCheckItem_jobId_idx" ON "UrlCheckItem"("jobId");

-- AddForeignKey
ALTER TABLE "UrlCheckItem" ADD CONSTRAINT "UrlCheckItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
