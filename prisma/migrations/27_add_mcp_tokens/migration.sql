CREATE TABLE "mcp_token" (
  "token_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "prefix" VARCHAR(24) NOT NULL,
  "website_ids" UUID[] NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  CONSTRAINT "mcp_token_pkey" PRIMARY KEY ("token_id")
);
CREATE UNIQUE INDEX "mcp_token_token_hash_key" ON "mcp_token"("token_hash");
CREATE INDEX "mcp_token_user_id_created_at_idx" ON "mcp_token"("user_id", "created_at");
