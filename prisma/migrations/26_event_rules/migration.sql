CREATE TABLE "event_rule" (
    "event_rule_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "selector" VARCHAR(500) NOT NULL,
    "url_path" VARCHAR(2183) NOT NULL,
    "match_type" VARCHAR(10) NOT NULL,
    "event_type" VARCHAR(10) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "event_rule_pkey" PRIMARY KEY ("event_rule_id"),
    CONSTRAINT "event_rule_match_type_check" CHECK ("match_type" IN ('exact', 'prefix', 'all')),
    CONSTRAINT "event_rule_event_type_check" CHECK ("event_type" IN ('click', 'submit'))
);

CREATE INDEX "event_rule_website_id_is_enabled_idx" ON "event_rule"("website_id", "is_enabled");
