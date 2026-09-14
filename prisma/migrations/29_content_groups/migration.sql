CREATE TABLE "content_group" (
  "content_group_id" UUID NOT NULL,
  "website_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "rules" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "content_group_pkey" PRIMARY KEY ("content_group_id"),
  CONSTRAINT "content_group_website_id_fkey" FOREIGN KEY ("website_id")
    REFERENCES "website"("website_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "content_group_website_id_created_at_idx" ON "content_group"("website_id", "created_at");
