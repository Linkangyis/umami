CREATE TABLE "campaign_link" (
  "campaign_link_id" UUID NOT NULL,
  "website_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "destination_url" VARCHAR(2183) NOT NULL,
  "url" VARCHAR(2183) NOT NULL,
  "utm_source" VARCHAR(200) NOT NULL,
  "utm_medium" VARCHAR(200) NOT NULL DEFAULT '',
  "utm_campaign" VARCHAR(200) NOT NULL DEFAULT '',
  "utm_term" VARCHAR(200) NOT NULL DEFAULT '',
  "utm_content" VARCHAR(200) NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "campaign_link_pkey" PRIMARY KEY ("campaign_link_id")
);
CREATE INDEX "campaign_link_website_id_created_at_idx" ON "campaign_link"("website_id", "created_at");

CREATE TABLE "campaign_parameter" (
  "campaign_parameter_id" UUID NOT NULL,
  "website_id" UUID NOT NULL,
  "field" VARCHAR(20) NOT NULL,
  "value" VARCHAR(200) NOT NULL,
  "label" VARCHAR(100) NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "campaign_parameter_pkey" PRIMARY KEY ("campaign_parameter_id")
);
CREATE UNIQUE INDEX "campaign_parameter_website_id_field_value_key" ON "campaign_parameter"("website_id", "field", "value");
CREATE INDEX "campaign_parameter_website_id_field_idx" ON "campaign_parameter"("website_id", "field");
