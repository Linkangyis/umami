CREATE TABLE "website_ip_rule" (
    "ip_rule_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "pattern" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "website_ip_rule_pkey" PRIMARY KEY ("ip_rule_id")
);

CREATE UNIQUE INDEX "website_ip_rule_website_id_pattern_key" ON "website_ip_rule"("website_id", "pattern");
CREATE INDEX "website_ip_rule_website_id_is_enabled_idx" ON "website_ip_rule"("website_id", "is_enabled");
