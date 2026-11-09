CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Workspace_sessionHash_key" ON "Workspace"("sessionHash");
ALTER TABLE "Study" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Interview" ADD COLUMN "participantWorkspaceId" TEXT;
